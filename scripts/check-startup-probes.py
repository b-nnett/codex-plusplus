#!/usr/bin/env python3
"""Exercise the helper's real probe path on relocated, signed app bundles.

Each run uses a different staging path and a fresh profile. A SecurityAgent
process appearing during or immediately after a probe fails the rehearsal.
No Keychain credentials or items are read or changed by this script.
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time
import uuid


def security_agents():
    lines = subprocess.check_output(["/bin/ps", "-axo", "pid=,comm="], text=True)
    return {int(parts[0]) for line in lines.splitlines()
            if len(parts := line.strip().split(None, 1)) == 2
            and parts[1].endswith("/SecurityAgent")}


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--helper", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--repetitions", type=int, default=3)
parser.add_argument("apps", nargs="+", type=Path)
args = parser.parse_args()
assert 1 <= args.repetitions <= 10
assert not security_agents(), "Resolve the existing credential dialog before testing."
proof_file = Path.home() / "Library/Application Support/CodexPP/Diagnostics/probe.json"
results = []
with tempfile.TemporaryDirectory(prefix="codexpp-probe-keychain-") as temporary:
    for app in args.apps:
        for repetition in range(args.repetitions):
            stage = Path(temporary) / f".ChatGPT.codexpp-stage-{uuid.uuid4()}.app"
            subprocess.run(["/usr/bin/ditto", str(app.resolve()), str(stage)], check=True)
            with tempfile.TemporaryFile(mode="w+") as log:
                process = subprocess.Popen(
                    [str(args.helper.resolve()), "--check-probe", str(stage)],
                    stdout=log, stderr=subprocess.STDOUT,
                )
                deadline = time.monotonic() + 45
                try:
                    while process.poll() is None:
                        assert not security_agents(), "A probe triggered SecurityAgent."
                        assert time.monotonic() < deadline, "Probe timed out."
                        time.sleep(0.05)
                    log.seek(0)
                    output = log.read()
                    assert process.returncode == 0, output
                    # An asynchronous Keychain request can outlive app.exit().
                    deadline = time.monotonic() + 2
                    while time.monotonic() < deadline:
                        assert not security_agents(), "A delayed probe triggered SecurityAgent."
                        time.sleep(0.05)
                finally:
                    if process.poll() is None:
                        process.terminate()
                        process.wait(timeout=5)
            proof = json.loads(proof_file.read_text())
            assert proof["app"] == str(stage / "Contents/Resources/app.asar")
            report = json.loads(output)
            results.append({"version": report["version"], "adapter": proof["adapter"],
                            "repetition": repetition + 1, "passed": True,
                            "securityAgentObserved": False})
            print(f"{report['version']} probe {repetition + 1}: passed, no SecurityAgent", flush=True)
            subprocess.run(["/bin/rm", "-rf", str(stage)], check=True)
args.output.write_text(json.dumps({"probeArguments": ["--codexpp-probe", "--use-mock-keychain",
    "--user-data-dir=<fresh-disposable-profile>"], "results": results}, indent=2) + "\n")
