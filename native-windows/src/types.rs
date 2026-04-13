use serde::{Deserialize, Serialize};

/// A single tracker entry in the output JSON batch.
#[derive(Debug, Clone, Serialize)]
pub struct TrackerEntry {
    pub address: String,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
}

/// The full JSON batch written to stdout every tick.
#[derive(Debug, Clone, Serialize)]
pub struct TrackerBatch {
    pub ts: u64,
    pub trackers: Vec<TrackerEntry>,
}

/// Calibration snapshot: stores the HMD-relative offsets captured at calibration time.
#[derive(Debug, Clone)]
pub struct CalibrationSnapshot {
    /// HMD world position at calibration time.
    pub hmd_position: [f32; 3],
    /// HMD world rotation (euler degrees) at calibration time.
    pub hmd_rotation: [f32; 3],
    /// HMD inverse rotation matrix (3×3) for transforming positions into HMD-local space.
    pub hmd_inv_rotation_matrix: [[f32; 3]; 3],
}

/// Mapping of an OpenVR device index to a VRChat OSC tracker slot.
#[derive(Debug, Clone)]
pub struct DeviceSlot {
    pub device_index: u32,
    pub osc_address: String,
}

/// Log entry written to stderr.
#[derive(Debug, Serialize)]
pub struct LogEntry {
    pub level: &'static str,
    pub msg: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<&'static str>,
}

// ── Stdin command protocol (Electron → Bridge) ──

/// Commands sent from Electron to the bridge via stdin (one JSON line per command).
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "cmd")]
pub enum StdinCommand {
    /// Start/recalibrate tracking. Sent when Electron detects VRMode=1 + TrackingType.
    #[serde(rename = "start")]
    Start,
    /// Pause tracking. Sent when Electron detects VRMode=0.
    #[serde(rename = "stop")]
    Stop,
    /// Return the current HMD world position and rotation (for receive-side calibration).
    #[serde(rename = "get_hmd_pose")]
    GetHmdPose,
    /// Graceful shutdown.
    #[serde(rename = "exit")]
    Exit,
}

/// Response to a `get_hmd_pose` command, written to stdout as JSON.
#[derive(Debug, Clone, Serialize)]
pub struct HmdPoseResponse {
    #[serde(rename = "type")]
    pub msg_type: &'static str,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
}
