#include <onnxruntime_cxx_api.h>
#include <opencv2/opencv.hpp>
#include <tesseract/baseapi.h>
#include <leptonica/allheaders.h>
#include <iostream>
#include <vector>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <deque>
#include <mutex>
#include <thread>
#include <atomic>
#include <chrono>
#include <ctime>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <signal.h>

#ifdef __APPLE__
  #define SET_NOSIGPIPE(fd) do { int _one = 1; setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &_one, sizeof(_one)); } while(0)
#else
  #define SET_NOSIGPIPE(fd) (void)0
#endif

using namespace cv;
using namespace std;
#define SIZE 640

// Shared frame file path — Node.js reads this for Supabase Realtime relay
static const char* FRAME_OUTPUT_PATH = "/tmp/herm-latest-frame.jpg";
static const char* FRAME_TEMP_PATH  = "/tmp/herm-latest-frame.tmp.jpg";

// ─────────────────────────────────────────────────────────────────────────────
//  Shared state between capture thread and web server
// ─────────────────────────────────────────────────────────────────────────────

struct PlateRecord {
    std::string text;
    std::string timestamp;
    int         confidence_pct;
};

std::mutex              g_frameMutex;
std::vector<uchar>      g_jpegFrame;

std::mutex              g_plateMutex;
std::deque<PlateRecord> g_plates;
const int               MAX_PLATE_LOG = 50;

std::atomic<bool>       g_running{true};

static std::string nowString() {
    auto now  = std::chrono::system_clock::now();
    auto tt   = std::chrono::system_clock::to_time_t(now);
    std::tm  tm{};
    localtime_r(&tt, &tm);
    char buf[32];
    strftime(buf, sizeof(buf), "%H:%M:%S", &tm);
    return buf;
}

static void pushPlate(const std::string& text, float conf) {
    std::lock_guard<std::mutex> lk(g_plateMutex);
    for (int i = 0; i < std::min((int)g_plates.size(), 3); ++i)
        if (g_plates[i].text == text) return;
    g_plates.push_front({text, nowString(), (int)(conf * 100)});
    if ((int)g_plates.size() > MAX_PLATE_LOG) g_plates.pop_back();
}

// ─────────────────────────────────────────────────────────────────────────────
//  fast-plate-ocr
// ─────────────────────────────────────────────────────────────────────────────

struct PlateOCRState {
    std::string  alphabet;
    int          slots, h, w;
    Ort::Env     env;
    Ort::Session session;
    std::string  inName, outName;
};

inline PlateOCRState plateOcrInit(const std::string& onnxPath, const std::string& cfgPath) {
    PlateOCRState s{ "", 7, 70, 140,
        Ort::Env(ORT_LOGGING_LEVEL_WARNING, "plate_ocr"),
        Ort::Session(nullptr), {}, {} };

    std::ifstream f(cfgPath);
    std::string line;
    while (std::getline(f, line)) {
        auto c = line.find(':'); if (c == std::string::npos) continue;
        std::string k = line.substr(0, c);
        std::string v = line.substr(c + 1);
        auto vs = v.find_first_not_of(" \t\"'"), ve = v.find_last_not_of(" \t\"'\r\n");
        if (vs == std::string::npos) continue;
        v = v.substr(vs, ve - vs + 1);
        if      (k == "alphabet")        s.alphabet = v;
        else if (k == "max_plate_slots") s.slots    = std::stoi(v);
        else if (k == "img_height")      s.h        = std::stoi(v);
        else if (k == "img_width")       s.w        = std::stoi(v);
    }

    Ort::SessionOptions opts;
    opts.SetIntraOpNumThreads(1);
    opts.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_EXTENDED);

    s.session = Ort::Session(s.env, onnxPath.c_str(), opts);

    auto inputShape = s.session.GetInputTypeInfo(0).GetTensorTypeAndShapeInfo().GetShape();
    if (inputShape.size() == 4) {
        s.h = (int)inputShape[1];
        s.w = (int)inputShape[2];
    }

    Ort::AllocatorWithDefaultOptions alloc;
    s.inName  = s.session.GetInputNameAllocated(0, alloc).get();
    s.outName = s.session.GetOutputNameAllocated(0, alloc).get();
    return s;
}

