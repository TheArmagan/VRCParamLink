/**
 * VRCParamLink SteamVR Driver
 *
 * Creates virtual tracker devices in SteamVR and receives pose updates
 * from the Electron app via a named pipe.
 *
 * Binary pipe protocol (little-endian):
 *   Header (4 bytes):
 *     [0x56 0x50]  magic ("VP")
 *     [uint8]      message type: 0x01=pose_update, 0x02=reset_all, 0x03=set_origin
 *     [uint8]      tracker count N (for pose_update only)
 *   Per tracker (29 bytes each, only for type 0x01):
 *     [uint8]      slot (0=head, 1-8=body)
 *     [float32×3]  position  (x, y, z)
 *     [float32×4]  quaternion (w, x, y, z)
 *   Set origin (28 bytes, only for type 0x03):
 *     [float32×3]  position  (x, y, z)
 *     [float32×4]  quaternion (w, x, y, z)
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include "openvr_driver.h"

#include <thread>
#include <mutex>
#include <atomic>
#include <string>
#include <array>
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cmath>

// ── Constants ───────────────────────────────────────────────────────────────

static constexpr uint8_t MAGIC[2] = {0x56, 0x50};
static constexpr uint8_t MSG_POSE_UPDATE = 0x01;
static constexpr uint8_t MSG_RESET_ALL = 0x02;
static constexpr uint8_t MSG_SET_ORIGIN = 0x03;
static constexpr int MAX_TRACKERS = 9; // head + 8 body
static const char *PIPE_NAME = "\\\\.\\pipe\\vrcpl-tracking";
static const char *SERIAL_PREFIX = "VRCPL_";

static const char *TRACKER_NAMES[MAX_TRACKERS] = {
    "Head", "Tracker1", "Tracker2", "Tracker3", "Tracker4",
    "Tracker5", "Tracker6", "Tracker7", "Tracker8"};

// ── Helpers ─────────────────────────────────────────────────────────────────

static void DriverLog(const char *fmt, ...)
{
  if (!vr::VRDriverLog())
    return;
  char buf[512];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  vr::VRDriverLog()->Log(buf);
}

/** Read exactly @p len bytes from the pipe.  Returns false on failure. */
static bool ReadExact(HANDLE pipe, void *dst, DWORD len)
{
  uint8_t *ptr = static_cast<uint8_t *>(dst);
  DWORD remaining = len;
  while (remaining > 0)
  {
    DWORD bytesRead = 0;
    if (!ReadFile(pipe, ptr, remaining, &bytesRead, nullptr) || bytesRead == 0)
      return false;
    ptr += bytesRead;
    remaining -= bytesRead;
  }
  return true;
}

// ── Virtual Tracker Device ──────────────────────────────────────────────────

class VRCPLTrackerDevice : public vr::ITrackedDeviceServerDriver
{
public:
  explicit VRCPLTrackerDevice(int slot)
      : m_slot(slot), m_serial(std::string(SERIAL_PREFIX) + TRACKER_NAMES[slot]), m_deviceIndex(vr::k_unTrackedDeviceIndexInvalid), m_active(false)
  {
    std::memset(&m_pose, 0, sizeof(m_pose));
    m_pose.poseIsValid = false;
    m_pose.deviceIsConnected = true;
    m_pose.result = vr::TrackingResult_Running_OK;
    m_pose.qWorldFromDriverRotation = {1, 0, 0, 0};
    m_pose.qDriverFromHeadRotation = {1, 0, 0, 0};
    m_pose.qRotation = {1, 0, 0, 0};
  }

  // ── ITrackedDeviceServerDriver ──────────────────────────────────────

  vr::EVRInitError Activate(uint32_t deviceIndex) override
  {
    m_deviceIndex = deviceIndex;
    m_active = true;

    auto container = vr::VRProperties()->TrackedDeviceToPropertyContainer(m_deviceIndex);

    vr::VRProperties()->SetStringProperty(container,
                                          vr::Prop_SerialNumber_String, m_serial.c_str());
    vr::VRProperties()->SetStringProperty(container,
                                          vr::Prop_ModelNumber_String, "VRCParamLink Virtual Tracker");
    vr::VRProperties()->SetStringProperty(container,
                                          vr::Prop_ManufacturerName_String, "VRCParamLink");
    vr::VRProperties()->SetStringProperty(container,
                                          vr::Prop_TrackingSystemName_String, "vrcpl");
    vr::VRProperties()->SetInt32Property(container,
                                         vr::Prop_ControllerRoleHint_Int32,
                                         vr::TrackedControllerRole_OptOut);

    DriverLog("[vrcpl] Activated device %s (idx %u)\n",
              m_serial.c_str(), deviceIndex);
    return vr::VRInitError_None;
  }

