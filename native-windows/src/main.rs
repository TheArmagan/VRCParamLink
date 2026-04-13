mod calibration;
mod math_utils;
mod openvr_bridge;
mod types;
mod vrserver_check;

use std::io::{self, BufRead, Write};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use types::{HmdPoseResponse, LogEntry, StdinCommand};

/// Tick interval for the tracking loop (50ms = 20 Hz).
const TICK_INTERVAL: Duration = Duration::from_millis(50);

fn log_stderr(level: &'static str, msg: impl Into<String>, code: Option<&'static str>) {
    let entry = LogEntry {
        level,
        msg: msg.into(),
        code,
    };
    if let Ok(json) = serde_json::to_string(&entry) {
        let _ = eprintln!("{}", json);
    }
}

/// Spawn a thread that reads JSON commands from stdin line-by-line.
fn spawn_stdin_reader() -> mpsc::Receiver<StdinCommand> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let stdin = io::stdin();
        let reader = stdin.lock();
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<StdinCommand>(trimmed) {
                        Ok(cmd) => {
                            let is_exit = matches!(cmd, StdinCommand::Exit);
                            let _ = tx.send(cmd);
                            if is_exit {
                                return;
                            }
                        }
                        Err(_) => {
                            // Ignore malformed input
                        }
                    }
                }
                Err(_) => {
                    // stdin closed (Electron process exited) → send exit
                    let _ = tx.send(StdinCommand::Exit);
                    return;
                }
            }
        }
        // stdin EOF → Electron process closed the pipe
        let _ = tx.send(StdinCommand::Exit);
    });
    rx
}

fn main() {
    // ── Step 1: Check if vrserver.exe is running ──
    if !vrserver_check::is_vrserver_running() {
        log_stderr(
            "error",
            "vrserver.exe not running. Please start SteamVR first.",
            Some("NO_VRSERVER"),
        );
        std::process::exit(1);
    }
    log_stderr("info", "vrserver.exe detected", None);

    // ── Step 2: Initialize OpenVR immediately ──
    let context = match openvr_bridge::init_openvr() {
        Ok(ctx) => ctx,
        Err(e) => {
            log_stderr(
                "error",
                format!("OpenVR init failed: {}", e),
                Some("OPENVR_INIT_FAILED"),
            );
            std::process::exit(1);
        }
    };

    let system = match context.system() {
        Ok(sys) => sys,
        Err(e) => {
            log_stderr(
                "error",
                format!("Failed to get OpenVR system interface: {}", e),
                Some("OPENVR_SYSTEM_FAILED"),
            );
            std::process::exit(1);
        }
    };

    let device_count = openvr_bridge::connected_device_count(&system);
    log_stderr(
        "info",
        format!("OpenVR initialized, {} devices found", device_count),
        None,
    );

    // ── Step 3: Start stdin command reader ──
    let cmd_rx = spawn_stdin_reader();
    log_stderr("info", "Ready, waiting for commands on stdin...", None);

    let stdout = io::stdout();
    let mut stdout_lock = stdout.lock();
    let mut json_buf = Vec::with_capacity(4096);

    let mut tracking_active = false;
    let mut slots = Vec::new();
    let mut calibration = None;

    // ── Step 4: Main loop ──
    loop {
        let tick_start = Instant::now();

        // Drain all pending commands (non-blocking)
        loop {
            match cmd_rx.try_recv() {
                Ok(StdinCommand::Start) => {
                    // (Re)discover devices and calibrate
                    slots = openvr_bridge::discover_devices(&system);
                    log_stderr(
                        "info",
                        format!(
                            "Assigned {} device slots: {}",
                            slots.len(),
                            slots
                                .iter()
                                .map(|s| format!("{}→{}", s.device_index, s.osc_address))
                                .collect::<Vec<_>>()
                                .join(", ")
                        ),
                        None,
                    );

                    match calibration::calibrate(&system, &slots) {
                        Some(cal) => {
                            calibration = Some(cal);
                            tracking_active = true;
                            log_stderr("info", "Calibration complete, tracking started", None);
                        }
                        None => {
                            log_stderr(
                                "warn",
                                "Calibration failed: no valid device poses",
                                Some("CALIBRATION_FAILED"),
                            );
                        }
                    }
                }
                Ok(StdinCommand::Stop) => {
                    if tracking_active {
                        tracking_active = false;
                        log_stderr("info", "Tracking stopped", None);
                    }
                }
                Ok(StdinCommand::GetHmdPose) => {
                    // Read current HMD pose and write it to stdout
                    let poses = system.device_to_absolute_tracking_pose(
                        openvr::TrackingUniverseOrigin::Standing,
                        0.0,
                    );
                    let hmd_pose = &poses[0];
                    if hmd_pose.pose_is_valid() {
                        let matrix = hmd_pose.device_to_absolute_tracking();
                        let position = math_utils::position_from_matrix(matrix);
                        let rotation = math_utils::euler_from_matrix(matrix);
                        let response = HmdPoseResponse {
                            msg_type: "hmd_pose",
                            position: math_utils::round_vec3(&position, 4),
                            rotation: math_utils::round_vec3(&rotation, 2),
                        };
                        json_buf.clear();
                        if serde_json::to_writer(&mut json_buf, &response).is_ok() {
                            json_buf.push(b'\n');
                            let _ = stdout_lock.write_all(&json_buf);
                            let _ = stdout_lock.flush();
                        }
                    } else {
                        log_stderr("warn", "HMD pose not valid for get_hmd_pose", None);
                    }
                }
                Ok(StdinCommand::Exit) => {
                    log_stderr("info", "Exit command received, shutting down", None);
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => {
                    // stdin reader thread died → exit
                    log_stderr("info", "Stdin closed, shutting down", None);
                    return;
                }
            }
        }

        // Produce tracking data if active
        if tracking_active {
            if let Some(ref cal) = calibration {
                let batch = openvr_bridge::read_poses(&system, &slots, cal);

                if !batch.trackers.is_empty() {
                    json_buf.clear();
                    if serde_json::to_writer(&mut json_buf, &batch).is_ok() {
                        json_buf.push(b'\n');
                        let _ = stdout_lock.write_all(&json_buf);
                        let _ = stdout_lock.flush();
                    }
                }
            }
        }

        // Sleep for remaining tick time
        let elapsed = tick_start.elapsed();
        if elapsed < TICK_INTERVAL {
            thread::sleep(TICK_INTERVAL - elapsed);
        }
    }
}
