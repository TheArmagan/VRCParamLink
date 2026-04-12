cmake_minimum_required(VERSION 3.20)
project(vrcpl-driver LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Download OpenVR driver header ──
set(OPENVR_TAG "v2.5.1")
set(OPENVR_HEADER_DIR "${CMAKE_BINARY_DIR}/openvr_headers")
file(MAKE_DIRECTORY "${OPENVR_HEADER_DIR}")

if(NOT EXISTS "${OPENVR_HEADER_DIR}/openvr_driver.h")
    message(STATUS "Downloading openvr_driver.h (${OPENVR_TAG})...")
    file(DOWNLOAD
        "https://raw.githubusercontent.com/ValveSoftware/openvr/${OPENVR_TAG}/headers/openvr_driver.h"
        "${OPENVR_HEADER_DIR}/openvr_driver.h"
        TLS_VERIFY ON
        STATUS DOWNLOAD_STATUS
    )
    list(GET DOWNLOAD_STATUS 0 STATUS_CODE)
    if(NOT STATUS_CODE EQUAL 0)
        message(FATAL_ERROR "Failed to download openvr_driver.h")
    endif()
endif()

# ── Driver DLL ──
add_library(driver_vrcpl SHARED src/driver.cpp)
target_include_directories(driver_vrcpl PRIVATE "${OPENVR_HEADER_DIR}")

# SteamVR expects the DLL in <driver>/bin/win64/
set_target_properties(driver_vrcpl PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY            "${CMAKE_SOURCE_DIR}/vrcpl/bin/win64"
    RUNTIME_OUTPUT_DIRECTORY_DEBUG      "${CMAKE_SOURCE_DIR}/vrcpl/bin/win64"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE    "${CMAKE_SOURCE_DIR}/vrcpl/bin/win64"
    OUTPUT_NAME "driver_vrcpl"
    PREFIX ""
)
