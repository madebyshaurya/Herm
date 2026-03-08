#!/bin/bash
# Setup script for plate_watch on Raspberry Pi
# Installs dependencies, downloads models, and compiles the binary
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/models"
BUILD_DIR="$SCRIPT_DIR/build"

echo "╔══════════════════════════════════════════╗"
echo "║  Herm plate_watch Setup                  ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. Install system dependencies ──────────────────────────────────────────
echo ""
echo "▸ Installing build tools and libraries..."
sudo apt update -qq
sudo apt install -y -qq g++ cmake build-essential libopencv-dev libtesseract-dev tesseract-ocr libleptonica-dev

# ── 2. Install ONNX Runtime (aarch64) ──────────────────────────────────────
ONNX_VERSION="1.17.3"
ONNX_DIR="/usr/local/include/onnxruntime"

if [ ! -d "$ONNX_DIR" ]; then
  echo ""
  echo "▸ Installing ONNX Runtime ${ONNX_VERSION}..."
  cd /tmp
  wget -q "https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_VERSION}/onnxruntime-linux-aarch64-${ONNX_VERSION}.tgz"
  tar -xzf "onnxruntime-linux-aarch64-${ONNX_VERSION}.tgz"
  sudo cp -r "onnxruntime-linux-aarch64-${ONNX_VERSION}/include/"* /usr/local/include/
  sudo cp -r "onnxruntime-linux-aarch64-${ONNX_VERSION}/lib/"* /usr/local/lib/
  sudo ldconfig
  rm -rf "onnxruntime-linux-aarch64-${ONNX_VERSION}" "onnxruntime-linux-aarch64-${ONNX_VERSION}.tgz"
  echo "  ✓ ONNX Runtime installed"
else
  echo "  ✓ ONNX Runtime already installed"
fi

# ── 3. Download ONNX models ────────────────────────────────────────────────
echo ""
echo "▸ Setting up models directory..."
mkdir -p "$MODELS_DIR"

# License plate detection model
if [ ! -f "$MODELS_DIR/license-plate-finetune-v1n.onnx" ]; then
  echo "  Downloading license plate detection model..."
  # Try GitHub release first, fallback to placeholder
  if ! wget -q -O "$MODELS_DIR/license-plate-finetune-v1n.onnx" \
    "https://github.com/madebyshaurya/Herm/releases/download/models-v1/license-plate-finetune-v1n.onnx" 2>/dev/null; then
    echo "  ⚠ Could not download detection model automatically."
    echo "  Place 'license-plate-finetune-v1n.onnx' in $MODELS_DIR"
  else
    echo "  ✓ Detection model downloaded"
  fi
else
  echo "  ✓ Detection model exists"
fi

# OCR model
if [ ! -f "$MODELS_DIR/cct_xs_v1_global.onnx" ]; then
  echo "  Downloading OCR model..."
  if ! wget -q -O "$MODELS_DIR/cct_xs_v1_global.onnx" \
    "https://github.com/madebyshaurya/Herm/releases/download/models-v1/cct_xs_v1_global.onnx" 2>/dev/null; then
    echo "  ⚠ Could not download OCR model automatically."
    echo "  Place 'cct_xs_v1_global.onnx' in $MODELS_DIR"
  else
    echo "  ✓ OCR model downloaded"
  fi
else
  echo "  ✓ OCR model exists"
fi

# ── 4. Compile plate_watch ─────────────────────────────────────────────────
echo ""
echo "▸ Compiling plate_watch..."
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"
cmake "$SCRIPT_DIR" -DCMAKE_BUILD_TYPE=Release 2>&1 | tail -5
make -j$(nproc) 2>&1 | tail -10

if [ -f "$BUILD_DIR/plate_watch" ]; then
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  ✓ plate_watch compiled successfully!    ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "Binary: $BUILD_DIR/plate_watch"
  echo ""
  echo "Restart the runtime to activate plate detection:"
  echo "  sudo systemctl restart herm-runtime"
else
  echo ""
  echo "✗ Compilation failed. Check errors above."
  exit 1
fi
