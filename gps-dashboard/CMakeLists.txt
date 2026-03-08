cmake_minimum_required(VERSION 3.10)
project(plate_watch CXX)
set(CMAKE_CXX_STANDARD 17)

find_package(OpenCV REQUIRED)
find_package(PkgConfig)
if(PkgConfig_FOUND)
  pkg_check_modules(TESSERACT tesseract)
  pkg_check_modules(LEPTONICA lept)
endif()

# ONNX Runtime — try system install first, then /usr/local
find_path(ONNXRUNTIME_INCLUDE_DIR onnxruntime_cxx_api.h
  PATHS /usr/local/include /usr/include
  PATH_SUFFIXES onnxruntime)
find_library(ONNXRUNTIME_LIB onnxruntime
  PATHS /usr/local/lib /usr/lib)

add_executable(plate_watch plate_watch.cpp)

target_include_directories(plate_watch PRIVATE
  ${OpenCV_INCLUDE_DIRS}
  ${TESSERACT_INCLUDE_DIRS}
  ${LEPTONICA_INCLUDE_DIRS}
  ${ONNXRUNTIME_INCLUDE_DIR}
  /usr/local/include)

target_link_libraries(plate_watch
  ${OpenCV_LIBS}
  ${TESSERACT_LIBRARIES}
  ${LEPTONICA_LIBRARIES}
  ${ONNXRUNTIME_LIB}
  pthread)