inline std::string plateOcrRun(PlateOCRState& s, const cv::Mat& img) {
    auto inputShape = s.session.GetInputTypeInfo(0).GetTensorTypeAndShapeInfo().GetShape();
    int channels = (inputShape.size() == 4) ? (int)inputShape[3] : 1;

    cv::Mat processed, resized;
    cv::resize(img, resized, cv::Size(s.w, s.h), 0, 0, cv::INTER_LINEAR);

    if (channels == 1) cv::cvtColor(resized, processed, cv::COLOR_BGR2GRAY);
    else               cv::cvtColor(resized, processed, cv::COLOR_BGR2RGB);

    std::vector<uint8_t> data(processed.datastart, processed.dataend);
    std::array<int64_t, 4> shape{ 1, s.h, s.w, channels };
    auto mem    = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    auto tensor = Ort::Value::CreateTensor<uint8_t>(mem, data.data(), data.size(), shape.data(), shape.size());

    const char* in[]  = { s.inName.c_str()  };
    const char* out[] = { s.outName.c_str() };
    auto result = s.session.Run(Ort::RunOptions{nullptr}, in, &tensor, 1, out, 1);

    const float* raw   = result[0].GetTensorData<float>();
    int          an    = (int)s.alphabet.size();
    int          slots = (int)result[0].GetTensorTypeAndShapeInfo().GetElementCount() / an;

    std::string plate;
    for (int i = 0; i < slots; ++i) {
        const float* slot = raw + i * an;
        char ch = s.alphabet[std::max_element(slot, slot + an) - slot];
        if (ch != '_' && ch != '\0') plate += ch;
    }
    return plate;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

static bool safeSend(int fd, const void* data, size_t len) {
    const char* p = (const char*)data;
    while (len > 0) {
        ssize_t n = send(fd, p, len, MSG_NOSIGNAL);
        if (n <= 0) return false;
        p   += n;
        len -= n;
    }
    return true;
}

static std::string parsePath(const char* buf) {
    std::string_view req(buf);
    auto s = req.find(' ');
    auto e = req.find(' ', s + 1);
    if (s == std::string::npos || e == std::string::npos) return "/";
    return std::string(req.substr(s + 1, e - s - 1));
}

static void handleClient(int fd) {
    char buf[2048] = {};
    recv(fd, buf, sizeof(buf) - 1, 0);
    std::string path = parsePath(buf);

    if (path == "/stream") {
        // MJPEG stream
        const char* hdr =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: multipart/x-mixed-replace; boundary=--jpgboundary\r\n"
            "Cache-Control: no-cache\r\n"
            "Access-Control-Allow-Origin: *\r\n\r\n";
        if (!safeSend(fd, hdr, strlen(hdr))) { close(fd); return; }

        while (g_running) {
            std::vector<uchar> jpeg;
            {
                std::lock_guard<std::mutex> lk(g_frameMutex);
                jpeg = g_jpegFrame;
            }
            if (!jpeg.empty()) {
                std::ostringstream hh;
                hh << "--jpgboundary\r\n"
                   << "Content-Type: image/jpeg\r\n"
                   << "Content-Length: " << jpeg.size() << "\r\n\r\n";
                std::string part = hh.str();
                if (!safeSend(fd, part.data(), part.size()))  break;
                if (!safeSend(fd, jpeg.data(),  jpeg.size())) break;
                if (!safeSend(fd, "\r\n",        2))          break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(33));
        }

    } else if (path == "/snapshot") {
        // Single JPEG frame
        std::vector<uchar> jpeg;
        {
            std::lock_guard<std::mutex> lk(g_frameMutex);
            jpeg = g_jpegFrame;
        }
        if (jpeg.empty()) {
            const char* r = "HTTP/1.1 503 No Frame\r\nContent-Length: 0\r\n\r\n";
            safeSend(fd, r, strlen(r));
        } else {
            std::ostringstream resp;
            resp << "HTTP/1.1 200 OK\r\n"
                 << "Content-Type: image/jpeg\r\n"
                 << "Access-Control-Allow-Origin: *\r\n"
                 << "Content-Length: " << jpeg.size() << "\r\n\r\n";
            std::string hdr = resp.str();
            safeSend(fd, hdr.data(), hdr.size());
            safeSend(fd, jpeg.data(), jpeg.size());
        }

    } else if (path == "/plates") {
        // JSON plate detections
        std::string json = "[";
        {
            std::lock_guard<std::mutex> lk(g_plateMutex);
            for (int i = 0; i < (int)g_plates.size(); ++i) {
                if (i) json += ",";
                json += "{\"text\":\"" + g_plates[i].text +
                        "\",\"timestamp\":\"" + g_plates[i].timestamp +
                        "\",\"confidence\":" + std::to_string(g_plates[i].confidence_pct) + "}";
            }
        }
        json += "]";
        std::ostringstream resp;
        resp << "HTTP/1.1 200 OK\r\n"
             << "Content-Type: application/json\r\n"
             << "Access-Control-Allow-Origin: *\r\n"
             << "Content-Length: " << json.size() << "\r\n\r\n"
             << json;
        std::string r = resp.str();
        safeSend(fd, r.data(), r.size());

    } else if (path == "/health") {
        std::string body = "{\"status\":\"ok\"}";
        std::ostringstream resp;
        resp << "HTTP/1.1 200 OK\r\n"
             << "Content-Type: application/json\r\n"
             << "Content-Length: " << body.size() << "\r\n\r\n"
             << body;
        std::string r = resp.str();
        safeSend(fd, r.data(), r.size());

    } else {
        const char* r = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        safeSend(fd, r, strlen(r));
    }

    close(fd);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Web server thread
// ─────────────────────────────────────────────────────────────────────────────

void runWebServer(int port) {
    signal(SIGPIPE, SIG_IGN);

    int sfd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(sfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family      = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port        = htons(port);

    if (::bind(sfd, (sockaddr*)&addr, sizeof(addr)) < 0) {
        std::cerr << "[plate_watch] bind failed on port " << port << std::endl;
        return;
    }
    listen(sfd, 16);
    std::cout << "[plate_watch] HTTP server on http://0.0.0.0:" << port << std::endl;
    std::cout << "[plate_watch] Endpoints: /stream /snapshot /plates /health" << std::endl;

    while (g_running) {
        int cfd = accept(sfd, nullptr, nullptr);
        if (cfd < 0) continue;
        SET_NOSIGPIPE(cfd);
        std::thread(handleClient, cfd).detach();
    }
    close(sfd);
}

// ─────────────────────────────────────────────────────────────────────────────
//  main
// ─────────────────────────────────────────────────────────────────────────────

int main(int argc, char** argv) {
    int cameraIndex = -1;
    std::string cameraDevice = "";
    int httpPort    = 8082;
    std::string modelsDir = ".";
    bool hasModels = true;

    // Parse command line args
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--camera" && i + 1 < argc)      cameraIndex = std::stoi(argv[++i]);
        else if (arg == "--device" && i + 1 < argc)  cameraDevice = argv[++i];
        else if (arg == "--port" && i + 1 < argc)    httpPort = std::stoi(argv[++i]);
        else if (arg == "--models" && i + 1 < argc)  modelsDir = argv[++i];
    }

    // Start web server in background
    std::thread serverThread(runWebServer, httpPort);
    serverThread.detach();

    // Try to load plate detection models (graceful fallback if missing)
    PlateOCRState* ocr = nullptr;
    Ort::Env* detEnv = nullptr;
    Ort::Session* detSession = nullptr;
    std::string detInName, detOutName;

    std::string ocrModel  = modelsDir + "/cct_xs_v1_global.onnx";
    std::string ocrConfig = modelsDir + "/cct_xs_v1_global_plate_config.yaml";
    std::string detModel  = modelsDir + "/license-plate-finetune-v1n.onnx";

    if (std::ifstream(ocrModel).good() && std::ifstream(ocrConfig).good() && std::ifstream(detModel).good()) {
        try {
            ocr = new PlateOCRState(plateOcrInit(ocrModel, ocrConfig));
            detEnv = new Ort::Env(ORT_LOGGING_LEVEL_WARNING, "LicensePlate");
            Ort::SessionOptions sessionOptions;
            detSession = new Ort::Session(*detEnv, detModel.c_str(), sessionOptions);

            Ort::AllocatorWithDefaultOptions allocator;
            detInName  = detSession->GetInputNameAllocated(0, allocator).get();
            detOutName = detSession->GetOutputNameAllocated(0, allocator).get();

            std::cout << "[plate_watch] Plate detection models loaded from " << modelsDir << std::endl;
        } catch (const std::exception& e) {
            std::cerr << "[plate_watch] Model load failed: " << e.what() << " — running camera-only mode" << std::endl;
            hasModels = false;
            delete ocr; ocr = nullptr;
            delete detSession; detSession = nullptr;
            delete detEnv; detEnv = nullptr;
        }
    } else {
        std::cout << "[plate_watch] No ONNX models found in " << modelsDir << " — camera-only mode" << std::endl;
        hasModels = false;
    }

    // Open camera — prefer device path, fall back to index
    VideoCapture camera;
    if (!cameraDevice.empty()) {
        camera.open(cameraDevice, cv::CAP_V4L2);
        std::cout << "[plate_watch] Opening camera device: " << cameraDevice << std::endl;
    } else {
        if (cameraIndex < 0) cameraIndex = 0;
        camera.open(cameraIndex);
        std::cout << "[plate_watch] Opening camera index: " << cameraIndex << std::endl;
    }
    if (!camera.isOpened()) {
        std::cerr << "[plate_watch] Failed to open camera" << std::endl;
        return 1;
    }
    camera.set(CAP_PROP_FRAME_WIDTH, 640);
    camera.set(CAP_PROP_FRAME_HEIGHT, 480);
    std::cout << "[plate_watch] Camera opened (640x480)" << std::endl;

    int frameCount = 0;
    auto fpsStart = std::chrono::steady_clock::now();

    Mat img;
    while (g_running) {
        camera >> img;
        if (img.empty()) continue;

        // Run plate detection if models are loaded
        if (hasModels && detSession && ocr) {
            Mat resized, rgb;
            resize(img, resized, Size(SIZE, SIZE));
            cvtColor(resized, rgb, COLOR_BGR2RGB);
            rgb.convertTo(rgb, CV_32F, 1.0 / 255.0);

            vector<Mat> channels(3);
            split(rgb, channels);
            vector<float> inputTensor;
            for (auto& c : channels)
                inputTensor.insert(inputTensor.end(), (float*)c.datastart, (float*)c.dataend);

            vector<int64_t> shape = {1, 3, SIZE, SIZE};
            auto memInfo = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
            Ort::Value ortInput = Ort::Value::CreateTensor<float>(
                memInfo, inputTensor.data(), inputTensor.size(), shape.data(), shape.size());

            const char* inN  = detInName.c_str();
            const char* outN = detOutName.c_str();
            auto outputs = detSession->Run(Ort::RunOptions{nullptr}, &inN, &ortInput, 1, &outN, 1);

            float* data     = outputs[0].GetTensorMutableData<float>();
            int    numBoxes = outputs[0].GetTensorTypeAndShapeInfo().GetShape()[2];

            float confThreshold = 0.4f;
            float scaleX = (float)img.cols / SIZE;
            float scaleY = (float)img.rows / SIZE;

            vector<Rect>  boxes;
            vector<float> scores;

            for (int i = 0; i < numBoxes; i++) {
                float conf = data[4 * numBoxes + i];
                if (conf < confThreshold) continue;
                float cx = data[0 * numBoxes + i] * scaleX;
                float cy = data[1 * numBoxes + i] * scaleY;
                float w  = data[2 * numBoxes + i] * scaleX;
                float h  = data[3 * numBoxes + i] * scaleY;
                boxes.push_back(Rect(cx - w/2, cy - h/2, w, h));
                scores.push_back(conf);
            }

            vector<int> indices;
            dnn::NMSBoxes(boxes, scores, confThreshold, 0.4f, indices);

            for (int idx : indices) {
                Rect& b = boxes[idx];
                Scalar color(0, 220, 80);
                rectangle(img, b, color, 2);

                Rect roi = b;
                roi.x      = max(0, roi.x);
                roi.y      = max(0, roi.y);
                roi.width  = min(roi.width,  img.cols - roi.x);
                roi.height = min(roi.height, img.rows - roi.y);
                Mat cropped = img(roi).clone();

                string text = plateOcrRun(*ocr, cropped);
                if (!text.empty()) {
                    int baseline = 0;
                    Size sz = getTextSize(text, FONT_HERSHEY_SIMPLEX, 0.9, 2, &baseline);
                    Rect labelBg(b.x, b.y - sz.height - 10, sz.width + 10, sz.height + 10);
                    labelBg.x      = max(0, labelBg.x);
                    labelBg.y      = max(0, labelBg.y);
                    labelBg.width  = min(labelBg.width,  img.cols - labelBg.x);
                    labelBg.height = min(labelBg.height, img.rows - labelBg.y);
                    rectangle(img, labelBg, Scalar(0, 0, 0), FILLED);
                    putText(img, text, Point(b.x + 5, b.y - 4),
                            FONT_HERSHEY_SIMPLEX, 0.9, color, 2);
                    pushPlate(text, scores[idx]);
                }
            }
        }

        // Encode frame as JPEG
        vector<uchar> jpeg;
        vector<int> params = {IMWRITE_JPEG_QUALITY, 70};
        imencode(".jpg", img, jpeg, params);

        // Share with MJPEG web server
        {
            std::lock_guard<std::mutex> lk(g_frameMutex);
            g_jpegFrame = std::move(jpeg);
        }

        // Write to shared file for Node.js relay (atomic write via rename)
        {
            std::lock_guard<std::mutex> lk(g_frameMutex);
            if (!g_jpegFrame.empty()) {
                FILE* f = fopen(FRAME_TEMP_PATH, "wb");
                if (f) {
                    fwrite(g_jpegFrame.data(), 1, g_jpegFrame.size(), f);
                    fclose(f);
                    rename(FRAME_TEMP_PATH, FRAME_OUTPUT_PATH);
                }
            }
        }

        frameCount++;
        auto now = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double>(now - fpsStart).count();
        if (elapsed >= 5.0) {
            std::cout << "[plate_watch] " << (int)(frameCount / elapsed) << " fps" << std::endl;
            frameCount = 0;
            fpsStart = now;
        }
    }

    delete ocr;
    delete detSession;
    delete detEnv;
    return 0;
}
