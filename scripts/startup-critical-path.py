#!/usr/bin/env python3
"""Find what ChatGPT's home screen waits for, from its own logs.

For each launch with an `app_start` span it rebuilds the timeline of app-server
requests (`response_routed ... durationMs ... method=`) and other log events,
places the span's marks (settings_ready, shell_visible, ...) on the same
clock, and ranks requests by how often they finish shortly before the shell
first paints. Works on untraced launches of either bundle.

    python3 scripts/startup-critical-path.py               # today's launches
    python3 scripts/startup-critical-path.py --pid 2465    # one launch, full timeline
"""
import argparse, glob, json, os, re, statistics
from collections import defaultdict
from datetime import datetime, timezone

LOGS = os.path.expanduser("~/Library/Logs/com.openai.codex")
ROUTED = re.compile(r"response_routed .*?durationMs=(\d+) .*?method=(\S+)")
FAILED = re.compile(r"Request failed .*?durationMs=(\d+) .*?method=(\S+)")


def ts(line):
    return datetime.strptime(line[:24], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc).timestamp() * 1000


def launches(day_glob):
    for path in sorted(glob.glob(os.path.join(LOGS, day_glob, "*-t0-*.log"))):
        with open(path, errors="replace") as f:
            lines = f.read().splitlines()
        span = next((l for l in lines if "name=app_start" in l and "timingQuality=foreground" in l), None)
        if not span:
            continue
        marks = json.loads(re.search(r"marksMs=(\{[^}]*\})", span).group(1))
        # The span is logged as soon as its last mark (sidebar_ready) lands, so
        # the log time anchors the marks to wall-clock time.
        end = ts(span)
        origin = end - max(marks.values())
        pid = int(re.search(r"-(\d+)-t\d+-", os.path.basename(path)).group(1))
        variant = "original" if any("codexpp-original" in l for l in lines[:40]) else "patched"
        requests = []
        for line in lines:
            match = ROUTED.search(line) or FAILED.search(line)
            if match and "originWebcontentsId=1" in line or match and "rendererWebContentsId=1" in line:
                done = ts(line)
                requests.append({"method": match.group(2), "start": done - int(match.group(1)), "end": done,
                                 "failed": "Request failed" in line})
        yield {"path": path, "pid": pid, "variant": variant, "origin": origin, "marks": marks, "requests": requests, "lines": lines}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", default="2026/10/1[12]", help="log directory glob under ~/Library/Logs/com.openai.codex")
    ap.add_argument("--pid", type=int, help="print one launch's full timeline")
    ap.add_argument("--window", type=float, default=400, help="ms before shell_visible that counts as 'just before'")
    args = ap.parse_args()
    runs = list(launches(args.days))
    if args.pid:
        run = next(r for r in runs if r["pid"] == args.pid)
        events = [(run["origin"] + v, f"MARK {k}") for k, v in run["marks"].items()]
        events += [(r["end"], f"done {r['method']} ({r['end'] - r['start']:.0f} ms){' FAILED' if r['failed'] else ''}") for r in run["requests"]]
        for line in run["lines"]:
            if re.search(r"account-lookup|runtime config|statsig|React root|ready-to-show|routes mounted|Codex CLI init", line):
                events.append((ts(line), "log  " + re.sub(r" renderer\w+=\S+", "", line[25:])[:110]))
        for when, text in sorted(events):
            if when <= run["origin"] + run["marks"]["sidebar_ready"] + 50:
                print(f"{when - run['origin']:8.0f} ms  {text}")
        return
    print(f"{len(runs)} foreground launches. For each request method: in how many launches it was still running at "
          f"settings_ready and finished within {args.window:.0f} ms before shell_visible.\n")
    gating, durations, seen = defaultdict(int), defaultdict(list), defaultdict(int)
    for run in runs:
        shell = run["origin"] + run["marks"]["shell_visible"]
        settings = run["origin"] + run["marks"]["settings_ready"]
        for method in {r["method"] for r in run["requests"]}:
            seen[method] += 1
        for method in {r["method"] for r in run["requests"] if shell - args.window <= r["end"] <= shell}:
            gating[method] += 1
        for r in run["requests"]:
            if r["start"] < shell:
                durations[r["method"]].append(r["end"] - r["start"])
    print(f"{'launches':>9} {'of':>4}  {'median ms':>9}  method")
    for method, count in sorted(gating.items(), key=lambda kv: -kv[1])[:25]:
        print(f"{count:9} {seen[method]:4}  {statistics.median(durations[method]):9.0f}  {method}")
    steps = defaultdict(list)
    for run in runs:
        m = run["marks"]
        steps["settings_ready → shell_visible"].append(m["shell_visible"] - m["settings_ready"])
    for name, values in steps.items():
        print(f"\n{name}: median {statistics.median(values):.0f} ms over {len(values)} launches")


if __name__ == "__main__":
    main()
