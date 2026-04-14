use crate::math_utils;
use crate::types::{CalibrationSnapshot, DeviceSlot};

/// Perform T-Pose calibration by capturing current device positions
/// relative to the HMD.
pub fn calibrate(system: &openvr::System, slots: &[DeviceSlot]) -> Option<CalibrationSnapshot> {
    let poses = system
        .device_to_absolute_tracking_pose(openvr::TrackingUniverseOrigin::RawAndUncalibrated, 0.0);

    // HMD is always device index 0
    let hmd_pose = &poses[0];
    if !hmd_pose.pose_is_valid() {
        return None;
    }

    let hmd_matrix = hmd_pose.device_to_absolute_tracking();
    let hmd_position = math_utils::position_from_matrix(hmd_matrix);
    let hmd_rotation = math_utils::euler_from_matrix(hmd_matrix);

    // Build inverse rotation matrix for HMD (transpose of rotation part = inverse for orthogonal matrices)
    let hmd_rot_matrix = math_utils::rotation_matrix_from_euler(&hmd_rotation);
    let hmd_inv_rotation_matrix = math_utils::transpose_3x3(&hmd_rot_matrix);

    // Extract quaternion and compute inverse for rotation calibration
    let hmd_quat = math_utils::quat_from_matrix(hmd_matrix);
    let hmd_inv_quaternion = math_utils::quat_conjugate(&hmd_quat);

    // Verify at least some devices are valid
    let valid_count = slots
        .iter()
        .filter(|s| {
            let p = &poses[s.device_index as usize];
            p.pose_is_valid()
        })
        .count();

    if valid_count == 0 {
        return None;
    }

    Some(CalibrationSnapshot {
        hmd_position,
        hmd_rotation,
        hmd_inv_rotation_matrix,
        hmd_inv_quaternion,
    })
}
