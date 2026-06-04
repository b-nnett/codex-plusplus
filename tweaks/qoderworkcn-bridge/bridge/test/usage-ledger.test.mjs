import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recordUsage, usageSummary } from '../src/usage-ledger.mjs';

test('records bridge usage and summarizes CodexBar-style totals', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qoder-usage-'));
  const ledger = path.join(dir, 'usage.jsonl');
  try {
    const config = {
      usageLedgerPath: ledger,
      bridgeModel: 'qoderworkcn-codex',
      qoderModel: 'qmodel',
    };
    const response = {
      id: 'resp_test',
      created_at: Date.parse('2026-06-05T02:00:00.000Z') / 1000,
      model: 'qoderworkcn-codex',
      usage: {
        input_tokens: 12,
        input_tokens_details: { cached_tokens: 3 },
        output_tokens: 5,
        total_tokens: 17,
      },
    };

    recordUsage(config, response);

    const raw = readFileSync(ledger, 'utf8').trim();
    assert.match(raw, /codexbar\.qoderworkcn\.usage\.v1/);

    const summary = usageSummary(config, {
      now: new Date('2026-06-05T03:00:00.000Z'),
      days: 30,
    });

    assert.equal(summary.sessionTokens, 17);
    assert.equal(summary.last30DaysTokens, 17);
    assert.equal(summary.totals.inputTokens, 12);
    assert.equal(summary.totals.outputTokens, 5);
    assert.equal(summary.totals.cacheReadTokens, 3);
    assert.equal(summary.totals.requestCount, 1);
    assert.equal(summary.pricingConfigured, false);
    assert.equal(summary.last30DaysCostUSD, null);
    assert.deepEqual(summary.totals.modelsUsed, ['qoderworkcn-codex']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('estimates cost when per-million token prices are configured', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qoder-usage-'));
  const ledger = path.join(dir, 'usage.jsonl');
  try {
    const config = {
      usageLedgerPath: ledger,
      bridgeModel: 'qoderworkcn-codex',
      inputUsdPer1M: '2',
      outputUsdPer1M: '8',
      cachedInputUsdPer1M: '0.5',
    };

    recordUsage(config, {
      id: 'resp_cost',
      created_at: Date.parse('2026-06-05T02:00:00.000Z') / 1000,
      model: 'qoderworkcn-codex',
      usage: {
        input_tokens: 1_000_000,
        input_tokens_details: { cached_tokens: 250_000 },
        output_tokens: 500_000,
        total_tokens: 1_500_000,
      },
    });

    const summary = usageSummary(config, {
      now: new Date('2026-06-05T03:00:00.000Z'),
      days: 30,
    });

    assert.equal(summary.pricingConfigured, true);
    assert.equal(summary.last30DaysCostUSD, 5.625);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
