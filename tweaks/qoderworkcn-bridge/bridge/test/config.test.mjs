import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, loadConfig } from '../src/server.mjs';
import test from 'node:test';

test('defaults to a long Qoder CLI timeout for coding tasks', () => {
  const config = loadConfig({});
  assert.equal(config.timeoutMs, 7_200_000);
});

test('allows disabling the bridge watchdog timeout', () => {
  const config = loadConfig({
    QODER_BRIDGE_TIMEOUT_MS: '0',
  });
  assert.equal(config.timeoutMs, 0);
});

test('health exposes the active Qoder CLI timeout', async () => {
  const config = loadConfig({
    QODER_BRIDGE_PORT: '0',
    QODER_BRIDGE_TIMEOUT_MS: '123456',
  });
  const server = createServer({ config });
  server.listen(0, config.host);
  await once(server, 'listening');

  try {
    const address = server.address();
    const response = await fetch(`http://${config.host}:${address.port}/health`);
    const health = await response.json();
    assert.equal(response.ok, true);
    assert.equal(health.timeoutMs, 123456);
  } finally {
    server.close();
  }
});
