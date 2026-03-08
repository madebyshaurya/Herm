#!/usr/bin/env python3
"""
Herm Camera Service — Multi-camera capture, ONNX plate detection, MJPEG streaming.

Runs as a child process managed by the Node.js orchestrator.
Communicates via:
  - HTTP API on port 8081 (MJPEG streams, health, config)
  - POSTs detected plates to Node.js at http://localhost:3000/api/plates

Usage:
  python3 camera_service.py [--port 8081] [--node-url http://localhost:3000]
"""

import argparse
import base64
import json
import logging
import os
import signal
import sys
import threading
import time
from io import BytesIO

try:
    import cv2
except ImportError:
    print("ERROR: opencv not installed. Run: sudo apt-get install -y python3-opencv", file=sys.stderr)
    sys.exit(1)

try:
    import numpy as np
except ImportError:
    print("ERROR: numpy not installed. Run: sudo apt-get install -y python3-numpy", file=sys.stderr)
    sys.exit(1)

try:
    import onnxruntime as ort
except ImportError:
    ort = None

try:
    from picamera2 import Picamera2
except ImportError:
    Picamera2 = None

try:
    from flask import Flask, Response, jsonify, request as flask_request
except ImportError:
    Flask = None

try:
    import yaml
except ImportError:
    yaml = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("herm-camera")

# ---------------------------------------------------------------------------
# Camera abstraction
# ---------------------------------------------------------------------------

class Camera:
    """Base camera interface."""

    def __init__(self, camera_id, name="camera"):
        self.camera_id = camera_id
        self.name = name
        self.width = 640
        self.height = 480
        self.fps = 15
        self.running = False
        self.frame = None
        self.frame_lock = threading.Lock()
        self.frame_count = 0
        self.last_frame_time = 0.0

    def start(self):
        raise NotImplementedError

    def stop(self):
        raise NotImplementedError

    def get_frame(self):
        with self.frame_lock:
            return self.frame

    def get_jpeg(self, quality=80):
        frame = self.get_frame()
        if frame is None:
            return None
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return buf.tobytes()


class USBCamera(Camera):
    """USB camera via OpenCV VideoCapture."""

    def __init__(self, device_path, name="usb"):
        super().__init__(device_path, name)
        self.device_path = device_path
        self._cap = None
        self._thread = None

    def start(self):
        dev = self.device_path
        if isinstance(dev, str) and dev.startswith("/dev/video"):
            dev = int(dev.replace("/dev/video", ""))
        self._cap = cv2.VideoCapture(dev)
        if not self._cap.isOpened():
            raise RuntimeError(f"Cannot open USB camera {self.device_path}")
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self._cap.set(cv2.CAP_PROP_FPS, self.fps)
        self.running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        log.info(f"USB camera started: {self.device_path}")

    def _capture_loop(self):
        while self.running:
            ret, frame = self._cap.read()
            if ret:
                with self.frame_lock:
                    self.frame = frame
                    self.frame_count += 1
                    self.last_frame_time = time.time()
            else:
                time.sleep(0.01)

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=3)
        if self._cap:
            self._cap.release()
        log.info(f"USB camera stopped: {self.device_path}")


class CSICamera(Camera):
    """CSI camera via picamera2."""

    def __init__(self, camera_num=0, name="csi"):
        super().__init__(camera_num, name)
        self.camera_num = camera_num
        self._picam = None
        self._thread = None

    def start(self):
        if Picamera2 is None:
            raise RuntimeError("picamera2 not installed")
        self._picam = Picamera2(self.camera_num)
        config = self._picam.create_still_configuration(
            main={"size": (self.width, self.height), "format": "RGB888"}
        )
        self._picam.configure(config)
        self._picam.start()
        self.running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        log.info(f"CSI camera started: camera {self.camera_num}")

    def _capture_loop(self):
        while self.running:
            try:
                frame = self._picam.capture_array()
                frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                with self.frame_lock:
                    self.frame = frame_bgr
                    self.frame_count += 1
                    self.last_frame_time = time.time()
            except Exception as e:
                log.warning(f"CSI capture error: {e}")
                time.sleep(0.1)

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=3)
        if self._picam:
            self._picam.stop()
            self._picam.close()
        log.info(f"CSI camera stopped: camera {self.camera_num}")


