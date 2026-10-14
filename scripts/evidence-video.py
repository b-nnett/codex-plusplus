#!/usr/bin/env python3
"""Film before/after evidence clips of ChatGPT with and without Codex++.

Each scenario launches every variant the same way, films the ChatGPT window
while sampling the CPU of its whole process tree, and renders a labelled clip
per variant (with a live CPU readout) plus a side-by-side.

  resize   open a thread, then drive the same 240-step window resize through
           System Events (the side panel's state is whatever the thread had)
  idle     the home screen with its composer focused and untouched for 20 s
  shimmer  a fixed "Thinking" shimmer (demoShimmer experiment): the original
           shimmer code against the compositor one, both on the patched app

    python3 scripts/evidence-video.py resize --thread codex://threads/... --out dist/evidence/resize
"""
import argparse, json, math, os, signal, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATCHED = "/Applications/ChatGPT.app"
SUPPORT = os.path.expanduser("~/Library/Application Support/CodexPP")
LABELS = {"original": "Stock ChatGPT", "patched": "ChatGPT + Codex++", "patched-paused": "Codex++ (extensions paused)",
          "shimmer-original": "Original shimmer", "shimmer-compositor": "Codex++ compositor shimmer"}


def original_bundle():
    import glob
    found = sorted(glob.glob("/Applications/.ChatGPT.codexpp-original-*.app"), key=os.path.getmtime)
    if not found:
        sys.exit("No original bundle beside the patched app.")
    return found[-1]


def tool(name):
    source, binary = os.path.join(ROOT, "scripts", f"{name}.swift"), os.path.join(ROOT, ".build", name)
    if not os.path.exists(binary) or os.path.getmtime(binary) < os.path.getmtime(source):
        os.makedirs(os.path.dirname(binary), exist_ok=True)
        subprocess.run(["swiftc", "-O", source, "-o", binary], check=True)
    return binary


def osa(*lines):
    args = ["osascript"]
    for line in lines:
        args += ["-e", line]
    return subprocess.run(args, capture_output=True, text=True)


def quit_app():
    subprocess.run(["pkill", "-x", "ChatGPT"], capture_output=True)
    for _ in range(50):
        if subprocess.run(["pgrep", "-x", "ChatGPT"], capture_output=True).returncode:
            return
        time.sleep(0.2)
    subprocess.run(["pkill", "-9", "-x", "ChatGPT"], capture_output=True)
    time.sleep(1)


def main_pid():
    out = subprocess.run(["pgrep", "-x", "ChatGPT"], capture_output=True, text=True).stdout.split()
    return int(out[0]) if out else None


def launch(bundle, experiments=None, url=None):
    quit_app()
    time.sleep(2)
    path = os.path.join(SUPPORT, "Diagnostics", "experiments.json")
    if experiments:
        with open(path, "w") as f:
            json.dump(experiments, f)
    subprocess.run(["open", "-a", bundle], check=True)
    time.sleep(8)
    if experiments:
        os.remove(path)
    if url:
        subprocess.run(["open", url], check=True)
        time.sleep(6)
    osa('tell application "System Events" to tell process "ChatGPT" to set frontmost to true')


def panel_open(bounds):
    """Whether the side panel is open: its divider runs down the window at one x."""
    from PIL import Image
    shot = tempfile.mktemp(suffix=".png")
    subprocess.run(["screencapture", "-x", "-R", f"{bounds['x']},{bounds['y']},{bounds['width']},{bounds['height']}", shot], check=True)
    image = Image.open(shot).convert("L")
    os.remove(shot)
    width, height = image.size
    def dividers(y):
        row = [image.getpixel((x, y)) for x in range(width)]
        return {x for x in range(int(width * 0.3), int(width * 0.9)) if 175 <= row[x] <= 215 and row[x - 4] > 225 and row[x + 4] > 225}
    found = dividers(int(height * 0.3)) & dividers(int(height * 0.5)) & dividers(int(height * 0.7))
    return bool(found)


def ensure_panel(bounds):
    for _ in range(2):
        if panel_open(bounds):
            return True
        osa('tell application "System Events" to tell process "ChatGPT" to click menu item "Switch between Chat and tabs" of menu "View" of menu bar 1')
        time.sleep(2)
    return panel_open(bounds)


