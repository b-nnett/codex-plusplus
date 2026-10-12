#!/usr/bin/env python3
"""Render launch recordings from `bench-startup.py --record` into evidence clips.

For every recorded launch it writes an annotated clip cropped to the ChatGPT
window: the variant name, a timer that starts at the moment `open` ran, and an
"interactive" stamp at the instant ChatGPT logged its own `app_start` span
(home and sidebar ready). Alignment is exact: frames carry
CLOCK_UPTIME_RAW timestamps and the harness records the launch on that clock.

It also writes side-by-side.mp4: the median-TTI launch of each variant, both
starting at the click, held on their last frame until the slower one finishes.

    python3 scripts/bench-startup.py --variants original,patched --runs 5 --record dist/launches --out dist/launches/bench.json
    python3 scripts/launch-video.py dist/launches/bench.json
"""
import argparse, json, os, shutil, subprocess, sys

LABELS = {"original": "Stock ChatGPT", "patched": "ChatGPT + Codex++", "patched-paused": "Codex++ (extensions paused)",
          "patched-traced": "Codex++ (traced)"}
LEAD, TAIL = 0.5, 1.5  # seconds shown before the click and after interactive


def first_pts(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time",
                          "-read_intervals", "%+#1", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.split()
    return float(out[0]) if out else None


def size(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                          "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip().split(",")
    return int(out[0]), int(out[1])


def overlay_tool():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    source, binary = os.path.join(root, "scripts", "overlay-frames.swift"), os.path.join(root, ".build", "overlay-frames")
    if not os.path.exists(binary) or os.path.getmtime(binary) < os.path.getmtime(source):
        os.makedirs(os.path.dirname(binary), exist_ok=True)
        subprocess.run(["swiftc", "-O", source, "-o", binary], check=True)
    return binary


def render(run, out_path, height):
    video = run["video"]
    start = first_pts(video["path"])
    if start is None:
        raise RuntimeError(f"{video['path']}: no frames")
    if not 0 <= video["launch_mono"] - start < 60:
        raise RuntimeError(f"{video['path']}: frames are not on the launch clock (first pts {start:.3f}); re-record with -copyts")
    launch = video["launch_mono"] - start
    interactive = video["interactive_mono"] - start
    begin = max(0.0, launch - LEAD)
    duration = interactive + TAIL - begin
    width_px, height_px = size(video["path"])
    x, y, w, h = 0, 0, width_px, height_px
    window = video.get("window")
    if window:
        scale = window["scale"]
        x, y = max(0, int(window["x"] * scale)), max(0, int(window["y"] * scale))
        w, h = min(width_px - x, int(window["width"] * scale)), min(height_px - y, int(window["height"] * scale))
    w, h = w - w % 2, h - h % 2
    out_w = int(round(w * height / h / 2)) * 2
    frames = out_path + ".frames"
    subprocess.run([overlay_tool(), frames, str(out_w), str(height), "30", f"{duration:.3f}", f"{launch - begin:.3f}",
                    f"{interactive - begin:.3f}", LABELS.get(run["variant"], run["variant"]),
                    f"Interactive in {run['wall_tti_ms'] / 1000:.2f} s"], check=True)
    graph = (f"[0:v]crop={w}:{h}:{x}:{y},scale={out_w}:{height},setpts=PTS-STARTPTS,fps=30[base];"
             f"[1:v]format=rgba[text];[base][text]overlay=0:0:shortest=1,format=yuv420p[v]")
    try:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{begin:.3f}",
                        "-i", video["path"], "-framerate", "30", "-i", os.path.join(frames, "%05d.png"),
                        "-t", f"{duration:.3f}", "-filter_complex", graph, "-map", "[v]", "-c:v", "libx264",
                        "-crf", "18", "-movflags", "+faststart", out_path], check=True)
    finally:
        shutil.rmtree(frames, ignore_errors=True)
    return duration


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bench", help="JSON written by bench-startup.py --out with --record")
    ap.add_argument("--out", help="output directory (default: beside the recordings)")
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--exclude", action="append", default=[], metavar="NAME",
                    help="recording name (e.g. 03-patched-0) to leave out of the side-by-side, such as one with an "
                         "unrelated dialog on screen; it is still rendered")
    args = ap.parse_args()
    with open(args.bench) as f:
        data = json.load(f)
    runs = [r for r in data["results"] if r.get("video") and "error" not in r and not r.get("warmup")]
    if not runs:
        sys.exit("No recorded launches in that file; run bench-startup.py with --record.")
    out = args.out or os.path.join(os.path.dirname(runs[0]["video"]["path"]), "clips")
    os.makedirs(out, exist_ok=True)
    rendered = {}
    for run in runs:
        name = os.path.splitext(os.path.basename(run["video"]["path"]))[0]
        path = os.path.join(out, f"{name}.mp4")
        render(run, path, args.height)
        if name not in args.exclude:
            rendered.setdefault(run["variant"], []).append((run["wall_tti_ms"], path))
        print(f"{path}  ({run['variant']}, interactive {run['wall_tti_ms'] / 1000:.2f} s)")

    variants = [v for v in ["original", "patched", "patched-paused"] if v in rendered] or list(rendered)
    if len(variants) >= 2:
        picks = []
        for variant in variants[:2]:
            runs_v = sorted(rendered[variant])
            picks.append(runs_v[(len(runs_v) - 1) // 2])  # lower median
        inputs, chains = [], []
        for index, (_, path) in enumerate(picks):
            inputs += ["-i", path]
            chains.append(f"[{index}:v]tpad=stop_mode=clone:stop_duration=30,scale=-2:{args.height}[s{index}]")
        graph = ";".join(chains) + f";[s0][s1]hstack=inputs=2:shortest=0[v]"
        durations = [float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                                          capture_output=True, text=True).stdout) for _, p in picks]
        side = os.path.join(out, "side-by-side.mp4")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex", graph,
                        "-map", "[v]", "-t", f"{max(durations) + 1:.3f}", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-crf", "18", "-movflags", "+faststart", side], check=True)
        print(f"{side}  (median launches: {', '.join(f'{LABELS.get(v, v)} {t / 1000:.2f} s' for v, (t, _) in zip(variants, picks))})")


if __name__ == "__main__":
    main()