class CameraManager:
    """Manages multiple cameras with comprehensive hardware detection."""

    def __init__(self):
        self.cameras = {}

    def add(self, role, camera):
        self.cameras[role] = camera

    def start_all(self):
        for role, cam in self.cameras.items():
            try:
                cam.start()
            except Exception as e:
                log.error(f"Failed to start {role} camera: {e}")

    def stop_all(self):
        for cam in self.cameras.values():
            try:
                cam.stop()
            except Exception as e:
                log.warning(f"Error stopping camera: {e}")

    def get(self, role):
        return self.cameras.get(role)

    def reassign(self, old_role, new_role):
        """Reassign a camera from old_role to new_role. Returns True on success."""
        if old_role not in self.cameras:
            return False
        if new_role in self.cameras and new_role != old_role:
            # Swap roles
            self.cameras[old_role], self.cameras[new_role] = self.cameras[new_role], self.cameras[old_role]
        else:
            self.cameras[new_role] = self.cameras.pop(old_role)
        return True

    def list_cameras(self):
        """Return detailed info for each camera, keyed by role."""
        result = {}
        for role, cam in self.cameras.items():
            result[role] = {
                "role": role,
                "name": cam.name,
                "running": cam.running,
                "frameCount": cam.frame_count,
                "lastFrameTime": cam.last_frame_time,
                "resolution": f"{cam.width}x{cam.height}",
                "type": getattr(cam, "_cam_type", "unknown"),
                "device": getattr(cam, "device_path", None) or getattr(cam, "camera_num", None),
            }
        return result

    def status(self):
        return {
            role: {
                "running": cam.running,
                "frameCount": cam.frame_count,
                "lastFrameTime": cam.last_frame_time,
                "resolution": f"{cam.width}x{cam.height}",
                "type": getattr(cam, '_cam_type', 'unknown'),
            }
            for role, cam in self.cameras.items()
        }

    def _get_v4l2_info(self, dev_path):
        """Get V4L2 device info to check if it's a real camera."""
        import subprocess
        try:
            result = subprocess.run(
                ["v4l2-ctl", f"--device={dev_path}", "--all"],
                capture_output=True, text=True, timeout=3
            )
            info = result.stdout
        except Exception:
            return None

        if "Video Capture" not in info:
            return None

        driver = ""
        card = ""
        bus = ""
        for line in info.split("\n"):
            if "Driver name" in line:
                driver = line.split(":", 1)[1].strip()
            elif "Card type" in line:
                card = line.split(":", 1)[1].strip()
            elif "Bus info" in line:
                bus = line.split(":", 1)[1].strip()

        # Filter out non-camera devices
        non_camera_drivers = {"bcm2835-codec", "bcm2835-isp", "vivid"}
        non_camera_cards = {"bcm2835-codec", "bcm2835-isp", "simcom", "qmi_wwan"}

        if driver in non_camera_drivers:
            return None
        if any(nc in card.lower() for nc in non_camera_cards):
            return None

        return {"driver": driver, "card": card, "bus": bus}

    def _scan_i2c_cameras(self):
        """Detect cameras on I2C bus (ArduCam, OV5647, etc.)."""
        import subprocess
        known_addrs = {
            0x10: "OV5647",
            0x1a: "IMX219",
            0x36: "IMX477",
            0x3c: "ArduCam/OV2640",
            0x21: "OV5640",
            0x30: "OV7670",
        }
        found = []
        for bus in [0, 1, 10]:
            try:
                result = subprocess.run(
                    ["i2cdetect", "-y", str(bus)],
                    capture_output=True, text=True, timeout=3
                )
                for addr, name in known_addrs.items():
                    addr_hex = f"{addr:02x}"
                    if addr_hex in result.stdout:
                        found.append({"bus": bus, "addr": addr, "model": name})
                        log.info(f"I2C camera detected: {name} at bus {bus} addr 0x{addr_hex}")
            except Exception:
                continue
        return found

    def auto_detect(self):
        """Auto-detect and add all available cameras with proper filtering."""
        import subprocess
        csi_claimed = set()

        # ── Phase 1: CSI cameras via picamera2 ──
        if Picamera2 is not None:
            try:
                cams = Picamera2.global_camera_info()
                for i, info in enumerate(cams):
                    role = "front" if i == 0 else f"csi-{i}"
                    cam = CSICamera(i, name=info.get("Model", f"CSI-{i}"))
                    cam._cam_type = "csi"
                    self.add(role, cam)
                    log.info(f"CSI camera {i}: {info.get('Model', 'unknown')} "
                             f"(location={info.get('Location', '?')}, rotation={info.get('Rotation', 0)})")
                    # Track V4L2 paths claimed by CSI so we don't double-count
                    if info.get("Id"):
                        csi_claimed.add(info["Id"])
            except Exception as e:
                log.warning(f"CSI detection (picamera2) failed: {e}")

        # ── Phase 1b: libcamera fallback ──
        if not csi_claimed:
            try:
                result = subprocess.run(
                    ["libcamera-hello", "--list-cameras"],
                    capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.split("\n"):
                    m = __import__("re").match(r"^(\d+)\s*:\s*(\S+)", line)
                    if m:
                        idx = int(m.group(1))
                        model = m.group(2)
                        role = "front" if idx == 0 else f"csi-{idx}"
                        cam = CSICamera(idx, name=model)
                        cam._cam_type = "csi-libcamera"
                        self.add(role, cam)
                        log.info(f"CSI camera {idx} (libcamera): {model}")
            except Exception:
                pass

        # ── Phase 1c: legacy raspivid check ──
        if not self.cameras:
            try:
                result = subprocess.run(
                    ["vcgencmd", "get_camera"],
                    capture_output=True, text=True, timeout=3
                )
                if "detected=1" in result.stdout:
                    cam = CSICamera(0, name="legacy-raspicam")
                    cam._cam_type = "csi-legacy"
                    self.add("front", cam)
                    log.info("Legacy CSI camera detected via vcgencmd")
            except Exception:
                pass

        # ── Phase 2: USB cameras via V4L2 (filtered) ──
        import glob as globmod
        video_devices = sorted(globmod.glob("/dev/video*"))

        for dev in video_devices:
            # Skip devices already claimed by CSI
            if dev in csi_claimed:
                continue

            info = self._get_v4l2_info(dev)
            if info is None:
                continue

            # Assign role: first USB cam after any CSI → "rear"
            if "front" in self.cameras and "rear" not in self.cameras:
                role = "rear"
            elif "front" not in self.cameras:
                role = "front"
            else:
                dev_idx = dev.replace("/dev/video", "")
                role = f"usb-{dev_idx}"

            cam = USBCamera(dev, name=info["card"] or f"USB-{dev}")
            cam._cam_type = f"usb-{info['driver']}"
            self.add(role, cam)
            log.info(f"USB camera: {dev} ({info['card']}) driver={info['driver']} bus={info['bus']} -> {role}")

        # ── Phase 3: I2C camera scan (informational) ──
        i2c_cams = self._scan_i2c_cameras()
        if i2c_cams and not self.cameras:
            log.warning(f"I2C cameras found ({', '.join(c['model'] for c in i2c_cams)}) "
                        f"but no V4L2 devices — check CSI cable or enable camera in raspi-config")

        # ── Summary ──
        if self.cameras:
            log.info(f"Camera summary: {len(self.cameras)} camera(s) — "
                     f"{', '.join(f'{r}={c.name}({getattr(c, \"_cam_type\", \"?\")})' for r, c in self.cameras.items())}")
        else:
            log.warning("No cameras detected. Check connections:")
            log.warning("  CSI: ribbon cable seated firmly, camera enabled in raspi-config")
            log.warning("  USB: try 'lsusb' to verify device visible")
            if i2c_cams:
                log.warning(f"  I2C: {len(i2c_cams)} camera(s) on I2C but not appearing as V4L2 — enable camera interface")


# ---------------------------------------------------------------------------
# Plate Detection (ONNX)
# ---------------------------------------------------------------------------

class PlateDetector:
    """License plate detection + OCR using ONNX models."""

    PLATE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_"

    def __init__(self, models_dir=None):
        self.models_dir = models_dir or os.path.join(os.path.dirname(__file__), "models")
        self.det_session = None
        self.ocr_session = None
        self.det_input_size = (640, 640)
        self.ocr_input_size = (64, 128)  # from config: height=64, width=128
        self.confidence_threshold = 0.4
        self.nms_threshold = 0.45
        self.max_slots = 9  # from config
        self.enabled = False
        self.detections_total = 0

    def load(self):
        if ort is None:
            log.warning("onnxruntime not installed — plate detection disabled")
            return False

        det_path = os.path.join(self.models_dir, "license-plate-finetune-v1n.onnx")
        ocr_path = os.path.join(self.models_dir, "cct_xs_v1_global.onnx")

        if not os.path.exists(det_path) or not os.path.exists(ocr_path):
            log.warning(f"ONNX models not found in {self.models_dir} — plate detection disabled")
            return False

        try:
            self.det_session = ort.InferenceSession(det_path, providers=["CPUExecutionProvider"])
            self.ocr_session = ort.InferenceSession(ocr_path, providers=["CPUExecutionProvider"])
            self.enabled = True
            log.info("Plate detection models loaded")
            return True
        except Exception as e:
            log.error(f"Failed to load ONNX models: {e}")
            return False

    def detect(self, frame):
        """Run plate detection + OCR on a frame. Returns list of {plate, confidence, bbox}."""
        if not self.enabled or frame is None:
            return []

        # Preprocess for YOLOv8 detection
        h, w = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(
            frame, 1.0 / 255.0, self.det_input_size, swapRB=True, crop=False
        )

        # Run detection
        det_input = self.det_session.get_inputs()[0].name
        det_output = self.det_session.run(None, {det_input: blob})[0]

        # Parse YOLOv8 output: (1, 5, N) -> transpose to (N, 5)
        preds = det_output[0].T  # (N, 5) = [cx, cy, w, h, conf]

        # Filter by confidence
        mask = preds[:, 4] > self.confidence_threshold
        preds = preds[mask]

        if len(preds) == 0:
            return []

        # Convert to x1, y1, x2, y2
        boxes = np.zeros_like(preds[:, :4])
        boxes[:, 0] = preds[:, 0] - preds[:, 2] / 2  # x1
        boxes[:, 1] = preds[:, 1] - preds[:, 3] / 2  # y1
        boxes[:, 2] = preds[:, 0] + preds[:, 2] / 2  # x2
        boxes[:, 3] = preds[:, 1] + preds[:, 3] / 2  # y2
        scores = preds[:, 4]

        # NMS
        indices = cv2.dnn.NMSBoxes(
            boxes.tolist(), scores.tolist(), self.confidence_threshold, self.nms_threshold
        )

        results = []
        scale_x = w / self.det_input_size[0]
        scale_y = h / self.det_input_size[1]

        for i in (indices.flatten() if len(indices) > 0 else []):
            x1 = int(boxes[i, 0] * scale_x)
            y1 = int(boxes[i, 1] * scale_y)
            x2 = int(boxes[i, 2] * scale_x)
            y2 = int(boxes[i, 3] * scale_y)

            # Clamp
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if x2 - x1 < 10 or y2 - y1 < 5:
                continue

            # Crop and OCR
            plate_crop = frame[y1:y2, x1:x2]
            plate_text = self._ocr(plate_crop)

            if plate_text:
                self.detections_total += 1
                results.append({
                    "plate": plate_text,
                    "confidence": float(scores[i]),
                    "bbox": [x1, y1, x2, y2],
                })

        return results

    def _ocr(self, crop):
        """Run OCR on a cropped plate image."""
        if self.ocr_session is None:
            return None

        # Preprocess: resize to model input, RGB, normalize
        resized = cv2.resize(crop, (self.ocr_input_size[1], self.ocr_input_size[0]))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        blob = rgb.astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))  # CHW
        blob = np.expand_dims(blob, 0)  # NCHW

        # Run OCR
        ocr_input = self.ocr_session.get_inputs()[0].name
        output = self.ocr_session.run(None, {ocr_input: blob})[0]  # (1, slots, alphabet_size)

        # Decode: argmax per slot
        chars = []
        for slot in range(min(output.shape[1], self.max_slots)):
            idx = np.argmax(output[0, slot])
            if idx < len(self.PLATE_ALPHABET):
                ch = self.PLATE_ALPHABET[idx]
                if ch != "_":
                    chars.append(ch)

        return "".join(chars) if len(chars) >= 3 else None

    def draw_detections(self, frame, detections):
        """Draw bounding boxes on frame. Red = stolen match, green = normal plate."""
        annotated = frame.copy()
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            is_stolen = det.get("stolen", False)
            color = (0, 0, 255) if is_stolen else (0, 255, 0)  # BGR: red for stolen, green for normal
            thickness = 3 if is_stolen else 2

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, thickness)

            label = f"{det['plate']} {det['confidence']:.0%}"
            if is_stolen:
                label = f"STOLEN {label}"

            # Background for text readability
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(annotated, (x1, y1 - th - 12), (x1 + tw + 4, y1), color, -1)
            cv2.putText(annotated, label, (x1 + 2, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        return annotated


# ---------------------------------------------------------------------------
# Detection Pipeline
# ---------------------------------------------------------------------------

class DetectionPipeline:
    """Runs plate detection on camera frames and reports to Node.js."""

    def __init__(self, camera_manager, detector, node_url="http://localhost:3000"):
        self.camera_manager = camera_manager
        self.detector = detector
        self.node_url = node_url
        self.running = False
        self._thread = None
        self.detection_interval = 0.5  # run detection every 500ms
        self.last_detections = {}  # per-camera last detections
        self.local_api_token = os.environ.get("HERM_LOCAL_API_TOKEN", "")
        # Dedup: don't re-report same plate within this window
        self._seen_plates = {}
        self._dedup_window = 30  # seconds

    def start(self):
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        log.info("Detection pipeline started")

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _loop(self):
        while self.running:
            for role, cam in self.camera_manager.cameras.items():
                if not cam.running:
                    continue
                frame = cam.get_frame()
                if frame is None:
                    continue

                detections = self.detector.detect(frame)
                self.last_detections[role] = detections

                # Report new plates
                for det in detections:
                    plate = det["plate"]
                    now = time.time()

                    # Dedup check
                    if plate in self._seen_plates and now - self._seen_plates[plate] < self._dedup_window:
                        continue
                    self._seen_plates[plate] = now

                    # Get snapshot
                    jpeg = cam.get_jpeg(quality=85)
                    snapshot_b64 = base64.b64encode(jpeg).decode() if jpeg else None

                    self._report_plate(plate, det["confidence"], snapshot_b64)

                # Prune dedup cache
                cutoff = time.time() - self._dedup_window * 2
                self._seen_plates = {k: v for k, v in self._seen_plates.items() if v > cutoff}

            time.sleep(self.detection_interval)

    def _report_plate(self, plate, confidence, snapshot_b64=None):
        """POST plate detection to Node.js runtime."""
        import urllib.request

        payload = {
            "plates": [plate],
            "confidenceByPlate": {plate: confidence},
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        }
        if snapshot_b64:
            payload["snapshotBase64"] = snapshot_b64
            payload["snapshotMimeType"] = "image/jpeg"

        try:
            data = json.dumps(payload).encode()
            headers = {"Content-Type": "application/json"}
            if self.local_api_token:
                headers["Authorization"] = f"Bearer {self.local_api_token}"
            req = urllib.request.Request(
                f"{self.node_url}/api/plates", data=data, headers=headers, method="POST"
            )
            urllib.request.urlopen(req, timeout=5)
            log.info(f"Plate reported: {plate} (conf={confidence:.2f})")
        except Exception as e:
            log.warning(f"Failed to report plate {plate}: {e}")


# ---------------------------------------------------------------------------
# HTTP Server (MJPEG streaming + API)
# ---------------------------------------------------------------------------

def create_app(camera_manager, detector, pipeline):
    """Create Flask app for MJPEG streaming and API."""
    if Flask is None:
        log.error("Flask not installed — HTTP server disabled")
        return None

    app = Flask(__name__)

    def generate_mjpeg(camera):
        while True:
            jpeg = camera.get_jpeg(quality=70)
            if jpeg:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
            time.sleep(1.0 / camera.fps)

    def generate_annotated_mjpeg(camera, role):
        """MJPEG stream with plate detection bounding boxes overlaid."""
        while True:
            frame = camera.get_frame()
            if frame is not None:
                # Draw plate detections on frame
                detections = pipeline.last_detections.get(role, [])
                if detections:
                    annotated = detector.draw_detections(frame, detections)
                else:
                    annotated = frame
                _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])
                jpeg = buf.tobytes()
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
            time.sleep(1.0 / camera.fps)

    @app.route("/stream/<role>")
    def stream(role):
        cam = camera_manager.get(role)
        if not cam or not cam.running:
            return jsonify({"error": f"Camera '{role}' not available"}), 404
        return Response(
            generate_mjpeg(cam),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )

    @app.route("/stream/<role>/annotated")
    def stream_annotated(role):
        """MJPEG stream with plate detection overlays (bounding boxes + plate text)."""
        cam = camera_manager.get(role)
        if not cam or not cam.running:
            return jsonify({"error": f"Camera '{role}' not available"}), 404
        return Response(
            generate_annotated_mjpeg(cam, role),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )

    @app.route("/snapshot/<role>")
    def snapshot(role):
        cam = camera_manager.get(role)
        if not cam or not cam.running:
            return jsonify({"error": f"Camera '{role}' not available"}), 404
        jpeg = cam.get_jpeg(quality=90)
        if not jpeg:
            return jsonify({"error": "No frame available"}), 503
        return Response(jpeg, mimetype="image/jpeg")

    @app.route("/health")
    def health():
        return jsonify({
            "ok": True,
            "cameras": camera_manager.status(),
            "cameraCount": len(camera_manager.cameras),
            "roles": list(camera_manager.cameras.keys()),
            "detection": {
                "enabled": detector.enabled,
                "totalDetections": detector.detections_total,
                "lastDetections": pipeline.last_detections,
                "confidenceThreshold": detector.confidence_threshold,
            },
        })

    @app.route("/cameras")
    def list_cameras():
        """List all detected cameras with their roles and status."""
        return jsonify({
            "ok": True,
            "cameras": camera_manager.list_cameras(),
            "count": len(camera_manager.cameras),
        })

    @app.route("/cameras/assign", methods=["POST"])
    def assign_camera_role():
        """Reassign a camera's role. Body: { "from": "usb-0", "to": "front" }"""
        data = flask_request.get_json(silent=True) or {}
        old_role = data.get("from")
        new_role = data.get("to")
        if not old_role or not new_role:
            return jsonify({"error": "Provide 'from' and 'to' role names"}), 400
        if old_role not in camera_manager.cameras:
            return jsonify({"error": f"No camera with role '{old_role}'"}), 404
        camera_manager.reassign(old_role, new_role)
        log.info(f"Camera role reassigned: {old_role} -> {new_role}")
        return jsonify({"ok": True, "cameras": camera_manager.list_cameras()})

    @app.route("/cameras/rescan", methods=["POST"])
    def rescan_cameras():
        """Re-detect cameras (for hot-plugging USB cameras)."""
        old_count = len(camera_manager.cameras)
        camera_manager.auto_detect()
        new_cameras = len(camera_manager.cameras) - old_count
        if new_cameras > 0:
            camera_manager.start_all()
        return jsonify({
            "ok": True,
            "cameras": camera_manager.list_cameras(),
            "newCameras": new_cameras,
        })

    @app.route("/config", methods=["GET", "POST"])
    def config():
        if flask_request.method == "GET":
            return jsonify({
                "detectionInterval": pipeline.detection_interval,
                "confidenceThreshold": detector.confidence_threshold,
                "dedupWindow": pipeline._dedup_window,
            })
        data = flask_request.get_json(silent=True) or {}
        if "detectionInterval" in data:
            pipeline.detection_interval = max(0.1, float(data["detectionInterval"]))
        if "confidenceThreshold" in data:
            detector.confidence_threshold = max(0.1, min(0.99, float(data["confidenceThreshold"])))
        if "dedupWindow" in data:
            pipeline._dedup_window = max(5, int(data["dedupWindow"]))
        return jsonify({"ok": True})

    return app


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Herm Camera Service")
    parser.add_argument("--port", type=int, default=int(os.environ.get("HERM_CAMERA_PORT", "8081")))
    parser.add_argument("--node-url", default=os.environ.get("HERM_NODE_URL", "http://localhost:3000"))
    parser.add_argument("--models-dir", default=os.environ.get("HERM_MODELS_DIR", os.path.join(os.path.dirname(__file__), "models")))
    parser.add_argument("--no-detect", action="store_true", help="Disable plate detection")
    args = parser.parse_args()

    log.info(f"Herm Camera Service starting on port {args.port}")

    # Setup cameras
    cam_manager = CameraManager()
    cam_manager.auto_detect()

    if not cam_manager.cameras:
        log.warning("No cameras detected on startup — will keep scanning periodically.")

    cam_manager.start_all()

    # Background thread to re-scan for newly connected cameras
    def camera_rescan_loop():
        while True:
            time.sleep(15)
            if cam_manager.cameras:
                continue
            log.info("Re-scanning for cameras...")
            cam_manager.auto_detect()
            if cam_manager.cameras:
                cam_manager.start_all()
                log.info(f"Found {len(cam_manager.cameras)} camera(s) on rescan!")
                if detector.enabled and not pipeline.running:
                    pipeline.start()

    rescan_thread = threading.Thread(target=camera_rescan_loop, daemon=True)
    rescan_thread.start()

    # Setup plate detection
    detector = PlateDetector(models_dir=args.models_dir)
    if not args.no_detect:
        detector.load()

    # Setup detection pipeline
    pipeline = DetectionPipeline(cam_manager, detector, node_url=args.node_url)
    if detector.enabled:
        pipeline.start()

    # Setup HTTP server
    app = create_app(cam_manager, detector, pipeline)

    def shutdown(sig, frame):
        log.info("Shutting down...")
        pipeline.stop()
        cam_manager.stop_all()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    if app:
        log.info(f"MJPEG streaming on http://0.0.0.0:{args.port}/stream/<role>")
        app.run(host="0.0.0.0", port=args.port, threaded=True)
    else:
        # No Flask — just run detection loop
        log.info("Running in headless mode (no HTTP server)")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            shutdown(None, None)


if __name__ == "__main__":
    main()