def place(x, y, w, h):
    osa('tell application "System Events" to tell process "ChatGPT"',
        f'set position of window 1 to {{{x}, {y}}}', f'set size of window 1 to {{{w}, {h}}}', 'end tell')
    time.sleep(1.5)


class Recording:
    def __init__(self, path, seconds):
        self.path = path
        self.process = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "avfoundation", "-framerate", "60",
                                         "-capture_cursor", "0", "-pixel_format", "nv12", "-i", "2:none", "-t", str(seconds), path],
                                        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        self.start = time.time() + 0.35  # avfoundation delivers its first frame about this late

    def wait(self):
        self.process.wait()


class Sampler:
    def __init__(self, path, seconds, bundle):
        self.path = path
        self.process = subprocess.Popen([sys.executable, os.path.join(ROOT, "scripts", "process-sampler.py"), "--out", path, "--bundle", bundle,
                                         "--interval", "0.5", "--footprint", "1000", "--duration", str(seconds)],
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def samples(self):
        self.process.wait()
        with open(self.path) as f:
            return [json.loads(line) for line in f if line.strip()]


def cpu_timeline(samples, start, window=2.0):
    """Rolling average CPU of the whole ChatGPT tree, as overlay readouts."""
    rows, out = [(s["t"] - start, sum(s["cpu_pct"].values())) for s in samples], []
    for t, _ in rows:
        recent = [v for u, v in rows if t - window < u <= t]
        out.append([max(0.0, t), f"CPU {sum(recent) / len(recent):5.1f}%"])
    return out, rows


def render(raw, bounds, label, timeline, out_path, skip, duration, height=900, speed=1.0):
    scale = bounds["scale"]
    x, y = int(bounds["x"] * scale), int(bounds["y"] * scale)
    w, h = int(bounds["width"] * scale) // 2 * 2, int(bounds["height"] * scale) // 2 * 2
    out_w = int(round(w * height / h / 2)) * 2
    fps = 60 if speed != 1.0 else 30
    shown = duration / speed
    frames = tempfile.mkdtemp(prefix="overlay-", dir=os.path.dirname(out_path))
    timeline_file = os.path.join(frames, "timeline.json")
    with open(timeline_file, "w") as f:
        json.dump([[(t - skip) / speed, text] for t, text in timeline if t >= skip - 2], f)
    subprocess.run([tool("overlay-labels"), frames, str(out_w), str(height), str(fps), f"{shown:.3f}",
                    label + (f"  ({1 / speed:g}× slower)" if speed != 1.0 else ""), timeline_file], check=True)
    graph = (f"[0:v]crop={w}:{h}:{x}:{y},scale={out_w}:{height},setpts=(PTS-STARTPTS)/{speed},fps={fps}[base];"
             f"[1:v]format=rgba[text];[base][text]overlay=0:0:shortest=1,format=yuv420p[v]")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{skip:.3f}", "-t", f"{duration:.3f}", "-i", raw,
                    "-framerate", str(fps), "-i", os.path.join(frames, "%05d.png"), "-filter_complex", graph, "-map", "[v]",
                    "-c:v", "libx264", "-crf", "23", "-preset", "slow", "-movflags", "+faststart", out_path], check=True)
    subprocess.run(["rm", "-rf", frames])


def side_by_side(paths, out_path):
    inputs, chains = [], []
    for index, path in enumerate(paths):
        inputs += ["-i", path]
        chains.append(f"[{index}:v]tpad=stop_mode=clone:stop_duration=30,scale=-2:720[s{index}]")
    durations = [float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                                      capture_output=True, text=True).stdout) for p in paths]
    graph = ";".join(chains) + f";{''.join(f'[s{i}]' for i in range(len(paths)))}hstack=inputs={len(paths)}[v]"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex", graph, "-map", "[v]",
                    "-t", f"{max(durations) + 0.5:.3f}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "slow",
                    "-movflags", "+faststart", out_path], check=True)


def resize_steps():
    return [round(1257 + 150 * math.cos(i * math.pi / 60)) for i in range(240)]


