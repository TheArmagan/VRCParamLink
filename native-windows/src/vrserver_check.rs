use sysinfo::System;

/// Check if `vrserver.exe` is currently running on the system.
/// Returns `true` if at least one process with that name is found.
pub fn is_vrserver_running() -> bool {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    sys.processes()
        .values()
        .any(|p| p.name().eq_ignore_ascii_case("vrserver.exe"))
}
