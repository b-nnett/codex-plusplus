#!/usr/bin/env python3
"""Benchmark ChatGPT cold-launch time to interactivity, patched vs original.

Uses the app's own `client.performance.span name=app_start` log record (emitted
when the home surface and sidebar are ready) plus an external wall clock taken
just before `open`. Neither build needs DevTools or Accessibility access, so the
measurement is identical for both bundles.

"Cold" here means no ChatGPT process is running. The OS file cache stays warm
unless --purge is given (requires a cached `sudo` credential: run `sudo -v`).
"""
import argparse, glob, json, math, os, re, statistics, subprocess, sys, tempfile, time
from datetime import datetime, timezone

BUNDLE_ID = "com.openai.codex"
LOGS = os.path.expanduser("~/Library/Logs/com.openai.codex")
BOOT = os.path.expanduser("~/Library/Application Support/CodexPP/Diagnostics/boot.json")
SETTINGS = os.path.expanduser("~/Library/Application Support/CodexPP/settings.json")


def default_original(patched):
    backups = sorted(glob.glob(os.path.join(os.path.dirname(patched), ".ChatGPT.codexpp-original-*.app")), key=os.path.getmtime)
    return backups[-1] if backups else None


def bundle_pids(bundle):
    out = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True).stdout
    pids = []
    for line in out.splitlines():
        pid, _, cmd = line.strip().partition(" ")
        # Main executable and Electron helper apps only; crashpad and bundled
        # tool runtimes (cua_node, codex-cli) can outlive the app by design.
        if cmd.startswith(bundle + "/Contents/MacOS/") or (cmd.startswith(bundle + "/Contents/Frameworks/") and ".app/Contents/MacOS/" in cmd):
            pids.append(int(pid))
    return pids


def any_app_pids(bundles):
    return [p for b in bundles for p in bundle_pids(b)]


def cpu_seconds(text):
    # ps `time` is [[DD-]HH:]MM:SS.ss
    days, _, rest = text.rpartition("-")
    parts = [float(x) for x in rest.split(":")]
    total = 0.0
    for part in parts:
        total = total * 60 + part
    return total + (int(days) * 86400 if days else 0)


def processes(prefixes, rss=False):
    out = subprocess.run(["ps", "-axo", "pid=,time=,rss=,command="], capture_output=True, text=True).stdout
    found = []
    for line in out.splitlines():
        pid, cpu, kb, cmd = line.split(None, 3)
        if any(cmd.startswith(p + "/") for p in prefixes):
            found.append((int(pid), cpu_seconds(cpu), cmd, int(kb) / 1024) if rss else (int(pid), cpu_seconds(cpu), cmd))
    return found


def quit_app(bundles, timeout=60):
    if not any_app_pids(bundles):
        return
    subprocess.run(["osascript", "-e", f'tell application id "{BUNDLE_ID}" to quit'], capture_output=True)
    deadline = time.time() + timeout
    while time.time() < deadline and any_app_pids(bundles):
        time.sleep(0.25)
    if any_app_pids(bundles):
        # A quit that hangs (dialog, stuck window) falls back to SIGTERM, which
        # Electron also handles as a normal quit.
        print(f"        ChatGPT did not quit within {timeout}s; sending SIGTERM", flush=True)
        subprocess.run(["kill", "-TERM", *map(str, any_app_pids(bundles))], capture_output=True)
        deadline = time.time() + 20
        while time.time() < deadline and any_app_pids(bundles):
            time.sleep(0.25)
    if any_app_pids(bundles):
        sys.exit(f"ChatGPT did not exit; still running: {any_app_pids(bundles)}")


def kill_leftovers(bundles):
    # Crashpad handlers and bundled tool runtimes (cua_node, codex-cli) outlive
    # the app; clear them so every launch starts from the same process table.
    for sig in ("TERM", "KILL"):
        pids = [pid for pid, _, _ in processes(bundles)]
        if not pids:
            return
        subprocess.run(["kill", f"-{sig}", *map(str, pids)], capture_output=True)
        time.sleep(2)


