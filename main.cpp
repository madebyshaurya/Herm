#include <onnxruntime_cxx_api.h>
#include <opencv2/opencv.hpp>
#include <iostream>
#include <vector>
#include <fstream>
#include <sstream>
#include <set>
#include <map>
#include <thread>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <unistd.h>

using namespace cv;
using namespace std;
#define SIZE 640

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP POST  (raw sockets, no libcurl)
// ─────────────────────────────────────────────────────────────────────────────

struct ParsedUrl { std::string host, path; int port; };

static ParsedUrl parseUrl(const std::string& url) {
    ParsedUrl r{"", "/", 80};
    std::string s = url;
    if (s.substr(0, 7) == "http://")  s = s.substr(7);
    if (s.substr(0, 8) == "https://") s = s.substr(8);
    auto slash = s.find('/');
    if (slash == std::string::npos) { r.host = s; }
    else { r.host = s.substr(0, slash); r.path = s.substr(slash); }
    auto colon = r.host.find(':');
    if (colon != std::string::npos) {
        r.port = std::stoi(r.host.substr(colon + 1));
        r.host = r.host.substr(0, colon);
    }
    return r;
}

static void httpPost(const std::string& url, const std::string& json) {
    auto p = parseUrl(url);
    struct addrinfo hints{}, *res = nullptr;
    hints.ai_family   = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(p.host.c_str(), std::to_string(p.port).c_str(), &hints, &res) != 0) return;
    int fd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (fd < 0) { freeaddrinfo(res); return; }
    struct timeval tv{2, 0};
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    if (connect(fd, res->ai_addr, res->ai_addrlen) == 0) {
        std::ostringstream req;
        req << "POST " << p.path << " HTTP/1.1\r\n"
            << "Host: " << p.host << "\r\n"
            << "Content-Type: application/json\r\n"
            << "Content-Length: " << json.size() << "\r\n"
            << "Connection: close\r\n\r\n"
            << json;
        std::string r = req.str();
        send(fd, r.data(), r.size(), 0);
    }
    close(fd);
    freeaddrinfo(res);
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
    if (inputShape.size() == 4) { s.h = (int)inputShape[1]; s.w = (int)inputShape[2]; }
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
//  main
//  Usage: ./platewatch <url>
//  e.g.:  ./platewatch http://192.168.1.10:3000/plates
// ─────────────────────────────────────────────────────────────────────────────

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <url>\n"
                  << "  e.g. " << argv[0] << " http://192.168.1.10:3000/plates\n";
        return 1;
    }
    std::string postUrl = argv[1];
    std::cout << "POSTing plates to: " << postUrl << "\n";

    PlateOCRState ocr = plateOcrInit("cct_xs_v1_global.onnx", "cct_xs_v1_global_plate_config.yaml");

    Ort::Env env(ORT_LOGGING_LEVEL_WARNING, "LicensePlate");
    Ort::SessionOptions sessionOptions;
    Ort::Session session(env, "license-plate-finetune-v1n.onnx", sessionOptions);

    Ort::AllocatorWithDefaultOptions allocator;
    auto inputNamePtr  = session.GetInputNameAllocated(0, allocator);
    auto outputNamePtr = session.GetOutputNameAllocated(0, allocator);

    VideoCapture camera(0);
    if (!camera.isOpened()) { std::cerr << "Failed to open camera\n"; return 1; }

    set<string> lastSentKeys;

    Mat img;
    while (true) {
        camera >> img;
        if (img.empty()) continue;

        Mat resized, rgb;
        resize(img, resized, Size(SIZE, SIZE));
        cvtColor(resized, rgb, COLOR_BGR2RGB);
        rgb.convertTo(rgb, CV_32F, 1.0 / 255.0);

        vector<Mat> chans(3);
        split(rgb, chans);
        vector<float> inputTensor;
        for (auto& c : chans)
            inputTensor.insert(inputTensor.end(), (float*)c.datastart, (float*)c.dataend);

        vector<int64_t> shape = {1, 3, SIZE, SIZE};
        auto memInfo  = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
        auto ortInput = Ort::Value::CreateTensor<float>(
            memInfo, inputTensor.data(), inputTensor.size(), shape.data(), shape.size());

        const char* inName  = inputNamePtr.get();
        const char* outName = outputNamePtr.get();
        auto outputs = session.Run(Ort::RunOptions{nullptr}, &inName, &ortInput, 1, &outName, 1);

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

        map<string, float>  framePlates; // plate text -> detector confidence
        for (int idx : indices) {
            Rect roi = boxes[idx];
            roi.x      = max(0, roi.x);
            roi.y      = max(0, roi.y);
            roi.width  = min(roi.width,  img.cols - roi.x);
            roi.height = min(roi.height, img.rows - roi.y);
            string text = plateOcrRun(ocr, img(roi).clone());
            if (!text.empty())
                framePlates[text] = scores[idx];
        }

        set<string> frameKeys;
        for (auto& kv : framePlates) frameKeys.insert(kv.first);

        // Only POST when the visible plate set changes
        if (frameKeys != lastSentKeys) {
            lastSentKeys = frameKeys;

            // ISO-8601 UTC timestamp
            auto now = std::chrono::system_clock::now();
            auto tt  = std::chrono::system_clock::to_time_t(now);
            std::tm tm{};
            gmtime_r(&tt, &tm);
            char tsbuf[32];
            strftime(tsbuf, sizeof(tsbuf), "%Y-%m-%dT%H:%M:%SZ", &tm);

            // "plates" array
            std::string platesArr = "[";
            bool first = true;
            for (auto& kv : framePlates) {
                if (!first) platesArr += ",";
                platesArr += "\"" + kv.first + "\"";
                first = false;
            }
            platesArr += "]";

            // "confidenceByPlate" object  — rounded to 2 dp
            std::ostringstream confObj;
            confObj << std::fixed << std::setprecision(2);
            confObj << "{";
            first = true;
            for (auto& kv : framePlates) {
                if (!first) confObj << ",";
                confObj << "\"" << kv.first << "\":" << kv.second;
                first = false;
            }
            confObj << "}";

            std::string json =
                "{\"plates\":" + platesArr +
                ",\"timestamp\":\"" + tsbuf + "\"" +
                ",\"latitude\":0.0"
                ",\"longitude\":0.0"
                ",\"confidenceByPlate\":" + confObj.str() + "}";

            std::cout << "POST " << json << "\n";
            std::thread([=]{ httpPost(postUrl, json); }).detach();
        }
    }

    return 0;
}