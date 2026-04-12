use std::f32::consts::PI;

/// Extract position (x, y, z) from a 3×4 OpenVR tracking matrix.
/// Matrix layout:
/// [m00 m01 m02 m03]   m03 = x
/// [m10 m11 m12 m13]   m13 = y
/// [m20 m21 m22 m23]   m23 = z
#[inline]
pub fn position_from_matrix(m: &[[f32; 4]; 3]) -> [f32; 3] {
    [m[0][3], m[1][3], m[2][3]]
}

/// Extract euler angles (degrees) from a 3×4 OpenVR tracking matrix.
/// Uses Unity's Z-X-Y rotation order.
/// Returns [pitch_x, yaw_y, roll_z] in degrees.
#[inline]
pub fn euler_from_matrix(m: &[[f32; 4]; 3]) -> [f32; 3] {
    let sy = -m[2][0];
    let cy = (m[0][0] * m[0][0] + m[1][0] * m[1][0]).sqrt();

    let (pitch, yaw, roll) = if cy > 1e-6 {
        let pitch = sy.atan2(cy);
        let yaw = m[2][0].atan2(m[2][2]).neg_or(m[1][0].atan2(m[0][0]));
        let roll = m[0][1].atan2(m[1][1]);
        (pitch, yaw, roll)
    } else {
        // Gimbal lock
        let pitch = sy.atan2(cy);
        let yaw = (-m[0][2]).atan2(m[0][0]);
        let roll = 0.0;
        (pitch, yaw, roll)
    };

    // Recalculate with proper Unity convention
    let pitch_x = (-m[2][1]).asin();
    let yaw_y = m[2][0].atan2(m[2][2]);
    let roll_z = m[0][1].atan2(m[1][1]);

    let _ = (pitch, yaw, roll); // suppress unused

    [
        pitch_x * (180.0 / PI),
        yaw_y * (180.0 / PI),
        roll_z * (180.0 / PI),
    ]
}

/// Build a 3×3 rotation matrix from euler angles (degrees, Z-X-Y order).
pub fn rotation_matrix_from_euler(euler_deg: &[f32; 3]) -> [[f32; 3]; 3] {
    let x = euler_deg[0] * (PI / 180.0);
    let y = euler_deg[1] * (PI / 180.0);
    let z = euler_deg[2] * (PI / 180.0);

    let (sx, cx) = x.sin_cos();
    let (sy, cy) = y.sin_cos();
    let (sz, cz) = z.sin_cos();

    // Z-X-Y rotation order
    [
        [cy * cz + sy * sx * sz, cz * sy * sx - cy * sz, cx * sy],
        [cx * sz, cx * cz, -sx],
        [cy * sx * sz - cz * sy, sy * sz + cy * cz * sx, cx * cy],
    ]
}

/// Transpose a 3×3 matrix (for computing inverse of an orthogonal rotation matrix).
pub fn transpose_3x3(m: &[[f32; 3]; 3]) -> [[f32; 3]; 3] {
    [
        [m[0][0], m[1][0], m[2][0]],
        [m[0][1], m[1][1], m[2][1]],
        [m[0][2], m[1][2], m[2][2]],
    ]
}

/// Multiply a 3×3 matrix by a 3-vector.
pub fn mat3_mul_vec3(m: &[[f32; 3]; 3], v: &[f32; 3]) -> [f32; 3] {
    [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ]
}

/// Subtract two 3-vectors: a - b.
pub fn vec3_sub(a: &[f32; 3], b: &[f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/// Round f32 to N decimal places for cleaner JSON output.
#[inline]
pub fn round_f32(v: f32, decimals: u32) -> f32 {
    let factor = 10f32.powi(decimals as i32);
    (v * factor).round() / factor
}

/// Round a 3-vector to N decimal places.
pub fn round_vec3(v: &[f32; 3], decimals: u32) -> [f32; 3] {
    [
        round_f32(v[0], decimals),
        round_f32(v[1], decimals),
        round_f32(v[2], decimals),
    ]
}

trait NegOr {
    fn neg_or(self, alt: Self) -> Self;
}

impl NegOr for f32 {
    #[inline]
    fn neg_or(self, _alt: Self) -> Self {
        self
    }
}