def run(args):
    os.makedirs(args.out, exist_ok=True)
    stock = original_bundle()
    if args.scenario in ("resize", "panel"):
        variants = [("original", stock, None), ("patched", PATCHED, None)]
        if args.paused:
            variants.append(("patched-paused", PATCHED, None))
    elif args.scenario == "idle":
        variants = [("original", stock, None), ("patched", PATCHED, None)]
    else:
        variants = [("shimmer-original", PATCHED, {"demoShimmer": "original"}), ("shimmer-compositor", PATCHED, {"demoShimmer": "compositor"})]
    results, clips = {}, []
    settings_path = os.path.join(SUPPORT, "settings.json")
    with open(settings_path, "rb") as f:
        settings = f.read()
    for name, bundle, experiments in variants:
        paused = json.loads(settings)
        paused["extensionsPaused"] = name == "patched-paused" or paused.get("extensionsPaused", False)
        with open(settings_path, "w") as f:
            json.dump(paused, f)
        launch(bundle, experiments, args.thread if args.scenario in ("resize", "panel") else None)
        place(80, 126, 1407, 950)
        time.sleep(args.settle)
        osa('tell application "System Events" to tell process "ChatGPT" to set frontmost to true')
        pid = main_pid()
        bounds = json.loads(subprocess.run([tool("window-bounds"), str(pid)], capture_output=True, text=True, check=True).stdout)
        if args.scenario == "resize" and not ensure_panel(bounds):
            sys.exit(f"{name}: could not open the side panel")
        if args.scenario == "panel" and panel_open(bounds):
            osa('tell application "System Events" to tell process "ChatGPT" to click menu item "Switch between Chat and tabs" of menu "View" of menu bar 1')
            time.sleep(2)
        seconds = {"resize": 16, "panel": 15}.get(args.scenario, 24)
        raw = os.path.join(args.out, f"{name}-raw.mov")
        recording = Recording(raw, seconds)
        sampler = Sampler(os.path.join(args.out, f"{name}-cpu.jsonl"), seconds, bundle)
        time.sleep(1.5)
        record = {"variant": name, "bounds": bounds}
        if args.scenario == "resize":
            steps = ",".join(map(str, resize_steps()))
            began = time.time()
            osa('tell application "System Events" to tell process "ChatGPT"', f'repeat with w in {{{steps}}}',
                'set size of window 1 to {w as integer, 950}', 'end repeat', 'end tell')
            record["resize_seconds"] = round(time.time() - began, 2)
            bounds["width"] = max(resize_steps())  # crop wide enough for the widest step
        if args.scenario == "panel":
            record["toggles"] = []
            for _ in range(6):
                record["toggles"].append(round(time.time() - recording.start, 3))
                osa('tell application "System Events" to tell process "ChatGPT" to click menu item "Switch between Chat and tabs" of menu "View" of menu bar 1')
                time.sleep(2)
        recording.wait()
        samples = sampler.samples()
        timeline, rows = cpu_timeline(samples, recording.start)
        skip = 1.0
        duration = (record["resize_seconds"] + 1.5) if args.scenario == "resize" else seconds - 2
        active = [v for t, v in rows if skip <= t <= skip + duration]
        record["cpu_mean_pct"] = round(sum(active) / max(1, len(active)), 1)
        clip = os.path.join(args.out, f"{name}.mp4")
        render(raw, bounds, LABELS[name], timeline, clip, skip, duration)
        if args.scenario in ("resize", "panel"):
            render(raw, bounds, LABELS[name], timeline, os.path.join(args.out, f"{name}-slow.mp4"), skip, duration, speed=0.25)
        if args.keep_raw:
            record["raw"] = raw
        else:
            os.remove(raw)
        clips.append(clip)
        results[name] = record
        print(json.dumps(record))
    with open(settings_path, "wb") as f:
        f.write(settings)
    side_by_side(clips[:2], os.path.join(args.out, "side-by-side.mp4"))
    if args.scenario in ("resize", "panel"):
        side_by_side([c.replace(".mp4", "-slow.mp4") for c in clips[:2]], os.path.join(args.out, "side-by-side-slow.mp4"))
    with open(os.path.join(args.out, "results.json"), "w") as f:
        json.dump(results, f, indent=2)
    quit_app()
    time.sleep(2)
    subprocess.run(["open", "-a", PATCHED])


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenario", choices=["resize", "idle", "shimmer", "panel"])
    ap.add_argument("--thread", help="codex://threads/... URL to open for the resize scenario")
    ap.add_argument("--out", required=True)
    ap.add_argument("--paused", action="store_true", help="also film the patched app with extensions paused")
    ap.add_argument("--keep-raw", action="store_true", help="keep the full-screen recordings for frame analysis")
    ap.add_argument("--settle", type=float, default=0, help="seconds to wait after launch before filming")
    run(ap.parse_args())
