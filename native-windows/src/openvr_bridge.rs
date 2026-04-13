use crate::math_utils;
use crate::types::{CalibrationSnapshot, DeviceSlot, TrackerBatch, TrackerEntry};

/// Maximum number of OpenVR tracked devices.
const MAX_DEVICES: usize = openvr::MAX_TRACKED_DEVICE_COUNT;

/// Initialize OpenVR in Other (overlay) mode — does NOT launch SteamVR.
pub fn init_openvr() -> Result<openvr::Context, String> {
    unsafe { openvr::init(openvr::ApplicationType::Other) }
        .map_err(|e| format!("OpenVR init failed: {}", e))
}

/// Discover connected devices and assign them to VRChat OSC tracker slots.
///
/// Returns a vector of DeviceSlots:
///  - HMD (index 0) → /tracking/trackers/head
///  - Left controller → /tracking/trackers/1
///  - Right controller → /tracking/trackers/2
///  - GenericTrackers → /tracking/trackers/3..8
pub fn discover_devices(system: &openvr::System) -> Vec<DeviceSlot> {
    let mut slots = Vec::new();

    // HMD — always index 0
    if system.is_tracked_device_connected(0) {
        slots.push(DeviceSlot {
            device_index: 0,
            osc_address: "/tracking/trackers/head".to_string(),
        });
    }

    // Controllers
    if let Some(left_idx) = system.tracked_device_index_for_controller_role(
        openvr::TrackedControllerRole::LeftHand,
    ) {
        slots.push(DeviceSlot {
            device_index: left_idx,
            osc_address: "/tracking/trackers/1".to_string(),
        });
    }

    if let Some(right_idx) = system.tracked_device_index_for_controller_role(
        openvr::TrackedControllerRole::RightHand,
    ) {
        slots.push(DeviceSlot {
            device_index: right_idx,
            osc_address: "/tracking/trackers/2".to_string(),
        });
    }

    // Generic trackers → slots 3..8
    let mut tracker_slot = 3u32;
    for idx in 0..(MAX_DEVICES as u32) {
        if tracker_slot > 8 {
            break;
        }
        if !system.is_tracked_device_connected(idx) {
            continue;
        }
        let device_class = system.tracked_device_class(idx);
        if device_class == openvr::TrackedDeviceClass::GenericTracker {
            slots.push(DeviceSlot {
                device_index: idx,
                osc_address: format!("/tracking/trackers/{}", tracker_slot),
            });
            tracker_slot += 1;
        }
    }

    slots
}

/// Read current poses for all assigned device slots and produce a TrackerBatch.
pub fn read_poses(
    system: &openvr::System,
    slots: &[DeviceSlot],
    calibration: &CalibrationSnapshot,
) -> TrackerBatch {
    let poses = system.device_to_absolute_tracking_pose(
        openvr::TrackingUniverseOrigin::Standing,
        0.0,
    );

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let mut trackers = Vec::with_capacity(slots.len());

    for slot in slots {
        let pose = &poses[slot.device_index as usize];
        if !pose.pose_is_valid() {
            continue;
        }

        let matrix = pose.device_to_absolute_tracking();
        let raw_pos = math_utils::position_from_matrix(matrix);

        // Apply calibration: transform position relative to calibration HMD
        let relative_pos = math_utils::vec3_sub(&raw_pos, &calibration.hmd_position);
        let calibrated_pos = math_utils::mat3_mul_vec3(
            &calibration.hmd_inv_rotation_matrix,
            &relative_pos,
        );

        // Rotation: use quaternion math for correct HMD-relative rotation
        let raw_quat = math_utils::quat_from_matrix(matrix);
        let calibrated_quat = math_utils::quat_mul(&calibration.hmd_inv_quaternion, &raw_quat);
        let calibrated_rot = math_utils::euler_from_quat(&calibrated_quat);

        trackers.push(TrackerEntry {
            address: slot.osc_address.clone(),
            position: math_utils::round_vec3(&calibrated_pos, 4),
            rotation: math_utils::round_vec3(&calibrated_rot, 2),
        });
    }

    TrackerBatch { ts: now, trackers }
}

/// Return the number of connected tracked devices.
pub fn connected_device_count(system: &openvr::System) -> usize {
    (0..(MAX_DEVICES as u32))
        .filter(|&idx| system.is_tracked_device_connected(idx))
        .count()
}
