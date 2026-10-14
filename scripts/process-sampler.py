#!/usr/bin/env python3
"""Sample CPU and memory of ChatGPT's whole process tree while it works.

Every --interval seconds, records the CPU each process kind used since the last
sample (percent of one core): main, renderer, GPU, network, the Codex
app-server, and anything the agent spawns (shells, tools). Every --footprint
seconds it also records macOS's memory footprint of the tree. Writes JSON lines
to --out until --duration elapses or the app quits.

    python3 scripts/process-sampler.py --out /tmp/turn.jsonl --duration 180
"""
import argparse, json, os, re, subprocess, tempfile, time



def cpu_seconds(text):
    days, _, rest = text.rpartition("-")
    total = 0.0
    for part in rest.split(":"):
        total = total * 60 + float(part)
    return total + (int(days) * 86400 if days else 0)


def kind(cmd):
    exe = cmd.split(" --")[0]
    if exe.endswith("/Contents/MacOS/ChatGPT"):
        return "main"
    match = re.search(r"--type=([\w-]+)", cmd)
    if match:
        sub = re.search(r"--utility-sub-type=([\w.]+)", cmd)
        return "utility " + sub.group(1).split(".")[0] if sub else match.group(1)
    if "/codex-cli/" in exe and " app-server" in cmd:
        return "app-server"
    name = os.path.basename(exe.split(" ")[0])
    return name or exe[:40]


def tree(bundle):
    out = subprocess.run(["ps", "-axo", "pid=,ppid=,time=,rss=,command="], capture_output=True, text=True).stdout
    rows = {}
    for line in out.splitlines():
        pid, ppid, cpu, rss, cmd = line.split(None, 4)
        rows[int(pid)] = (int(ppid), cpu_seconds(cpu), int(rss), cmd)
    roots = [pid for pid, row in rows.items() if row[3].startswith(bundle + "Contents/MacOS/ChatGPT")]
    keep, frontier = set(roots), list(roots)
    while frontier:
        parent = frontier.pop()
        for pid, row in rows.items():
            if row[0] == parent and pid not in keep:
                keep.add(pid)
                frontier.append(pid)
    return {pid: rows[pid] for pid in keep}


def footprint_mb(pids):
    with tempfile.TemporaryDirectory() as directory:
        out = os.path.join(directory, "fp.json")
        args = [arg for pid in pids for arg in ("-p", str(pid))]
        if subprocess.run(["footprint", *args, "-j", out], capture_output=True).returncode:
            return None
        try:
            return round(json.load(open(out))["total footprint"] / 1048576)
        except (OSError, ValueError, KeyError):
            return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--interval", type=float, default=0.5)
    ap.add_argument("--footprint", type=float, default=5)
    ap.add_argument("--duration", type=float, default=300)
    ap.add_argument("--bundle", default="/Applications/ChatGPT.app", help="app bundle whose process tree to sample")
    args = ap.parse_args()
    bundle = args.bundle.rstrip("/") + "/"
    start, last_fp = time.time(), 0.0
    previous = tree(bundle)
    with open(args.out, "w") as f:
        while time.time() - start < args.duration:
            time.sleep(args.interval)
            now, current = time.time(), tree(bundle)
            if not current:
                break
            kinds, spawned = {}, []
            for pid, (ppid, cpu, rss, cmd) in current.items():
                before = previous.get(pid)
                delta = cpu - (before[1] if before else 0)
                k = kind(cmd)
                kinds[k] = kinds.get(k, 0) + delta
                if before is None:
                    spawned.append({"pid": pid, "kind": k, "cmd": cmd[:160]})
            sample = {"t": round(now, 3), "cpu_pct": {k: round(v / args.interval * 100, 1) for k, v in kinds.items() if v > 0},
                      "processes": len(current), "rss_mb": round(sum(row[2] for row in current.values()) / 1024)}
            if spawned:
                sample["spawned"] = spawned
            if now - last_fp >= args.footprint:
                sample["footprint_mb"], last_fp = footprint_mb(list(current)), now
            f.write(json.dumps(sample) + "\n")
            f.flush()
            previous = current


if __name__ == "__main__":
    main()
