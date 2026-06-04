import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, loadConfig } from '../src/server.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'qoder-bridge-smoke-'));
const config = loadConfig({
  ...process.env,
  QODER_BRIDGE_PORT: process.env.QODER_BRIDGE_PORT || '38441',
  QODERWORKCN_USAGE_LEDGER: process.env.QODERWORKCN_USAGE_LEDGER || path.join(tmp, 'usage.jsonl'),
});

const server = createServer({ config });
server.listen(config.port, config.host);
await once(server, 'listening');

try {
  const baseUrl = `http://${config.host}:${config.port}`;
  const health = await fetch(`${baseUrl}/health`).then(response => response.json());
  if (!health.ok) {
    throw new Error('Health check failed.');
  }

  const response = await fetch(`${baseUrl}/v1/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.bridgeModel,
      input: '只回复 OK',
      stream: false,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(body));
  }

  const text = body.output?.[0]?.content?.[0]?.text || '';
  const usage = await fetch(`${baseUrl}/usage`).then(response => response.json());
  console.log(JSON.stringify({
    ok: true,
    status: body.status,
    responseId: body.id,
    text,
    usage: body.usage,
    usageLedger: {
      tokens: usage.last30DaysTokens,
      requests: usage.totals?.requestCount,
      ledgerExists: usage.ledgerExists,
    },
  }, null, 2));
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