def parse_ts(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc).timestamp()


def find_app_start(t0, bundle, timeout):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for path in glob.glob(os.path.join(LOGS, "**", "*.log"), recursive=True):
            if os.path.getmtime(path) < t0:
                continue
            with open(path, errors="replace") as f:
                text = f.read()
            if f"executablePath={bundle}/" not in text:
                continue
            for line in text.splitlines():
                if "name=app_start" not in line:
                    continue
                ts = parse_ts(line.split(" ", 1)[0])
                if ts < t0:
                    continue
                return ts, line, text, path
        time.sleep(0.25)
    return None


def num(pattern, text):
    m = re.search(pattern, text)
    return float(m.group(1)) if m else None


class Recorder:
    """Films one launch with ffmpeg/AVFoundation. Frames carry host-clock
    timestamps (-copyts) on CLOCK_UPTIME_RAW (mach_absolute_time), so the
    launch instant can be located in the video exactly."""

    def __init__(self, directory, name):
        self.path = os.path.join(directory, f"{name}.mov")
        os.makedirs(directory, exist_ok=True)
        devices = subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
                                 capture_output=True, text=True).stderr
        screen = re.search(r"\[(\d+)\] Capture screen 0", devices)
        if not screen:
            sys.exit("--record: no AVFoundation screen device; grant Screen Recording and retry.")
        self.process = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "avfoundation", "-pixel_format", "nv12", "-capture_cursor", "0",
             "-framerate", "30", "-i", f"{screen.group(1)}:none", "-copyts", "-c:v", "h264_videotoolbox", "-b:v", "20M",
             "-an", self.path], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        deadline = time.time() + 10
        while time.time() < deadline and (not os.path.exists(self.path) or os.path.getsize(self.path) < 4096):
            if self.process.poll() is not None:
                sys.exit(f"--record: ffmpeg exited: {self.process.stderr.read().decode()[-400:]}")
            time.sleep(0.1)
        if not os.path.exists(self.path):
            self.stop()
            sys.exit("--record: no frames after 10 s; grant Screen Recording to this terminal/app and retry.")
        time.sleep(0.7)  # a few frames of the desktop before the launch

    def stop(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write(b"q")
                self.process.stdin.flush()
                self.process.wait(timeout=15)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.process.kill()


def window_bounds(pid):
    helper = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".build", "window-bounds")
    source = os.path.join(os.path.dirname(os.path.abspath(__file__)), "window-bounds.swift")
    if not os.path.exists(helper) or os.path.getmtime(helper) < os.path.getmtime(source):
        os.makedirs(os.path.dirname(helper), exist_ok=True)
        subprocess.run(["swiftc", "-O", source, "-o", helper], check=True, capture_output=True)
    out = subprocess.run([helper, str(pid)], capture_output=True, text=True)
    return json.loads(out.stdout) if out.returncode == 0 else None


