import Darwin

public enum ProcessLiveness {
    /// Workspace termination notifications can lag after the actual process
    /// exits. Never probe process groups; permission denial still means alive.
    public static func isAlive(_ pid: Int32) -> Bool {
        guard pid > 0 else { return false }
        return kill(pid, 0) == 0 || errno == EPERM
    }
}
