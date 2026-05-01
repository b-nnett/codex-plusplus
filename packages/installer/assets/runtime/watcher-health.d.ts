type CheckStatus = "ok" | "warn" | "error";
export interface WatcherHealthCheck {
    name: string;
    status: CheckStatus;
    detail: string;
}
export interface WatcherHealth {
    checkedAt: string;
    status: CheckStatus;
    title: string;
    summary: string;
    watcher: string;
    checks: WatcherHealthCheck[];
}
export declare function getWatcherHealth(userRoot: string): WatcherHealth;
export declare function analyzeWatcherLogTail(tail: string): WatcherHealthCheck;
export {};