def measure(bundle, label, args, env=(), recording=None):
    if args.purge:
        if subprocess.run(["sudo", "-n", "purge"]).returncode != 0:
            sys.exit("--purge needs a cached sudo credential; run `sudo -v` first.")
    time.sleep(args.settle)
    helper_before = sum(cpu for _, cpu, _ in processes([args.helper]))
    recorder = Recorder(args.record, recording) if recording else None
    t0, t0_mono = time.time(), time.clock_gettime(time.CLOCK_UPTIME_RAW)
    subprocess.run(["open", "-a", bundle, *[part for item in env for part in ("--env", item)]], check=True)
    found = find_app_start(t0, bundle, args.timeout)
    if not found:
        if recorder:
            recorder.stop()
        return {"variant": label, "error": "no app_start span"}
    ts, line, text, log_path = found
    # CPU spent by every process the launch created (app, renderers, GPU,
    # app-server, Appshot warmup, ...) plus the helper's share, up to app_start.
    app_cpu = sum(cpu for _, cpu, _ in processes([bundle]))
    app_procs = len(processes([bundle]))
    helper_cpu = sum(cpu for _, cpu, _ in processes([args.helper])) - helper_before
    marks = json.loads(re.search(r"marksMs=(\{[^}]*\})", line).group(1))
    phases = json.loads(re.search(r"hostStartupPhaseDurationsMs=(\{[^}]*\})", line).group(1))
    ready = re.search(r"window ready-to-show appearance=primary .*?startupElapsedMs=(\d+)", text)
    routes = re.search(r"app routes mounted after (\d+)ms", text)
    host = re.search(r"\[startup\] \[[\d.]+\] Host startup critical-path phases completed startupElapsedMs=(\d+)", text)
    pid = re.search(r"-(\d+)-t\d+-", os.path.basename(log_path))
    result = {
        "variant": label,
        "pid": int(pid.group(1)) if pid else None,
        "wall_tti_ms": round((ts - t0) * 1000, 1),
        "outcome": re.search(r"outcome=(\w+)", line).group(1),
        # The span gates home_visible on the window actually being shown; a
        # backgrounded/occluded window inflates it by however long it was hidden.
        "timing_quality": (re.search(r"timingQuality=(\w+)", line) or [None, None])[1],
        "background_ms": num(r"backgroundDurationMs=([\d.]+)", line),
        "initial_surface": re.search(r"initialSurface=(\w+)", line).group(1),
        "process_to_preload_ms": num(r"processToPreloadDurationMs=([\d.]+)", line),
        "span_duration_ms": num(r"durationMs=([\d.]+) ", line.split("client.performance.span", 1)[1]),
        "marks": marks,
        "local_ms": (num(r"processToPreloadDurationMs=([\d.]+)", line) or 0) + marks.get("renderer_ready", 0),
        "network_phase_ms": marks.get("home_visible", 0) - marks.get("renderer_ready", 0),
        "app_cpu_s": round(app_cpu, 2),
        "app_processes": app_procs,
        "helper_cpu_s": round(helper_cpu, 2),
        "host_phases": phases,
        "host_critical_path_ms": float(host.group(1)) if host else None,
        "ready_to_show_ms": float(ready.group(1)) if ready else None,
        "routes_mounted_ms": float(routes.group(1)) if routes else None,
    }
    if label.startswith("patched"):
        try:
            boot = json.load(open(BOOT))
            result["codexpp_boot_after_launch"] = parse_ts(boot["time"]) >= t0
        except (OSError, KeyError, ValueError):
            result["codexpp_boot_after_launch"] = False
    if label == "patched-traced" and result["pid"]:
        # Keep the app open until the tracer has written every profile.
        trace_file = os.path.join(os.path.dirname(BOOT), f"startup-trace-{result['pid']}.json")
        deadline = time.time() + args.trace_wait
        while time.time() < deadline:
            try:
                if json.load(open(trace_file)).get("complete"):
                    break
            except (OSError, ValueError):
                pass
            time.sleep(0.5)
        else:
            print(f"        warning: trace for pid {result['pid']} incomplete after {args.trace_wait:.0f}s", flush=True)
    if recorder:
        result["video"] = {"path": recorder.path, "launch_mono": t0_mono, "interactive_mono": t0_mono + (ts - t0),
                           "window": window_bounds(result["pid"]) if result["pid"] else None}
        time.sleep(2)
        recorder.stop()
    if args.steady:
        # Steady state: total CPU and resident memory (summed RSS, so shared
        # pages count once per process) a fixed time after launch.
        time.sleep(max(0, t0 + args.steady - time.time()))
        procs = processes([bundle], rss=True)
        result["steady_cpu_s"] = round(sum(p[1] for p in procs), 2)
        result["steady_rss_mb"] = round(sum(p[3] for p in procs))
        result["steady_processes"] = len(procs)
        # Summed RSS counts shared pages once per process; macOS's footprint
        # (dirty, compressed and swapped memory each process owns) does not.
        result["steady_footprint_mb"] = footprint_mb([p[0] for p in procs])
    if args.idle:
        # Idle cost: CPU used between two points after launch, with nobody
        # touching the app, as a percentage of one core, per process kind.
        start, end = args.idle
        time.sleep(max(0, t0 + start - time.time()))
        before = {p[0]: (p[1], p[2]) for p in processes([bundle])}
        time.sleep(max(0, t0 + end - time.time()))
        after = {p[0]: (p[1], p[2]) for p in processes([bundle])}
        kinds = {}
        for pid, (cpu, cmd) in after.items():
            kind = process_kind(cmd)
            kinds[kind] = kinds.get(kind, 0) + cpu - before.get(pid, (0, cmd))[0]
        result["idle_cpu_pct"] = round(sum(kinds.values()) / (end - start) * 100, 2)
        result["idle_by_kind"] = {k: round(v / (end - start) * 100, 2) for k, v in sorted(kinds.items(), key=lambda kv: -kv[1])}
    time.sleep(args.linger)
    return result


