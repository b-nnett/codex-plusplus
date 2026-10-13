#!/usr/bin/env python3
"""Rank Codex++'s startup costs from traced launches.

Reads Diagnostics/startup-trace-<pid>.json files written by a patched app
launched with Diagnostics/trace.enable present (or CODEXPP_TRACE=1), finds
each launch's `app_start` span in ChatGPT's own log, and reports, per launch:

  * main-process Codex++ work (synchronous spans block the app's main thread),
  * main-thread stalls, attributed to overlapping Codex++ spans or to the app,
  * renderer long tasks, attributed to extension callbacks or to the app,
  * per-extension renderer callback cost.

It also introspects the whole app (vendor code included): CPU hotspots from the
main-process and main-window renderer profiles, module load self time, and
vendor IPC handler time, so patches can target the app's own startup work.

Only work that happened before `app_start` (home and sidebar ready) counts
toward the startup ranking; later work is shown as steady-state context.
"""
import argparse, glob, json, os, re, statistics, sys
from collections import defaultdict
from datetime import datetime, timezone

DIAGNOSTICS = os.path.expanduser("~/Library/Application Support/CodexPP/Diagnostics")
LOGS = os.path.expanduser("~/Library/Logs/com.openai.codex")
# Spans that contain other spans; ranked separately to avoid double counting.
CONTAINERS = {"bootstrap.total", "runtime.poll"}
OWN_IPC = re.compile(r"^ipc\.codexpp-")


