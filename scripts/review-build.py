#!/usr/bin/env python3
"""Review a ChatGPT build: what Codex++ patching would do with it, in minutes.

Runs the helper's hidden `--review-build` mode, which performs the patch's own
discovery (the same Swift `RendererPipeline`, chunk table and JavaScript
adapters) read-only against the ORIGINAL vendor archive, then adds diagnosis
hints, timing warnings and a diff against an earlier report. Writes
dist/reviews/<build>.json and dist/reviews/<build>.md.

Exit status: 0 clean; 1 when a release edit that applied in the --against
report no longer applies, or when patching this build would fail; 2 when the
review itself could not run. See docs/reviewing-a-new-build.md.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_APP = "/Applications/ChatGPT.app"
STARTUP_WARN_SECONDS = 20
DISCOVERY_LIMIT_SECONDS = 60


# ---------------------------------------------------------------- running

def build_helper(configuration):
    subprocess.run(["swift", "build", "--disable-sandbox", "-c", configuration, "--product", "CodexPP"],
                   cwd=ROOT, check=True, stdout=sys.stderr)
    return ROOT / ".build" / configuration / "CodexPP"


def run_helper(helper, app):
    process = subprocess.run([str(helper), "--review-build", app], capture_output=True, text=True)
    if process.returncode != 0:
        raise RuntimeError((process.stderr or process.stdout).strip() or f"{helper} exited {process.returncode}")
    return json.loads(process.stdout)


# ---------------------------------------------------------------- analysis

def edit_index(review):
    """{(adapter, edit): edit} for every native check and adapter edit."""
    index = {("native", edit["name"]): edit for edit in review.get("native", [])}
    for adapter in review.get("adapters", []):
        for edit in adapter.get("edits", []):
            index[(adapter["name"], edit["name"])] = edit
    return index


def is_release(edit):
    return edit.get("release", True)


def condense(error):
    """The useful line of an adapter error (node errors arrive with a stack)."""
    if not error:
        return ""
    lines = [line.strip() for line in error.splitlines() if line.strip()]
    for line in reversed(lines):
        match = re.search(r"(?:^|\s)(?:[A-Za-z]*Error): (.+)$", line)
        if match and not line.startswith("at "):
            return match.group(1)[:300]
    text = lines[0] if lines else error
    return text.removeprefix("Code discovery failed: ")[:300]


def chunk_hint(chunk):
    where = f"prefix `{chunk['prefix']}` in {chunk['directory']} matched {chunk['prefixMatches']} file(s)"
    if chunk.get("markers"):
        where += f", {chunk.get('markerMatches', 0)} with every marker {chunk['markers']}"
    if chunk.get("path"):
        return f"chunk `{chunk['key']}` resolved to {chunk['path']}"
    return f"chunk `{chunk['key']}` not found ({where}; needs exactly one)"


def diagnose(review, baseline=None):
    """Adds a `hint` to every skipped edit and failed adapter, in place."""
    previous = edit_index(baseline) if baseline else {}
    for adapter in review.get("adapters", []):
        if adapter.get("status") == "failed":
            adapter["hint"] = condense(adapter.get("error"))
        chunks = {chunk["key"]: chunk for chunk in adapter.get("chunks", [])}
        for edit in adapter.get("edits", []):
            if edit.get("status") != "skipped":
                continue
            reason = edit.get("reason", "")
            before = previous.get((adapter["name"], edit["name"]), {})
            target = before.get("target") if before.get("status") == "applied" else None
            chunk = chunks.get(target) if target else None
            if reason == "development builds only":
                edit["hint"] = "diagnostic edit; release helpers never apply it"
            elif reason == "module not found":
                if chunk:
                    edit["hint"] = chunk_hint(chunk)
                elif target:
                    edit["hint"] = f"its input `{target}` was not provided"
                else:
                    missing = [chunk_hint(c) for c in chunks.values() if not c.get("path")]
                    edit["hint"] = "; ".join(missing) if missing else "every chunk resolved; no baseline names this edit's chunk"
            elif reason.startswith("expected one"):
                count = re.search(r"found (\d+)", reason)
                found = int(count.group(1)) if count else -1
                place = f"`{target}` ({chunk['path']})" if chunk and chunk.get("path") else f"`{target}`" if target else "its chunk"
                edit["hint"] = (f"the matched code shape is gone from {place}: renamed or rewritten upstream" if found == 0
                                else f"the matcher is ambiguous in {place} ({found} matches): tighten it")
            elif adapter["name"] == "sidebar":
                edit["hint"] = "better-sidebar reports this capability missing; the rest of the sidebar contract still applies"
    for edit in review.get("native", []):
        if edit.get("status") == "skipped":
            edit["hint"] = edit.get("reason", "")
    return review


def outcome(review):
    """Whether patching would succeed, and what blocks it."""
    blockers = []
    identity = review.get("identity", {})
    if identity.get("status") == "unsupported":
        blockers.append("identity: " + (identity.get("adapterError") or identity.get("authenticationError") or "unsupported build"))
    blockers += [f"native {edit['name']}: {edit.get('reason', '')}" for edit in review.get("native", []) if edit.get("status") != "applied"]
    blockers += [f"{adapter['name']}: {condense(adapter.get('error'))}" for adapter in review.get("adapters", [])
                 if adapter.get("required") and adapter.get("status") == "failed"]
    return {"wouldPatch": not blockers, "blockers": blockers}


def warnings(review):
    found = []
    for adapter in review.get("adapters", []):
        seconds = adapter.get("seconds", 0)
        limit = 180 if adapter["name"] == "sidebar" else DISCOVERY_LIMIT_SECONDS
        for reason in adapter.get("retries", []):
            found.append(f"{adapter['name']} discovery was retried with a longer deadline after: {condense(reason)}")
        if adapter["name"] == "startup" and not adapter.get("retries") and seconds >= DISCOVERY_LIMIT_SECONDS:
            found.append(f"startup discovery took {seconds:.1f} s, past its first {DISCOVERY_LIMIT_SECONDS} s deadline")
        elif seconds >= limit and adapter["name"] != "startup":
            found.append(f"{adapter['name']} discovery took {seconds:.1f} s, at the {limit} s hard limit: patching would time out")
        elif adapter["name"] == "startup" and seconds > STARTUP_WARN_SECONDS:
            found.append(f"startup discovery took {seconds:.1f} s (over {STARTUP_WARN_SECONDS} s; the first deadline is {DISCOVERY_LIMIT_SECONDS} s, then one retry at 180 s)")
        if not adapter.get("required") and adapter.get("status") == "failed":
            found.append(f"optional {adapter['name']} adapter failed and would be left out: {condense(adapter.get('error'))}")
    return found


def diff(review, baseline):
    """Edit status changes from `baseline` to `review`."""
    old, new = edit_index(baseline), edit_index(review)
    # An edit missing because its adapter failed counts as a regression; one
    # missing while its adapter ran was taken out of Codex++ (adapters report
    # every edit they know, applied or skipped).
    ran = {a["name"] for a in review.get("adapters", []) if a.get("status") == "ok"} | {"native"}
    def key(pair):
        return f"{pair[0]}.{pair[1]}"
    changes = {"newlySkipped": [], "newlyApplied": [], "added": [], "removed": [], "regressions": [], "adapters": []}
    for pair in sorted(set(old) | set(new)):
        before, after = old.get(pair), new.get(pair)
        was = before.get("status") if before else None
        now = after.get("status") if after else None
        if was == now:
            continue
        row = {"edit": key(pair), "was": was, "now": now}
        if after and after.get("reason"):
            row["reason"] = after["reason"]
        if after and after.get("hint"):
            row["hint"] = after["hint"]
        if before is None:
            changes["added"].append(row)
        elif after is None:
            changes["removed"].append(row)
        elif now == "applied":
            changes["newlyApplied"].append(row)
        else:
            changes["newlySkipped"].append(row)
        if was == "applied" and now != "applied" and is_release(before) and (after is not None or pair[0] not in ran):
            changes["regressions"].append(row)
    old_adapters = {a["name"]: a.get("status") for a in baseline.get("adapters", [])}
    for adapter in review.get("adapters", []):
        was = old_adapters.get(adapter["name"])
        if was is not None and was != adapter.get("status"):
            changes["adapters"].append({"adapter": adapter["name"], "was": was, "now": adapter.get("status")})
    identity = baseline.get("identity", {})
    changes["against"] = {"build": identity.get("build"), "version": identity.get("version"), "headerHash": identity.get("headerHash")}
    return changes


def analyse(review, baseline=None, baseline_path=None):
    report = diagnose(review, baseline)
    report["summary"] = {**outcome(report), "warnings": warnings(report)}
    if baseline is not None:
        report["diff"] = diff(report, baseline)
        if baseline_path:
            report["diff"]["againstPath"] = str(baseline_path)
    return report


def exit_code(report):
    regressions = report.get("diff", {}).get("regressions", [])
    return 1 if regressions or not report["summary"]["wouldPatch"] else 0


# ---------------------------------------------------------------- output

def markdown(report):
    identity, summary = report["identity"], report["summary"]
    status = {"pinned": "**pinned reviewed build**",
              "vendor-authenticated": "**vendor-authenticated only** (not pinned; patching runs full structural discovery)",
              "unsupported": "**unsupported** (neither pinned nor vendor-authenticated)"}.get(identity.get("status"), identity.get("status"))
    lines = [f"# ChatGPT {identity['version']} ({identity['build']}) review", ""]
    lines.append(f"- Archive header `{identity['headerHash']}`; archive SHA-256 `{identity['archiveSHA256']}`")
    lines.append(f"- Status: {status}" + (f"; adapter `{identity['adapter']}`" if identity.get("adapter") else ""))
    if summary["wouldPatch"]:
        lines.append("- Patch outcome: **would patch**")
    else:
        lines.append("- Patch outcome: **would FAIL**: " + "; ".join(summary["blockers"]))
    tool = report.get("tool", {})
    lines.append(f"- Reviewed {report.get('generatedAt', '')} by patch revision {tool.get('patchRevision')}"
                 f"{' (experiments build)' if tool.get('experiments') else ''} from `{report['app']['original']}`")
    if "diff" in report:
        against = report["diff"]["against"]
        lines.append(f"- Compared with {against.get('version')} ({against.get('build')})")
    lines += ["", "| Adapter | Result | Applied | Skipped | Time |", "| --- | --- | ---: | ---: | ---: |"]
    native = report.get("native", [])
    lines.append(f"| native | {'ok' if all(e['status'] == 'applied' for e in native) else 'failed'} | "
                 f"{sum(e['status'] == 'applied' for e in native)} | {sum(e['status'] != 'applied' for e in native)} | |")
    for adapter in report.get("adapters", []):
        edits = adapter.get("edits", [])
        result = adapter["status"] if adapter["required"] or adapter["status"] == "ok" else "failed (optional)"
        lines.append(f"| {adapter['name']} | {result} | {sum(e['status'] == 'applied' for e in edits)} | "
                     f"{sum(e['status'] != 'applied' for e in edits)} | {adapter['seconds']:.1f} s |")
    total = sum(a["seconds"] for a in report.get("adapters", []))
    lines.append(f"| **total** | | | | {total:.1f} s |")
    if summary["warnings"]:
        lines += ["", "Warnings:", ""] + [f"- {warning}" for warning in summary["warnings"]]
    failed = [a for a in report.get("adapters", []) if a["status"] == "failed"]
    if failed:
        lines += ["", "## Failed adapters", ""] + [f"- **{a['name']}**: {a.get('hint') or condense(a.get('error'))}" for a in failed]
    skipped = [(name, edit) for name, edit in ((a["name"], e) for a in report.get("adapters", []) for e in a.get("edits", []))
               if edit["status"] != "applied"] + [("native", e) for e in native if e["status"] != "applied"]
    release = [(name, edit) for name, edit in skipped if is_release(edit)]
    development = [edit["name"] for _, edit in skipped if not is_release(edit)]
    if release:
        lines += ["", "## Skipped release edits", "", "| Adapter | Edit | Reason | Hint |", "| --- | --- | --- | --- |"]
        for name, edit in release:
            label = f"{edit['name']} ({edit['label']})" if edit.get("label") and edit["label"] != edit["name"] else edit["name"]
            lines.append(f"| {name} | {label} | {edit.get('reason', '')} | {edit.get('hint', '')} |")
    else:
        lines += ["", "Every release edit applies."]
    if development:
        lines += ["", f"Development-only diagnostics skipped as expected: {', '.join(sorted(development))}."]
    if "diff" in report:
        changes = report["diff"]
        lines += ["", f"## Changes since {changes['against'].get('build')}", ""]
        def rows(title, items):
            if items:
                lines.append(f"- {title}: " + "; ".join(f"`{i['edit']}`" + (f" ({i['reason']})" if i.get("reason") else "") for i in items))
        rows("**Regressions** (release edits that applied before and no longer do)", changes["regressions"])
        rows("Newly skipped", [i for i in changes["newlySkipped"] if i not in changes["regressions"]])
        rows("Newly applied", changes["newlyApplied"])
        rows("New edits", changes["added"])
        rows("Edits no longer reported", [i for i in changes["removed"] if i not in changes["regressions"]])
        for change in changes["adapters"]:
            lines.append(f"- Adapter `{change['adapter']}`: {change['was']} -> {change['now']}")
        if not any(changes[k] for k in ("regressions", "newlySkipped", "newlyApplied", "added", "removed", "adapters")):
            lines.append("- No edit changed status.")
    return "\n".join(lines) + "\n"


def find_baseline(out_dir, build):
    """The report in out_dir for the highest build below `build`."""
    candidates = []
    for path in Path(out_dir).glob("*.json"):
        if path.stem.isdigit() and int(path.stem) < int(build):
            candidates.append((int(path.stem), path))
    return max(candidates)[1] if candidates else None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("app", nargs="?", default=DEFAULT_APP,
                        help="ChatGPT.app, patched (its receipt's original backup is reviewed) or not; default %(default)s")
    parser.add_argument("--against", help="an earlier review JSON to diff against, or 'auto' for the highest lower build in --out-dir")
    parser.add_argument("--out-dir", default=str(ROOT / "dist" / "reviews"), help="default %(default)s")
    parser.add_argument("--helper", help="a built CodexPP executable (default: build .build/<configuration>/CodexPP)")
    parser.add_argument("--configuration", default="release", choices=["release", "debug"],
                        help="SwiftPM configuration to build when --helper is not given; release matches patch timings")
    parser.add_argument("--from-json", help="format an existing raw --review-build JSON instead of running the helper")
    args = parser.parse_args(argv)
    try:
        if args.from_json:
            review = json.loads(Path(args.from_json).read_text())
        else:
            helper = Path(args.helper) if args.helper else build_helper(args.configuration)
            review = run_helper(helper, args.app)
        review.setdefault("tool", {})["loadAverage"] = list(os.getloadavg())
        build = review["identity"]["build"]
        baseline_path = find_baseline(args.out_dir, build) if args.against == "auto" else Path(args.against) if args.against else None
        baseline = json.loads(baseline_path.read_text()) if baseline_path else None
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"review-build: {error}", file=sys.stderr)
        return 2
    report = analyse(review, baseline, baseline_path)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{build}.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    summary = markdown(report)
    (out / f"{build}.md").write_text(summary)
    sys.stdout.write(summary)
    print(f"\nWrote {out / f'{build}.json'} and {out / f'{build}.md'}", file=sys.stderr)
    return exit_code(report)


if __name__ == "__main__":
    sys.exit(main())