def footprint_mb(pids):
    if not pids:
        return None
    with tempfile.TemporaryDirectory() as directory:
        out = os.path.join(directory, "footprint.json")
        args = [arg for pid in pids for arg in ("-p", str(pid))]
        if subprocess.run(["footprint", *args, "-j", out], capture_output=True).returncode != 0:
            return None
        try:
            return round(json.load(open(out))["total footprint"] / 1048576)
        except (OSError, ValueError, KeyError):
            return None


def process_kind(cmd):
    exe = cmd.split(" --")[0]
    if exe.endswith("/Contents/MacOS/ChatGPT"):
        return "main"
    for flag in ("--type=renderer", "--type=gpu-process"):
        if flag in cmd:
            return flag.split("=")[1]
    util = re.search(r"--utility-sub-type=([\w.]+)", cmd)
    if util:
        return "utility " + util.group(1).split(".")[0]
    return os.path.basename(exe.split(" ")[0]) or exe[:40]


METRICS = [("wall_tti_ms", lambda r: r["wall_tti_ms"]),
           ("local_ms (preload+rr)", lambda r: r["local_ms"]),
           ("network_phase_ms", lambda r: r["network_phase_ms"]),
           ("app_cpu_s @app_start", lambda r: r["app_cpu_s"]),
           ("helper_cpu_s", lambda r: r["helper_cpu_s"]),
           ("steady_cpu_s", lambda r: r.get("steady_cpu_s")),
           ("steady_rss_mb", lambda r: r.get("steady_rss_mb")),
           ("steady_processes", lambda r: r.get("steady_processes")),
           ("steady_footprint_mb", lambda r: r.get("steady_footprint_mb")),
           ("idle_cpu_pct", lambda r: r.get("idle_cpu_pct")),
           ("app_processes", lambda r: r["app_processes"]),
           ("process_to_preload_ms", lambda r: r["process_to_preload_ms"]),
           ("ready_to_show_ms", lambda r: r["ready_to_show_ms"]),
           ("renderer_ready", lambda r: r["marks"].get("renderer_ready")),
           ("settings_ready", lambda r: r["marks"].get("settings_ready")),
           ("home_visible", lambda r: r["marks"].get("home_visible")),
           ("sidebar_ready", lambda r: r["marks"].get("sidebar_ready")),
           ("host_critical_path_ms", lambda r: r["host_critical_path_ms"]),
           ("bootstrap handoff", lambda r: r["host_phases"].get("bootstrap handoff complete"))]


