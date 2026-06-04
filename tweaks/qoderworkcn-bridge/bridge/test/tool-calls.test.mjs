import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import * as server from '../src/server.mjs';

const { createServer, loadConfig, makeResponse, normalizeInput, parseQoderToolCalls, planHostToolCalls } = server;

const tools = [
  {
    type: 'namespace',
    name: 'codex_app',
    tools: [
      {
        type: 'function',
        name: 'create_thread',
        description: 'Create a Codex subagent thread.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
          },
          required: ['prompt'],
        },
      },
    ],
  },
];

test('injects tool-call envelope instructions instead of disabling tools', () => {
  const prompt = normalizeInput({
    input: '启动一个 subagent',
    tools,
  });

  assert.match(prompt, /<codex_tool_calls>/);
  assert.match(prompt, /create_thread/);
  assert.doesNotMatch(prompt, /Tool calling is unavailable/);
});

test('parses Qoder tagged tool calls and maps dotted names to exact tool names', () => {
  const calls = parseQoderToolCalls(
    '<codex_tool_calls>[{"name":"codex_app.create_thread","arguments":{"prompt":"A"}}]</codex_tool_calls>',
    tools,
  );

  assert.deepEqual(calls, [
    {
      name: 'create_thread',
      namespace: 'codex_app',
      arguments: { prompt: 'A' },
    },
  ]);
});

test('turns structured Qoder create_thread JSON into Responses function_call items', () => {
  const response = makeResponse({
    responseId: 'resp_test',
    createdAt: 1,
    model: 'qoderworkcn-codex',
    text: JSON.stringify({
      type: 'function_call',
      name: 'create_thread',
      arguments: { prompt: 'A' },
    }),
    tools,
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });

  assert.equal(response.output.length, 1);
  assert.equal(response.output[0].type, 'function_call');
  assert.equal(response.output[0].namespace, 'codex_app');
  assert.equal(response.output[0].name, 'create_thread');
  assert.equal(response.output[0].arguments, '{"prompt":"A"}');
});

test('keeps ordinary text as an assistant message', () => {
  const response = makeResponse({
    responseId: 'resp_text',
    createdAt: 1,
    model: 'qoderworkcn-codex',
    text: '普通回复',
    tools,
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });

  assert.equal(response.output[0].type, 'message');
  assert.equal(response.output[0].content[0].text, '普通回复');
});

test('includes previous function call outputs in the next Qoder prompt', () => {
  const prompt = normalizeInput({
    input: [
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'create_thread',
        arguments: '{"prompt":"A"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"threadId":"t1"}',
      },
    ],
    tools,
  });

  assert.match(prompt, /Previous tool call create_thread/);
  assert.match(prompt, /Tool result for call_1/);
  assert.match(prompt, /"threadId":"t1"/);
});

test('does not create a Qoder watchdog when QODER_BRIDGE_TIMEOUT_MS=0', () => {
  assert.equal(
    typeof server.createQoderWatchdog,
    'function',
    'Expected ../src/server.mjs to export createQoderWatchdog for watchdog tests.',
  );

  const config = loadConfig({
    QODER_BRIDGE_TIMEOUT_MS: '0',
  });
  let setTimeoutCalls = 0;

  const watchdog = server.createQoderWatchdog({
    timeoutMs: config.timeoutMs,
    onTimeout() {
      assert.fail('disabled watchdog should never time out');
    },
    timers: {
      setTimeout() {
        setTimeoutCalls += 1;
        assert.fail('disabled watchdog should not call setTimeout');
      },
      clearTimeout() {
        assert.fail('disabled watchdog should not need cleanup');
      },
    },
  });

  assert.equal(config.timeoutMs, 0);
  assert.equal(watchdog, null);
  assert.equal(setTimeoutCalls, 0);
});

test('runProcess rejects before spawn when signal is already aborted', async () => {
  assert.equal(
    typeof server.runProcess,
    'function',
    'Expected ../src/server.mjs to export runProcess for cancellation tests.',
  );

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => server.runProcess(process.execPath, ['-e', 'process.exit(99)'], {
      cwd: process.cwd(),
      input: '',
      timeoutMs: 0,
      signal: controller.signal,
    }),
    error => error.code === 'request_cancelled',
  );
});

test('responses endpoint returns function_call when Qoder emits a tool envelope', async () => {
  const config = loadConfig({
    QODER_BRIDGE_PORT: '0',
  });
  const bridge = createServer({
    config,
    qoderClient: {
      async run() {
        return {
          text: '<codex_tool_calls>[{"name":"create_thread","arguments":{"prompt":"A"}}]</codex_tool_calls>',
        };
      },
    },
  });
  bridge.listen(0, config.host);
  await once(bridge, 'listening');

  try {
    const address = bridge.address();
    const response = await fetch(`http://${config.host}:${address.port}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'qoderworkcn-codex',
        input: 'start subagent',
        tools,
      }),
    });
    const body = await response.json();
    assert.equal(response.ok, true);
    assert.equal(body.output[0].type, 'function_call');
    assert.equal(body.output[0].namespace, 'codex_app');
    assert.equal(body.output[0].name, 'create_thread');
    assert.equal(body.output[0].arguments, '{"prompt":"A"}');
  } finally {
    bridge.close();
  }
});

test('plans explicit Subagent A/B requests as host create_thread calls', () => {
  const calls = planHostToolCalls({
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              '请用 subagents 分工。',
              '- Subagent A：核验 Storylet 是否有公开源码。',
              '- Subagent B：安装 AI Town 到本地。',
            ].join('\n'),
          },
        ],
      },
    ],
    tools,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].namespace, 'codex_app');
  assert.equal(calls[0].name, 'create_thread');
  assert.match(calls[0].arguments.prompt, /核验 Storylet/);
  assert.equal(calls[0].arguments.target.type, 'projectless');
});

test('plans explicit subagents when create_thread is exposed as a dotted function name', () => {
  const calls = planHostToolCalls({
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              '请启动 subagents。',
              '- Subagent A：核验 Storylet。',
            ].join('\n'),
          },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'codex_app.create_thread',
        description: 'Create a Codex subagent thread.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
          },
          required: ['prompt'],
        },
      },
    ],
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].namespace, '');
  assert.equal(calls[0].name, 'codex_app.create_thread');
  assert.match(calls[0].arguments.prompt, /核验 Storylet/);
});

test('host planner prevents Qoder call for explicit subagent startup', async () => {
  const config = loadConfig({
    QODER_BRIDGE_PORT: '0',
  });
  const bridge = createServer({
    config,
    qoderClient: {
      async run() {
        assert.fail('explicit subagent startup should be handled by host planner');
      },
    },
  });
  bridge.listen(0, config.host);
  await once(bridge, 'listening');

  try {
    const address = bridge.address();
    const response = await fetch(`http://${config.host}:${address.port}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'qoderworkcn-codex',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  '请用 subagents 分工。',
                  '- Subagent A：核验 Storylet 是否有公开源码。',
                  '- Subagent B：安装 AI Town 到本地。',
                ].join('\n'),
              },
            ],
          },
        ],
        tools,
      }),
    });
    const body = await response.json();
    assert.equal(response.ok, true);
    assert.equal(body.output.length, 2);
    assert.equal(body.output[0].type, 'function_call');
    assert.equal(body.output[0].namespace, 'codex_app');
    assert.equal(body.output[0].name, 'create_thread');
  } finally {
    bridge.close();
  }
});