  void Deactivate() override
  {
    m_active = false;
    m_deviceIndex = vr::k_unTrackedDeviceIndexInvalid;
  }
  void EnterStandby() override {}
  void *GetComponent(const char *) override { return nullptr; }
  void DebugRequest(const char *, char *buf,
                    uint32_t sz) override
  {
    if (sz)
      buf[0] = '\0';
  }

  vr::DriverPose_t GetPose() override
  {
    std::lock_guard<std::mutex> lk(m_mtx);
    return m_pose;
  }

  // ── Custom ──────────────────────────────────────────────────────────

  void UpdatePose(float px, float py, float pz,
                  float qw, float qx, float qy, float qz)
  {
    vr::HmdQuaternion_t q;
    q.w = qw;
    q.x = qx;
    q.y = qy;
    q.z = qz;
    {
      std::lock_guard<std::mutex> lk(m_mtx);
      m_pose.poseIsValid = true;
      m_pose.deviceIsConnected = true;
      m_pose.result = vr::TrackingResult_Running_OK;
      m_pose.vecPosition[0] = static_cast<double>(px);
      m_pose.vecPosition[1] = static_cast<double>(py);
      m_pose.vecPosition[2] = static_cast<double>(pz);
      m_pose.qRotation = q;
    }
    if (m_active && m_deviceIndex != vr::k_unTrackedDeviceIndexInvalid)
      vr::VRServerDriverHost()->TrackedDevicePoseUpdated(
          m_deviceIndex, m_pose, sizeof(m_pose));
  }

  /** Update the WorldFromDriver transform so that driver (0,0,0) maps to
   *  the receiver's HMD position in world space. */
  void SetOrigin(float ox, float oy, float oz,
                 float oqw, float oqx, float oqy, float oqz)
  {
    vr::HmdQuaternion_t oq;
    oq.w = oqw;
    oq.x = oqx;
    oq.y = oqy;
    oq.z = oqz;
    {
      std::lock_guard<std::mutex> lk(m_mtx);
      m_pose.vecWorldFromDriverTranslation[0] = static_cast<double>(ox);
      m_pose.vecWorldFromDriverTranslation[1] = static_cast<double>(oy);
      m_pose.vecWorldFromDriverTranslation[2] = static_cast<double>(oz);
      m_pose.qWorldFromDriverRotation = oq;
    }
  }

  void InvalidatePose()
  {
    {
      std::lock_guard<std::mutex> lk(m_mtx);
      m_pose.poseIsValid = false;
    }
    if (m_active && m_deviceIndex != vr::k_unTrackedDeviceIndexInvalid)
      vr::VRServerDriverHost()->TrackedDevicePoseUpdated(
          m_deviceIndex, m_pose, sizeof(m_pose));
  }

  const std::string &Serial() const { return m_serial; }
  int Slot() const { return m_slot; }

private:
  int m_slot;
  std::string m_serial;
  uint32_t m_deviceIndex;
  bool m_active;
  vr::DriverPose_t m_pose;
  std::mutex m_mtx;
};

// ── Server Provider ─────────────────────────────────────────────────────────

class VRCPLServerProvider : public vr::IServerTrackedDeviceProvider
{
public:
  VRCPLServerProvider() : m_running(false), m_trackersAdded(false) {}

  vr::EVRInitError Init(vr::IVRDriverContext *ctx) override
  {
    VR_INIT_SERVER_DRIVER_CONTEXT(ctx);

    for (int i = 0; i < MAX_TRACKERS; i++)
      m_devices[i] = new VRCPLTrackerDevice(i);

    m_running = true;
    m_pipeThread = std::thread(&VRCPLServerProvider::PipeLoop, this);

    DriverLog("[vrcpl] Driver initialized – pipe server starting\n");
    return vr::VRInitError_None;
  }

  void Cleanup() override
  {
    m_running = false;

    // Unblock ConnectNamedPipe by connecting a dummy client
    HANDLE h = CreateFileA(PIPE_NAME, GENERIC_WRITE,
                           0, nullptr, OPEN_EXISTING, 0, nullptr);
    if (h != INVALID_HANDLE_VALUE)
      CloseHandle(h);

    if (m_pipeThread.joinable())
      m_pipeThread.join();

    for (int i = 0; i < MAX_TRACKERS; i++)
    {
      delete m_devices[i];
      m_devices[i] = nullptr;
    }

    VR_CLEANUP_SERVER_DRIVER_CONTEXT();
    DriverLog("[vrcpl] Driver cleaned up\n");
  }

  const char *const *GetInterfaceVersions() override
  {
    return vr::k_InterfaceVersions;
  }

  void RunFrame() override {}
  bool ShouldBlockStandbyMode() override { return false; }
  void EnterStandby() override {}
  void LeaveStandby() override {}

private:
  // ── Pipe server ─────────────────────────────────────────────────────