def app_start_epoch_ms(pid):
    for path in glob.glob(os.path.join(LOGS, "**", f"*-{pid}-t*-*.log"), recursive=True):
        with open(path, errors="replace") as f:
            for line in f:
                if "name=app_start" in line:
                    stamp = datetime.strptime(line.split(" ", 1)[0], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
                    return stamp.timestamp() * 1000
    return None


def overlap(a_start, a_dur, b_start, b_dur):
    return max(0.0, min(a_start + a_dur, b_start + b_dur) - max(a_start, b_start))


def codexpp_span(name):
    return not name.startswith(("ipc.", "ipc:", "require:")) or bool(OWN_IPC.match(name))


def vendor_span(name):
    return name.startswith(("ipc:", "require:"))


def profile_hotspots(path, epoch_start, window_end):
    """Self time per function and per script for samples before window_end."""
    with open(path) as f:
        profile = json.load(f)
    nodes = {node["id"]: node for node in profile["nodes"]}
    functions, scripts, categories = defaultdict(float), defaultdict(float), defaultdict(float)
    t = profile["startTime"]
    samples, deltas = profile.get("samples", []), profile.get("timeDeltas", [])
    for index, node_id in enumerate(samples):
        t += deltas[index] if index < len(deltas) else 0
        nxt = deltas[index + 1] if index + 1 < len(deltas) else 0
        when = epoch_start + (t - profile["startTime"]) / 1000
        if window_end and when > window_end:
            break
        frame = nodes[node_id]["callFrame"]
        ms = max(nxt, 0) / 1000
        name = frame.get("functionName") or "(anonymous)"
        url = frame.get("url") or ""
        if name in ("(idle)", "(program)", "(garbage collector)", "(root)") and not url:
            categories[name] += ms
            continue
        script = "/".join(url.split("/")[-2:]) if url else "(native)"
        functions[f"{name}  {script}:{frame.get('lineNumber', -1) + 1}"] += ms
        scripts[script] += ms
        categories["(javascript)"] += ms
    return functions, scripts, categories


def attribute(blocks, spans):
    """Map each block (stall / long task) to the span overlapping it most."""
    out = defaultdict(float)
    for block in blocks:
        best, amount = None, 0.0
        for span in spans:
            shared = overlap(block["start"], block["dur"], span["start"], span["dur"])
            if shared > amount:
                best, amount = span["name"], shared
        out[best or "app (no Codex++ work overlapping)"] += block["dur"]
    return out


JANK_WINDOW_MS = 5000


def analyze(trace):
    end = app_start_epoch_ms(trace["pid"])
    start = trace["processStart"]
    window_end = end if end else trace["written"]
    main = [e for e in trace["events"] if e["kind"] == "sync"]
    in_window = [e for e in main if e["start"] < window_end]
    leaf = [e for e in in_window if e["name"] not in CONTAINERS and codexpp_span(e["name"])]
    vendor = [e for e in in_window if vendor_span(e["name"])]
    result = {
        "pid": trace["pid"],
        "app_start_ms": (end - start) if end else None,
        "whenReady_ms": (trace["whenReady"] - start) if trace.get("whenReady") else None,
        "bootstrap_start_ms": trace["bootstrapStart"] - start,
        "main_sync": defaultdict(lambda: [0, 0.0, 0.0]),
        "main_async": defaultdict(lambda: [0, 0.0]),
        "after_sync": defaultdict(lambda: [0, 0.0]),
        "stalls": {}, "stall_total": 0.0,
        "long_tasks": {}, "long_task_total": 0.0,
        "renderer": defaultdict(lambda: [0, 0.0, 0.0]),
        "dropped": trace.get("droppedEvents", 0),
        "complete": trace.get("complete", False),
        "modules": defaultdict(lambda: [0, 0.0, 0.0]),
        "vendor_ipc": defaultdict(lambda: [0, 0.0, 0.0]),
        "hotspots": {},
    }
    for e in in_window:
        if e["kind"] == "require":
            row = result["modules"][e["name"][8:]]
            row[0] += 1; row[1] += e["self"]; row[2] = max(row[2], e["self"])
        elif e["name"].startswith("ipc:") and e["kind"] == "sync":
            row = result["vendor_ipc"][e["name"][4:]]
            row[0] += 1; row[1] += e["dur"]; row[2] = max(row[2], e["dur"])
    for profile in trace.get("profiles", []):
        if profile["kind"] not in ("main", "renderer") or profile["kind"] == "renderer" and profile.get("page") != "/index.html":
            continue
        if os.path.exists(profile["file"]):
            key = "main" if profile["kind"] == "main" else "renderer"
            if key not in result["hotspots"]:
                result["hotspots"][key] = profile_hotspots(profile["file"], profile["epochStart"], end)
    for e in in_window:
        row = result["main_sync"][e["name"]]
        row[0] += 1; row[1] += e["dur"]; row[2] = max(row[2], e["dur"])
    for e in main:
        if e["start"] >= window_end:
            row = result["after_sync"][e["name"]]; row[0] += 1; row[1] += e["dur"]
    for e in trace["events"]:
        if e["kind"] == "async" and e["start"] < window_end:
            row = result["main_async"][e["name"]]; row[0] += 1; row[1] += e["dur"]
    stalls = [s for s in trace["stalls"] if s["start"] < window_end]
    # Prefer Codex++ spans; otherwise name the vendor IPC/module load running.
    own = attribute(stalls, leaf)
    unattributed = [s for s in stalls if not any(overlap(s["start"], s["dur"], e["start"], e["dur"]) for e in leaf)]
    result["stalls"] = {k: v for k, v in own.items() if not k.startswith("app (")}
    for name, ms in attribute(unattributed, vendor).items():
        key = name if name.startswith("app (") else "vendor " + name
        result["stalls"][key] = result["stalls"].get(key, 0.0) + ms
    result["stall_total"] = sum(s["dur"] for s in stalls)
    tasks, slow = [], []
    for report in trace.get("renderers", []):
        if report.get("page") != "/index.html":
            continue
        tasks += [t for t in report.get("longTasks", []) if t["start"] < window_end]
        # An async `start` spans awaited time; only synchronous callbacks can own a long task.
        slow += [{"name": s["name"], "start": s["start"], "dur": s["dur"]} for s in report.get("slow", []) if not s["name"].endswith(":start")]
        for stat in report.get("stats", []):
            row = result["renderer"][stat["name"]]
            row[0] += stat["count"]; row[1] += stat["totalMs"]; row[2] = max(row[2], stat["maxMs"])
    result["long_tasks"] = attribute(tasks, slow)
    result["long_task_total"] = sum(t["dur"] for t in tasks)
    # Jank once interactive: the visible window's long tasks in the 5 s after
    # app_start, when the user starts typing and scrolling.
    after = [t for r in trace.get("renderers", []) if r.get("visible") and r.get("page") == "/index.html"
             for t in r.get("longTasks", []) if end and end <= t["start"] < end + JANK_WINDOW_MS]
    result["jank"] = {"total": sum(t["dur"] for t in after), "worst": max((t["dur"] for t in after), default=0.0), "count": len(after)} if end else None
    return result


def med(values):
    return statistics.median(values) if values else 0.0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("traces", nargs="*", help="trace files (default: every startup-trace-*.json in Diagnostics)")
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--json", help="write the per-launch analysis here")
    args = ap.parse_args()
    paths = args.traces or sorted(glob.glob(os.path.join(DIAGNOSTICS, "startup-trace-*.json")), key=os.path.getmtime)
    if not paths:
        sys.exit("No startup traces. Create Diagnostics/trace.enable, then launch the patched app normally.")
    runs = []
    for path in paths:
        with open(path) as f:
            runs.append(analyze(json.load(f)))
    n = len(runs)
    timed = [r for r in runs if r["app_start_ms"]]
    print(f"{n} traced launch(es); {len(timed)} matched an app_start span. Figures are medians per launch.\n")
    if timed:
        print(f"process start → Codex++ bootstrap  {med([r['bootstrap_start_ms'] for r in timed]):8.1f} ms")
        print(f"process start → app.whenReady      {med([r['whenReady_ms'] for r in timed if r['whenReady_ms']]):8.1f} ms")
        print(f"process start → app_start          {med([r['app_start_ms'] for r in timed]):8.1f} ms\n")

    def per_launch(key, index=1):
        names = {name for r in runs for name in r[key]}
        rows = []
        for name in names:
            values = [r[key][name][index] if name in r[key] else 0.0 for r in runs]
            counts = [r[key][name][0] if name in r[key] else 0 for r in runs]
            rows.append((med(values), name, med(counts), max(values)))
        return sorted(rows, reverse=True)

    def table(title, rows, unit="ms", note=""):
        print(f"== {title}{note}")
        if not rows:
            print("   (none)\n"); return
        print(f"   {'median ' + unit:>12} {'worst':>9} {'calls':>7}  name")
        for value, name, count, worst in rows[:args.top]:
            print(f"   {value:12.1f} {worst:9.1f} {count:7.0f}  {name}")
        print()

    leaf_rows = [row for row in per_launch("main_sync") if row[1] not in CONTAINERS and codexpp_span(row[1])]
    table("Main thread: Codex++ synchronous work before app_start", leaf_rows)
    table("Main thread: containers (include the rows above)", [row for row in per_launch("main_sync") if row[1] in CONTAINERS])

    stall_names = {name for r in runs for name in r["stalls"]}
    stall_rows = sorted(((med([r["stalls"].get(name, 0.0) for r in runs]), name, 0, max(r["stalls"].get(name, 0.0) for r in runs)) for name in stall_names), reverse=True)
    print(f"== Main-thread stalls ≥30 ms before app_start: median total {med([r['stall_total'] for r in runs]):.1f} ms per launch")
    for value, name, _, worst in stall_rows[:args.top]:
        print(f"   {value:12.1f} {worst:9.1f}          {name}")
    print()

    task_names = {name for r in runs for name in r["long_tasks"]}
    task_rows = sorted(((med([r["long_tasks"].get(name, 0.0) for r in runs]), name, 0, max(r["long_tasks"].get(name, 0.0) for r in runs)) for name in task_names), reverse=True)
    jank = [r["jank"] for r in runs if r.get("jank")]
    if jank:
        print(f"== Jank in the {JANK_WINDOW_MS // 1000} s after app_start (visible window): median {med([j['total'] for j in jank]):.0f} ms blocked "
              f"in {med([j['count'] for j in jank]):.0f} long task(s), worst task {max(j['worst'] for j in jank):.0f} ms\n")
    print(f"== Renderer long tasks before app_start (main window): median total {med([r['long_task_total'] for r in runs]):.1f} ms per launch")
    for value, name, _, worst in task_rows[:args.top]:
        print(f"   {value:12.1f} {worst:9.1f}          {name}")
    print()

    table("Renderer: extension callbacks (main window, through the last trace collection)", per_launch("renderer"))
    table("Main thread: async latency before app_start (not blocking; for context)", [(v, n_, c, w) for v, n_, c, w in per_launch("main_async")])
    table("Main thread: Codex++ synchronous work after app_start (steady state, through quit)", [row for row in per_launch("after_sync") if row[1] not in CONTAINERS and codexpp_span(row[1])])
    vendor_ipc = [row for row in per_launch("main_sync") if row[1].startswith("ipc.") and not OWN_IPC.match(row[1])]
    table("Context: vendor IPC handled through the Codex++ wrapper before app_start", vendor_ipc)
    def hotspot_table(process, which, title):
        per = [r["hotspots"][process][which] for r in runs if process in r["hotspots"]]
        names = set().union(*per) if per else set()
        with_profile = len(per)
        if not with_profile:
            print(f"== {title}\n   (no {process} profile; let traced launches run until the trace is complete)\n")
            return
        rows = sorted(((med([p.get(n, 0.0) for p in per]), n, 0, max(p.get(n, 0.0) for p in per)) for n in names), reverse=True)
        print(f"== {title} ({with_profile} profile(s))")
        print(f"   {'median ms':>12} {'worst':>9}          name")
        for value, name, _, worst in rows[:args.top]:
            print(f"   {value:12.1f} {worst:9.1f}          {name}")
        print()

    print("######## Whole app (vendor + Codex++) before app_start ########\n")
    hotspot_table("main", 2, "Main process CPU by category")
    hotspot_table("main", 1, "Main process CPU self time by script")
    hotspot_table("main", 0, "Main process CPU self time by function")
    hotspot_table("renderer", 2, "Main-window renderer CPU by category")
    hotspot_table("renderer", 1, "Main-window renderer CPU self time by script")
    hotspot_table("renderer", 0, "Main-window renderer CPU self time by function")
    table("Module loads: self time (excluding nested loads)", per_launch("modules"))
    table("Vendor IPC handlers: synchronous time on the main thread", per_launch("vendor_ipc"))
    if any(not r["complete"] for r in runs):
        print(f"note: {sum(not r['complete'] for r in runs)} trace(s) ended before profiling finished (quit early)")
    if any(r["dropped"] for r in runs):
        print(f"warning: {sum(r['dropped'] for r in runs)} events were dropped at the per-launch cap")
    if args.json:
        with open(args.json, "w") as f:
            json.dump(runs, f, indent=2)


if __name__ == "__main__":
    main()
