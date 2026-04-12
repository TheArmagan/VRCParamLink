@echo off
setlocal

if not exist build mkdir build
cd build

cmake .. -A x64
if errorlevel 1 (
    echo CMake configuration failed.
    exit /b 1
)

cmake --build . --config Release
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

echo.
echo Build complete: vrcpl\bin\win64\driver_vrcpl.dll