  void PipeLoop()
  {
    while (m_running)
    {
      HANDLE pipe = CreateNamedPipeA(
          PIPE_NAME,
          PIPE_ACCESS_DUPLEX,
          PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
          1,    // single instance
          4096, // out buffer
          4096, // in buffer
          0,    // default timeout
          nullptr);

      if (pipe == INVALID_HANDLE_VALUE)
      {
        if (m_running)
        {
          DriverLog("[vrcpl] CreateNamedPipe failed (err %lu)\n",
                    GetLastError());
          Sleep(1000);
        }
        continue;
      }

      // Block until a client connects
      BOOL ok = ConnectNamedPipe(pipe, nullptr);
      if (!ok && GetLastError() != ERROR_PIPE_CONNECTED)
      {
        CloseHandle(pipe);
        continue;
      }
      if (!m_running)
      {
        CloseHandle(pipe);
        break;
      }

      DriverLog("[vrcpl] Client connected\n");
      HandleClient(pipe);

      // Client gone — invalidate all active poses
      InvalidateAll();

      DisconnectNamedPipe(pipe);
      CloseHandle(pipe);
      DriverLog("[vrcpl] Client disconnected\n");
    }
  }

  void HandleClient(HANDLE pipe)
  {
    // Lazily add all tracker devices to SteamVR on first connection
    AddAllTrackers();

    uint8_t hdr[4];
    while (m_running)
    {
      if (!ReadExact(pipe, hdr, 4))
        break;

      if (hdr[0] != MAGIC[0] || hdr[1] != MAGIC[1])
        continue; // bad magic → skip

      const uint8_t msgType = hdr[2];
      const uint8_t count = hdr[3];

      if (msgType == MSG_POSE_UPDATE && count > 0 && count <= MAX_TRACKERS)
      {
        // 29 bytes per tracker: 1 slot + 3 pos floats + 4 quat floats
        uint8_t buf[MAX_TRACKERS * 29];
        const DWORD need = static_cast<DWORD>(count) * 29;
        if (!ReadExact(pipe, buf, need))
          break;

        // Track which slots received updates this batch
        bool updated[MAX_TRACKERS] = {};

        DWORD off = 0;
        for (int i = 0; i < count; i++)
        {
          uint8_t slot = buf[off];
          off += 1;
          if (slot >= MAX_TRACKERS)
          {
            off += 28;
            continue;
          }

          float v[7];
          std::memcpy(v, buf + off, 28);
          off += 28;
          m_devices[slot]->UpdatePose(v[0], v[1], v[2],
                                      v[3], v[4], v[5], v[6]);
          updated[slot] = true;
        }

        // Invalidate any slot that was NOT in this batch
        for (int i = 0; i < MAX_TRACKERS; i++)
        {
          if (!updated[i])
            m_devices[i]->InvalidatePose();
        }
      }
      else if (msgType == MSG_RESET_ALL)
      {
        InvalidateAll();
      }
      else if (msgType == MSG_SET_ORIGIN)
      {
        // 28 bytes: 7 floats (px, py, pz, qw, qx, qy, qz)
        uint8_t buf[28];
        if (!ReadExact(pipe, buf, 28))
          break;
        float v[7];
        std::memcpy(v, buf, 28);
        // Reset all poses first, then apply new origin
        InvalidateAll();
        for (int i = 0; i < MAX_TRACKERS; i++)
          m_devices[i]->SetOrigin(v[0], v[1], v[2], v[3], v[4], v[5], v[6]);
        DriverLog("[vrcpl] Origin reset: pos(%.2f, %.2f, %.2f) quat(%.3f, %.3f, %.3f, %.3f)\n",
                  v[0], v[1], v[2], v[3], v[4], v[5], v[6]);
      }
      // Unknown message types are silently ignored
    }
  }

  void AddAllTrackers()
  {
    if (m_trackersAdded)
      return;
    m_trackersAdded = true;

    for (int i = 0; i < MAX_TRACKERS; i++)
    {
      vr::VRServerDriverHost()->TrackedDeviceAdded(
          m_devices[i]->Serial().c_str(),
          vr::TrackedDeviceClass_GenericTracker,
          m_devices[i]);
      DriverLog("[vrcpl] Added tracker %s (slot %d)\n",
                m_devices[i]->Serial().c_str(), i);
    }
  }

  void InvalidateAll()
  {
    for (int i = 0; i < MAX_TRACKERS; i++)
      m_devices[i]->InvalidatePose();
  }

  VRCPLTrackerDevice *m_devices[MAX_TRACKERS] = {};
  std::thread m_pipeThread;
  std::atomic<bool> m_running;
  bool m_trackersAdded;
};

// ── DLL Export ──────────────────────────────────────────────────────────────

static VRCPLServerProvider g_provider;

extern "C" __declspec(dllexport) void *HmdDriverFactory(const char *interfaceName, int *returnCode)
{
  if (std::strcmp(interfaceName, vr::IServerTrackedDeviceProvider_Version) == 0)
    return &g_provider;

  if (returnCode)
    *returnCode = vr::VRInitError_Init_InterfaceNotFound;
  return nullptr;
}