def summarize(results, variants):
    ok = [r for r in results if "error" not in r]
    base, others = variants[0], variants[1:]
    print(f"\nmedians (p25–p75); Δ is against {base}")
    print(f"{'metric':24} " + " ".join(f"{v:>22}" for v in variants) + "".join(f" {'Δ ' + v:>24}" for v in others))
    summary = {}
    q = lambda xs: (xs[len(xs) // 4], xs[(3 * len(xs)) // 4])
    for name, get in METRICS:
        cols = {v: sorted(x for x in (get(r) for r in ok if r["variant"] == v) if x is not None) for v in variants}
        if not all(cols.values()):
            continue
        med = {v: statistics.median(xs) for v, xs in cols.items()}
        summary[name] = {v: {"median": med[v], "values": cols[v]} for v in variants}
        cells = " ".join(f"{med[v]:9.1f} ({q(cols[v])[0]:.0f}–{q(cols[v])[1]:.0f})".rjust(22) for v in variants)
        deltas = "".join(f" {med[v] - med[base]:+12.1f} ({(med[v] - med[base]) / med[base] * 100 if med[base] else 0:+5.1f}%)".rjust(25) for v in others)
        print(f"{name:24} {cells}{deltas}")
    print()
    for v in others:
        for metric in ("wall_tti_ms", "local_ms (preload+rr)", "network_phase_ms", "app_cpu_s @app_start", "steady_cpu_s", "steady_rss_mb", "steady_footprint_mb", "idle_cpu_pct"):
            if metric in summary:
                summary.setdefault("tests", {})[f"{v} vs {base}: {metric}"] = mann_whitney(summary[metric][base]["values"], summary[metric][v]["values"], f"{v} vs {base}: {metric}")
    errors = [r for r in results if "error" in r]
    if errors:
        print(f"{len(errors)} run(s) failed: {[(r['variant'], r['error']) for r in errors]}")
    return summary


def mann_whitney(a, b, label):
    # Two-sided Mann–Whitney U, normal approximation with average ranks for ties.
    if len(a) < 3 or len(b) < 3:
        return None
    ranked = sorted([(x, 0) for x in a] + [(x, 1) for x in b])
    ranks = [0.0] * len(ranked)
    i = 0
    while i < len(ranked):
        j = i
        while j + 1 < len(ranked) and ranked[j + 1][0] == ranked[i][0]:
            j += 1
        for k in range(i, j + 1):
            ranks[k] = (i + j) / 2 + 1
        i = j + 1
    n1, n2 = len(a), len(b)
    u = sum(ranks[k] for k, (_, g) in enumerate(ranked) if g == 1) - n2 * (n2 + 1) / 2
    mu, sigma = n1 * n2 / 2, (n1 * n2 * (n1 + n2 + 1) / 12) ** 0.5
    z = (u - mu) / sigma
    p = 2 * (1 - 0.5 * (1 + math.erf(abs(z) / 2 ** 0.5)))
    # z > 0 means the second sample tends to be larger (slower / more CPU).
    print(f"Mann–Whitney {label:52} z={z:+.2f}  p≈{p:.3f}  (n={n1} vs {n2})")
    return {"U": u, "z": z, "p_two_sided": p}


class PausedExtensions:
    """Temporarily sets extensionsPaused in Codex++ settings; restores the exact bytes."""

    def __init__(self, enabled):
        self.enabled, self.saved = enabled, None

    def __enter__(self):
        if self.enabled:
            with open(SETTINGS, "rb") as f:
                self.saved = f.read()
            value = json.loads(self.saved)
            value["extensionsPaused"] = True
            tmp = SETTINGS + ".bench.tmp"
            with open(tmp, "w") as f:
                json.dump(value, f)
            os.chmod(tmp, 0o600)
            os.replace(tmp, SETTINGS)
        return self

    def __exit__(self, *_):
        if self.saved is not None:
            tmp = SETTINGS + ".bench.tmp"
            with open(tmp, "wb") as f:
                f.write(self.saved)
            os.chmod(tmp, 0o600)
            os.replace(tmp, SETTINGS)
            self.saved = None


class TraceEnabled:
    """Enables tracing for one launch through Diagnostics/trace.enable. `open
    --env` would also work but launches ChatGPT in the background, and its
    startup span never completes for a hidden window."""

    def __init__(self, enabled, settings):
        self.enabled, self.settings = enabled, settings
        self.file = os.path.join(os.path.dirname(BOOT), "trace.enable")

    def __enter__(self):
        if self.enabled:
            with open(self.file, "w") as f:
                f.write("".join(f"{item}\n" for item in self.settings))
        return self

    def __exit__(self, *_):
        if self.enabled and os.path.exists(self.file):
            os.remove(self.file)


class Experiments:
    """Enables Codex++ startup experiments (Diagnostics/experiments.json) for one launch."""

    def __init__(self, enabled, names):
        self.enabled, self.names = enabled and bool(names), names
        self.file = os.path.join(os.path.dirname(BOOT), "experiments.json")

    def __enter__(self):
        if self.enabled:
            # NAME or NAME=VALUE (a string value, e.g. jsFlags=--max-semi-space-size=64).
            settings = {}
            for name in self.names:
                key, sep, value = name.partition("=")
                settings[key] = value if sep else True
            with open(self.file, "w") as f:
                json.dump(settings, f)
        return self

    def __exit__(self, *_):
        if self.enabled and os.path.exists(self.file):
            os.remove(self.file)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--patched", default="/Applications/ChatGPT.app")
    ap.add_argument("--original", help="original bundle (default: newest .ChatGPT.codexpp-original-*.app beside --patched)")
    ap.add_argument("--variants", default="original,patched",
                    help="comma list from original, patched, patched-paused (extensions paused), patched-traced (CODEXPP_TRACE=1; "
                         "traces are kept and ranked by scripts/trace-report.py); the first is the baseline")
    ap.add_argument("--runs", type=int, default=10, help="measured runs per variant")
    ap.add_argument("--warmup", type=int, default=1, help="discarded runs per variant")
    ap.add_argument("--settle", type=float, default=8, help="idle seconds before each launch")
    ap.add_argument("--idle", type=lambda v: tuple(float(x) for x in v.split(":")), help="START:END seconds after launch; report CPU used in between (percent of one core)")
    ap.add_argument("--steady", type=float, default=0, help="also sample total CPU and memory this many seconds after launch")
    ap.add_argument("--linger", type=float, default=4, help="seconds to keep the app open after app_start")
    ap.add_argument("--timeout", type=float, default=90)
    ap.add_argument("--helper", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "Codex++.app"))
    ap.add_argument("--record", metavar="DIR", help="film every measured launch into DIR (needs Screen Recording); "
                    "render with scripts/launch-video.py")
    ap.add_argument("--experiment", action="append", default=[], metavar="NAME",
                    help="startup experiment enabled for patched-exp launches (e.g. css); needs a helper built with CODEXPP_EXPERIMENTS=1")
    ap.add_argument("--trace-env", action="append", default=[], metavar="KEY=VALUE",
                    help="probe switch for traced launches, e.g. CODEXPP_TRACE_RENDERER_PROFILE=0 (written to trace.enable)")
    ap.add_argument("--trace-wait", type=float, default=60, help="seconds to wait for a traced launch's profiles")
    ap.add_argument("--retries", type=int, default=3, help="relaunches allowed when the window was backgrounded")
    ap.add_argument("--purge", action="store_true", help="flush the file cache before each launch (sudo)")
    ap.add_argument("--out", help="write raw results JSON here")
    args = ap.parse_args()
    patched = os.path.realpath(args.patched)
    original = os.path.realpath(args.original or default_original(patched) or "")
    if not os.path.isdir(original):
        sys.exit("Original bundle not found; pass --original.")
    variants = args.variants.split(",")
    paths = {"original": original, "patched": patched, "patched-paused": patched, "patched-traced": patched, "patched-exp": patched}
    trace_dir = (args.out or os.path.join(os.getcwd(), "startup")) + ".traces"
    if any(v not in paths for v in variants) or len(set(variants)) != len(variants):
        sys.exit(f"--variants must be distinct values from {sorted(paths)}")
    if "patched-paused" in variants and json.load(open(SETTINGS)).get("extensionsPaused"):
        sys.exit("Codex++ extensions are already paused; patched and patched-paused would be identical.")
    bundles = sorted({paths[v] for v in variants})
    print(f"patched:  {patched}\noriginal: {original}\nvariants: {variants}")

    # Rotate and alternate the variant order every round so linear drift
    # (thermal, cache, background activity) cancels out across variants.
    order = []
    for i in range(args.warmup + args.runs):
        k = i % len(variants)
        rnd = variants[k:] + variants[:k]
        if (i // len(variants)) % 2:
            rnd.reverse()
        order += [(v, i < args.warmup) for v in rnd]

    results = []
    for n, (variant, warm) in enumerate(order, 1):
        for attempt in range(args.retries + 1):
            quit_app(bundles)
            kill_leftovers(bundles)
            with PausedExtensions(variant == "patched-paused"), TraceEnabled(variant == "patched-traced", args.trace_env), \
                    Experiments(variant == "patched-exp", args.experiment):
                r = measure(paths[variant], variant, args,
                            recording=f"{n:02d}-{variant}-{attempt}" if args.record and not warm else None)
                quit_app(bundles)
            if variant == "patched-traced" and r.get("pid"):
                # The quit flush is synchronous; keep this launch's trace.
                source = os.path.join(os.path.dirname(BOOT), f"startup-trace-{r['pid']}.json")
                if os.path.exists(source):
                    os.makedirs(trace_dir, exist_ok=True)
                    r["trace"] = os.path.join(trace_dir, os.path.basename(source))
                    with open(source) as f:
                        data = json.load(f)
                    for profile in data.get("profiles", []):
                        if os.path.exists(profile["file"]):
                            moved = os.path.join(trace_dir, os.path.basename(profile["file"]))
                            os.replace(profile["file"], moved)
                            profile["file"] = moved
                    with open(r["trace"], "w") as f:
                        json.dump(data, f)
                    os.remove(source)
                else:
                    print(f"        warning: no startup trace for pid {r['pid']}", flush=True)
            r["warmup"] = warm
            if "error" in r or (r["timing_quality"] == "foreground" and not r["background_ms"]):
                break
            print(f"[{n:2}/{len(order)}] {variant:14} discarded: window was backgrounded for {r['background_ms']:.0f} ms; retrying", flush=True)
            r["error"] = "backgrounded"
        tag = "warmup" if warm else "run"
        detail = r.get("error") or f"wall TTI {r['wall_tti_ms']:.0f} ms, local {r['local_ms']:.0f}, network {r['network_phase_ms']:.0f}, cpu {r['app_cpu_s']:.1f}s (+helper {r['helper_cpu_s']:.2f}s)" + (f", @steady cpu {r['steady_cpu_s']:.1f}s rss {r['steady_rss_mb']} MB footprint {r.get('steady_footprint_mb')} MB x{r['steady_processes']}" if r.get("steady_cpu_s") is not None else "") + (f", idle {r['idle_cpu_pct']:.1f}% {dict(list(r['idle_by_kind'].items())[:4])}" if r.get("idle_cpu_pct") is not None else "")
        print(f"[{n:2}/{len(order)}] {tag:6} {variant:14} {detail}", flush=True)
        if variant.startswith("patched") and r.get("codexpp_boot_after_launch") is False:
            print("        warning: Codex++ boot.json was not refreshed by this launch", flush=True)
        results.append(r)
    quit_app(bundles)
    kill_leftovers(bundles)

    summary = summarize([r for r in results if not r["warmup"]], variants)
    if args.out:
        with open(args.out, "w") as f:
            json.dump({"patched": patched, "original": original, "args": vars(args), "results": results, "summary": summary}, f, indent=2)
        print(f"raw results: {args.out}")
    traces = [r["trace"] for r in results if not r["warmup"] and r.get("trace")]
    if traces:
        print(f"\nCodex++ startup trace ({len(traces)} launches, {trace_dir}):\n", flush=True)
        subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "trace-report.py"), *traces])


if __name__ == "__main__":
    main()
