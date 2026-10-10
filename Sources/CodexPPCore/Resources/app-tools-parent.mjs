import {spawn} from 'node:child_process';

if (process.argv.length < 3) {
  process.stderr.write('Codex++ app-tools parent: missing MCP server path.\n');
  process.exit(64);
}

const child = spawn(process.execPath, process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

let terminating = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (terminating) return;
    terminating = true;
    if (!child.killed) child.kill(signal);
  });
}

child.once('error', error => {
  process.stderr.write(`Codex++ app-tools parent: ${error.message}\n`);
  process.exitCode = 127;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
