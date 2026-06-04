import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { recordUsage, usageLedgerPath, usagePricing, usageSummary } from './usage-ledger.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 38441;
const DEFAULT_TIMEOUT_MS = 7_200_000;
const STREAM_HEARTBEAT_MS = 15_000;
const DEFAULT_MODEL = 'qoderworkcn-codex';
const QODER_MODEL = 'qmodel';

export function loadConfig(env = process.env) {
  const home = os.homedir();
  const storageDir = env.QODER_STORAGE_DIR || path.join(home, '.qoderworkcn');
  const qoderCli = env.QODER_CLI || path.join(
    home,
    'AppData',
    'Local',
    'Programs',
    'QoderWork CN',
    'resources',
    'bin',
    'qodercli.exe',
  );

  return {
    host: env.QODER_BRIDGE_HOST || DEFAULT_HOST,
    port: Number.parseInt(env.QODERWORKCN_BRIDGE_PORT || env.QODER_BRIDGE_PORT || String(DEFAULT_PORT), 10),
    apiKey: env.QODERWORKCN_BRIDGE_KEY || '',
    qoderCli,
    storageDir,
    resourceDir: env.QODER_RESOURCE_DIR || storageDir,
    qoderSite: env.QODER_SITE || 'cn',
    qoderModel: env.QODER_MODEL || QODER_MODEL,
    bridgeModel: env.QODER_BRIDGE_MODEL || DEFAULT_MODEL,
    codexHome: env.QODERWORKCN_CODEX_HOME || '',
    usageLedger: env.QODERWORKCN_USAGE_LEDGER || '',
    inputUsdPer1M: env.QODERWORKCN_INPUT_USD_PER_1M || '',
    outputUsdPer1M: env.QODERWORKCN_OUTPUT_USD_PER_1M || '',
    cachedInputUsdPer1M: env.QODERWORKCN_CACHED_INPUT_USD_PER_1M || '',
    workspace: env.QODER_WORKSPACE || '',
    timeoutMs: parseTimeoutMs(env.QODER_BRIDGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxPromptChars: Number.parseInt(env.QODER_BRIDGE_MAX_PROMPT_CHARS || '1000000', 10),
    serialize: env.QODER_BRIDGE_SERIALIZE !== 'false',
  };
}

export function createServer(options = {}) {
  const config = options.config || loadConfig();
  const qoderClient = options.qoderClient || createQoderCliClient(config);
  const queue = createQueue(config.serialize);
  const responseStore = new Map();

  return http.createServer(async (req, res) => {
    try {
      addCorsHeaders(res);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) {
        sendJson(res, 200, {
          ok: true,
          bridge: 'qoderworkcn-responses-bridge',
          model: config.bridgeModel,
          qoderModel: config.qoderModel,
          timeoutMs: config.timeoutMs,
          toolBridge: 'structured-json',
          supportsParallelToolCalls: true,
          codexHome: config.codexHome,
          usageLedgerPath: usageLedgerPath(config),
          usagePricingConfigured: usagePricing(config).configured,
          qoderCliExists: existsSync(config.qoderCli),
          serialize: config.serialize,
        });
        return;
      }

      if (req.method === 'GET' && (url.pathname === '/usage' || url.pathname === '/codexbar/cost')) {
        sendJson(res, 200, usageSummary(config, {
          days: url.searchParams.get('days') || 30,
        }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/models') {
        sendJson(res, 200, {
          object: 'list',
          data: [
            {
              id: config.bridgeModel,
              object: 'model',
              created: 0,
              owned_by: 'qoderworkcn-local',
            },
            {
              id: 'qoderworkcn/qmodel',
              object: 'model',
              created: 0,
              owned_by: 'qoderworkcn-local',
            },
          ],
        });
        return;
      }

      const responseIdMatch = url.pathname.match(/^\/v1\/responses\/([^/]+)$/);
      if (req.method === 'GET' && responseIdMatch) {
        const stored = responseStore.get(responseIdMatch[1]);
        if (!stored) {
          sendJson(res, 404, makeError('not_found', 'Response id not found.'));
          return;
        }
        sendJson(res, 200, stored);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/responses') {
        if (!isAuthorized(req, config)) {
          sendJson(res, 401, makeError('unauthorized', 'Missing or invalid bearer token.'));
          return;
        }

        const body = await readJson(req, config.maxPromptChars + 32_768);
        const unsupported = firstUnsupportedFeature(body);
        if (unsupported) {
          sendJson(res, 400, makeError('unsupported_feature', `${unsupported} is not supported by this bridge yet.`));
          return;
        }

        const prompt = normalizeInput(body);
        if (!prompt.trim()) {
          sendJson(res, 400, makeError('invalid_request', 'input or instructions must contain text.'));
          return;
        }
        if (prompt.length > config.maxPromptChars) {
          sendJson(res, 413, makeError('prompt_too_large', `Prompt exceeds ${config.maxPromptChars} characters.`));
          return;
        }

        const responseId = `resp_${randomUUID().replaceAll('-', '')}`;
        const createdAt = Math.floor(Date.now() / 1000);
        const model = body.model || config.bridgeModel;
        const hostToolCalls = planHostToolCalls(body);
        if (hostToolCalls.length > 0) {
          const response = makeResponse({
            responseId,
            createdAt,
            model,
            text: toolCallsToEnvelope(hostToolCalls),
            tools: body.tools,
            usage: estimateUsage(prompt, ''),
          });
          responseStore.set(responseId, response);
          if (body.stream === true) {
            sendStreamedCompletedResponse(res, response);
          } else {
            sendJson(res, 200, response);
          }
          return;
        }

        const controller = new AbortController();
        const abortOnDisconnect = () => {
          if (!res.writableEnded) {
            controller.abort(new Error('client disconnected'));
          }
        };
        req.on('aborted', abortOnDisconnect);
        res.on('close', abortOnDisconnect);

        const run = () => qoderClient.run({
          prompt,
          model: config.qoderModel,
          maxOutputTokens: body.max_output_tokens,
          timeoutMs: config.timeoutMs,
          signal: controller.signal,
        });

        if (body.stream === true) {
          await streamResponse(res, {
            responseId,
            createdAt,
            model,
            prompt,
            tools: body.tools,
            run: () => queue(run),
            responseStore,
            config,
          });
          return;
        }

        const result = await queue(run);
        const response = makeResponse({
          responseId,
          createdAt,
          model,
          text: result.text,
          tools: body.tools,
          usage: estimateUsage(prompt, result.text),
        });
        recordBridgeUsage(config, response);
        responseStore.set(responseId, response);
        sendJson(res, 200, response);
        return;
      }

      sendJson(res, 404, makeError('not_found', 'Route not found.'));
    } catch (error) {
      const status = error.statusCode || mapErrorStatus(error);
      sendJson(res, status, makeError(error.code || 'bridge_error', sanitizeErrorMessage(error)));
    }
    });
}

export function normalizeInput(body = {}) {
  const sections = [];

  if (typeof body.instructions === 'string' && body.instructions.trim()) {
    sections.push(`System:\n${body.instructions.trim()}`);
  }

  const inputText = inputToText(body.input);
  if (inputText.trim()) {
    sections.push(inputText.trim());
  }

  const toolsText = toolsToPrompt(body.tools);
  if (toolsText) {
    sections.push(toolsText);
  }

  return sections.join('\n\n');
}

function inputToText(input) {
  if (typeof input === 'string') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(itemToText).filter(Boolean).join('\n\n');
  }

  if (input && typeof input === 'object') {
    return itemToText(input);
  }

  return '';
}

function itemToText(item) {
  if (typeof item === 'string') {
    return item;
  }
  if (!item || typeof item !== 'object') {
    return '';
  }

  const role = typeof item.role === 'string' ? `${capitalize(item.role)}:\n` : '';

  if (item.type === 'function_call') {
    const args = typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {});
    return `Previous tool call ${item.name || 'unknown'} (${item.call_id || item.id || 'no-call-id'}):\n${args}`;
  }
  if (item.type === 'function_call_output') {
    const output = typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? '');
    return `Tool result for ${item.call_id || 'unknown-call'}:\n${output}`;
  }

  if (typeof item.content === 'string') {
    return `${role}${item.content}`;
  }
  if (Array.isArray(item.content)) {
    const content = item.content.map(partToText).filter(Boolean).join('\n');
    return content ? `${role}${content}` : '';
  }
  if (typeof item.text === 'string') {
    return `${role}${item.text}`;
  }
  if (typeof item.output === 'string') {
    return `${role}${item.output}`;
  }

  return '';
}

function toolsToPrompt(tools) {
  const descriptors = toolDescriptors(tools);
  if (descriptors.length === 0) return '';

  const toolLines = descriptors.map(tool => {
    const parts = [
      `- ${tool.label}`,
      tool.namespace ? `  namespace: ${tool.namespace}` : '',
      `  name: ${tool.name}`,
      tool.description ? `  description: ${tool.description}` : '',
      tool.parameters ? `  input_schema: ${JSON.stringify(tool.parameters)}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  });

  return [
    'Codex host tools are available through this bridge. These are not QoderWork native tools.',
    'To ask Codex to run a host tool, reply with only this XML-tagged JSON and no prose:',
    '<codex_tool_calls>',
    '[{"namespace":"optional_namespace","name":"exact_tool_name","arguments":{"key":"value"}}]',
    '</codex_tool_calls>',
    'If a needed tool is listed below, do not say tools are unavailable; emit the envelope instead.',
    'Use the exact tool names below. After tool results are returned, continue normally.',
    'Available tools:',
    ...toolLines,
  ].join('\n');
}

function toolDescriptors(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== 'object') return null;
    if (tool.type === 'namespace' && Array.isArray(tool.tools)) {
      const namespace = stringOrEmpty(tool.name);
      return tool.tools.map(inner => toolDescriptor(inner, namespace)).filter(Boolean);
    }
    return toolDescriptor(tool, stringOrEmpty(tool.namespace) || stringOrEmpty(tool.tool_namespace));
  }).filter(Boolean);
}

function toolDescriptor(tool, namespace = '') {
  if (!tool || typeof tool !== 'object') return null;
  const name = stringOrEmpty(tool.name) || stringOrEmpty(tool.function?.name);
  if (!name) return null;
  const descriptorNamespace = namespace || stringOrEmpty(tool.namespace) || stringOrEmpty(tool.tool_namespace);
  return {
    namespace: descriptorNamespace,
    name,
    label: descriptorNamespace ? `${descriptorNamespace}.${name}` : name,
    description: stringOrEmpty(tool.description) || stringOrEmpty(tool.function?.description),
    parameters: tool.parameters || tool.input_schema || tool.inputSchema || tool.function?.parameters || null,
  };
}

function partToText(part) {
  if (typeof part === 'string') {
    return part;
  }
  if (!part || typeof part !== 'object') {
    return '';
  }
  if (typeof part.text === 'string') {
    return part.text;
  }
  if (typeof part.output_text === 'string') {
    return part.output_text;
  }
  if (typeof part.content === 'string') {
    return part.content;
  }
  if (typeof part.output === 'string') {
    return part.output;
  }
  return '';
}

function firstUnsupportedFeature(body) {
  if (body.response_format) return 'response_format';
  if (body.text && typeof body.text === 'object' && body.text.format && body.text.format.type && body.text.format.type !== 'text') {
    return 'text.format';
  }
  return '';
}

function createQoderCliClient(config) {
  return {
    async run({ prompt, maxOutputTokens, timeoutMs, signal }) {
      if (!existsSync(config.qoderCli)) {
        const error = new Error('QoderWork CN CLI was not found.');
        error.code = 'qoder_cli_not_found';
        throw error;
      }

      const args = [
        '--storage-dir',
        config.storageDir,
        '--resource-dir',
        config.resourceDir,
        '--site',
        config.qoderSite,
        '--model',
        config.qoderModel,
        '-q',
        '-f',
        'text',
      ];

      if (maxOutputTokens) {
        args.push('--max-output-tokens', String(maxOutputTokens));
      }
      if (config.workspace) {
        args.push('-w', config.workspace);
      }
      args.push('-p', '-');

      return runProcess(config.qoderCli, args, {
        input: prompt,
        timeoutMs,
        signal,
        cwd: config.workspace || process.cwd(),
      });
    },
  };
}

export function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      const error = new Error('Request was cancelled.');
      error.code = 'request_cancelled';
      reject(error);
      return;
    }

    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        CI: '1',
        TERM: 'dumb',
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const watchdog = createQoderWatchdog({
      timeoutMs: options.timeoutMs,
      onTimeout() {
        const error = new Error('QoderWork CN CLI timed out.');
        error.code = 'qoder_cli_timeout';
        cleanup();
        killChild(child);
        reject(error);
      },
    });

    const abort = () => {
      const error = new Error('Request was cancelled.');
      error.code = 'request_cancelled';
      cleanup();
      killChild(child);
      reject(error);
    };

    const cleanup = () => {
      if (settled) return false;
      settled = true;
      watchdog?.dispose();
      options.signal?.removeEventListener('abort', abort);
      return true;
    };

    options.signal?.addEventListener('abort', abort, { once: true });

    child.stdin.on('error', () => {});
    child.stdin.end(options.input || '');
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      if (!cleanup()) return;
      error.code = error.code || 'qoder_cli_spawn_error';
      reject(error);
    });
    child.on('close', code => {
      if (!cleanup()) return;
      if (code !== 0) {
        const error = new Error('QoderWork CN CLI exited with a non-zero status.');
        error.code = 'qoder_cli_failed';
        error.stderr = stripAnsi(stderr).slice(0, 2000);
        reject(error);
        return;
      }
      resolve({
        text: stripAnsi(stdout).trim(),
        stderr: stripAnsi(stderr).trim(),
      });
    });
  });
}

export function createQoderWatchdog({ timeoutMs, onTimeout, timers = globalThis } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;
  const setTimer = timers.setTimeout || setTimeout;
  const clearTimer = timers.clearTimeout || clearTimeout;
  const timer = setTimer(onTimeout, timeoutMs);
  return {
    dispose() {
      clearTimer(timer);
    },
  };
}

function killChild(child) {
  if (child.killed) {
    return;
  }
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    killer.on('error', () => {});
    return;
  }
  child.kill();
}

function createQueue(enabled) {
  if (!enabled) {
    return task => task();
  }

  let chain = Promise.resolve();
  return task => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };
}

async function streamResponse(res, options) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  writeSse(res, 'response.created', {
    type: 'response.created',
    response: {
      id: options.responseId,
      object: 'response',
      created_at: options.createdAt,
      status: 'in_progress',
      model: options.model,
      output: [],
    },
  });

  const heartbeat = setInterval(() => {
    writeSseComment(res, 'keep-alive');
  }, STREAM_HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    const result = await options.run();
    const response = makeResponse({
      responseId: options.responseId,
      createdAt: options.createdAt,
      model: options.model,
      text: result.text,
      tools: options.tools,
      usage: estimateUsage(options.prompt, result.text),
    });
    recordBridgeUsage(options.config, response);
    options.responseStore.set(options.responseId, response);

    writeResponseOutputEvents(res, response);
    writeSse(res, 'response.completed', {
      type: 'response.completed',
      response,
      sequence_number: 1,
    });
    res.end();
  } catch (error) {
    writeSse(res, 'response.failed', {
      type: 'response.failed',
      response: {
        id: options.responseId,
        status: 'failed',
        error: {
          code: error.code || 'bridge_error',
          message: sanitizeErrorMessage(error),
        },
      },
    });
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
}

function sendStreamedCompletedResponse(res, response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  writeSse(res, 'response.created', {
    type: 'response.created',
    response: {
      id: response.id,
      object: 'response',
      created_at: response.created_at,
      status: 'in_progress',
      model: response.model,
      output: [],
    },
  });
  writeResponseOutputEvents(res, response);
  writeSse(res, 'response.completed', {
    type: 'response.completed',
    response,
    sequence_number: response.output.length + 1,
  });
  res.end();
}

function writeResponseOutputEvents(res, response) {
  response.output.forEach((item, outputIndex) => {
    writeSse(res, 'response.output_item.done', {
      type: 'response.output_item.done',
      output_index: outputIndex,
      item,
    });
    if (item.type === 'function_call') {
      writeSse(res, 'response.function_call_arguments.done', {
        type: 'response.function_call_arguments.done',
        item_id: item.id,
        name: item.name,
        output_index: outputIndex,
        arguments: item.arguments,
        sequence_number: outputIndex + 1,
      });
    }
  });
}

function recordBridgeUsage(config, response) {
  try {
    recordUsage(config, response, { qoderModel: config?.qoderModel });
  } catch {
    // Usage telemetry must never break model responses.
  }
}

export function makeResponse({ responseId, createdAt, model, text, tools, usage }) {
  const outputId = `msg_${randomUUID().replaceAll('-', '')}`;
  const toolCalls = parseQoderToolCalls(text, tools);
  const output = toolCalls.length > 0
    ? toolCalls.map(call => makeFunctionCallItem(call))
    : [
      {
        id: outputId,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text,
            annotations: [],
          },
        ],
      },
    ];

  return {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    status: 'completed',
    model,
    output,
    parallel_tool_calls: output.filter(item => item.type === 'function_call').length > 1,
    usage,
  };
}

function makeFunctionCallItem(call) {
  const item = {
    id: `fc_${randomUUID().replaceAll('-', '')}`,
    type: 'function_call',
    status: 'completed',
    call_id: `call_${randomUUID().replaceAll('-', '')}`,
    name: call.name,
    arguments: JSON.stringify(call.arguments || {}),
  };
  if (call.namespace) {
    item.namespace = call.namespace;
  }
  return item;
}

function estimateUsage(input, output) {
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);
  return {
    input_tokens: inputTokens,
    input_tokens_details: {
      cached_tokens: 0,
    },
    output_tokens: outputTokens,
    output_tokens_details: {
      reasoning_tokens: 0,
    },
    total_tokens: inputTokens + outputTokens,
  };
}

export function parseQoderToolCalls(text, tools = []) {
  const parsed = parseToolCallPayload(text);
  if (!parsed) return [];

  const calls = normalizeToolCallPayload(parsed);
  if (calls.length === 0) return [];

  const names = toolNameResolver(tools);
  return calls.map((call) => {
    const requestedName = stringOrEmpty(call.name || call.tool || call.function?.name);
    const requestedNamespace = stringOrEmpty(call.namespace || call.tool_namespace || call.function?.namespace);
    const tool = names.resolve(requestedName, requestedNamespace);
    if (!tool) return null;
    const rawArgs = call.arguments ?? call.args ?? call.input ?? call.function?.arguments ?? {};
    return {
      namespace: tool.namespace,
      name: tool.name,
      arguments: normalizeArguments(rawArgs),
    };
  }).filter(Boolean);
}

export function planHostToolCalls(body = {}) {
  if (containsFunctionCallItems(body.input)) return [];
  const prompt = inputToText(body.input);
  if (!/\bsubagents?\b|子代理|子智能体|子任务/i.test(prompt)) return [];

  const createThreadTool = findToolDescriptor(body.tools, 'create_thread');
  if (!createThreadTool) return [];

  const specs = extractSubagentSpecs(prompt);
  if (specs.length === 0) return [];

  return specs.map((spec, index) => ({
    namespace: createThreadTool.namespace,
    name: createThreadTool.name,
    arguments: {
      prompt: buildSubagentPrompt(spec, prompt),
      target: {
        type: 'projectless',
        directoryName: safeDirectoryName(`${index + 1}-${spec.label}`),
      },
    },
  }));
}

function containsFunctionCallItems(input) {
  if (!Array.isArray(input)) return false;
  return input.some(item => item && typeof item === 'object' && (
    item.type === 'function_call' ||
    item.type === 'function_call_output'
  ));
}

function findToolDescriptor(tools, name) {
  const descriptors = toolDescriptors(tools);
  return descriptors.find(tool => (
    tool.name === name ||
    tool.label === name ||
    tool.label.endsWith(`.${name}`) ||
    tool.name.endsWith(`.${name}`)
  )) || null;
}

function extractSubagentSpecs(text) {
  const specs = [];
  const pattern = /^\s*(?:[-*]\s*)?(Subagent\s+[A-Za-z0-9_-]+|子(?:代理|智能体|任务)?\s*[A-Za-z0-9_-]+)\s*[：:]\s*(.+)$/gim;
  let match;
  while ((match = pattern.exec(String(text || ''))) !== null) {
    const task = match[2].trim();
    if (task) {
      specs.push({
        label: match[1].trim().replace(/\s+/g, '-'),
        task,
      });
    }
  }
  return specs;
}

function buildSubagentPrompt(spec, originalPrompt) {
  return [
    `你是 ${spec.label}。只完成分配给你的子任务，不要改动用户现有项目，除非任务明确要求。`,
    '',
    `子任务：${spec.task}`,
    '',
    '原始上下文：',
    truncateText(originalPrompt, 12000),
    '',
    '请输出可并入主线程的结论：核验过的地址、执行过的命令、安装/运行结果、缺失凭据、关键证据路径。',
  ].join('\n');
}

function toolCallsToEnvelope(calls) {
  return `<codex_tool_calls>${JSON.stringify(calls.map(call => ({
    namespace: call.namespace,
    name: call.name,
    arguments: call.arguments,
  })))}</codex_tool_calls>`;
}

function safeDirectoryName(value) {
  return String(value || 'subagent')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'subagent';
}

function truncateText(text, limit) {
  const value = String(text || '');
  return value.length <= limit ? value : `${value.slice(0, limit)}\n...[truncated]`;
}

function parseToolCallPayload(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const tagged = /<codex_tool_calls>\s*([\s\S]*?)\s*<\/codex_tool_calls>/i.exec(raw);
  if (tagged) {
    return parseJsonLoose(tagged[1]);
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(raw);
  if (fenced) {
    const parsed = parseJsonLoose(fenced[1]);
    if (parsed && hasToolCallShape(parsed)) return parsed;
  }

  const parsed = parseJsonLoose(raw);
  return parsed && hasToolCallShape(parsed) ? parsed : null;
}

function parseJsonLoose(raw) {
  try {
    return JSON.parse(String(raw || '').trim());
  } catch {
    return null;
  }
}

function hasToolCallShape(value) {
  if (Array.isArray(value)) {
    return value.some(item => item && typeof item === 'object' && (item.name || item.tool || item.function?.name));
  }
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value.tool_calls) || Array.isArray(value.calls)) return true;
  if (value.tool_call || value.call) return true;
  return value.type === 'function_call' && Boolean(value.name || value.function?.name);
}

function normalizeToolCallPayload(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.tool_calls)) return value.tool_calls;
  if (Array.isArray(value.calls)) return value.calls;
  if (value.tool_call) return [value.tool_call];
  if (value.call) return [value.call];
  if (value.type === 'function_call') return [value];
  return [];
}

function toolNameResolver(tools = []) {
  const exact = new Map();
  const bySuffix = new Map();

  for (const tool of toolDescriptors(tools)) {
    exact.set(tool.name, tool);
    exact.set(tool.label, tool);
    const suffix = tool.label.split(/[.:/]/).pop();
    if (suffix) {
      bySuffix.set(suffix, bySuffix.has(suffix) ? null : tool);
    }
  }

  return {
    resolve(name, namespace = '') {
      if (!name) return '';
      if (namespace && exact.has(`${namespace}.${name}`)) return exact.get(`${namespace}.${name}`);
      if (exact.has(name)) return exact.get(name);
      const suffix = name.split(/[.:/]/).pop();
      return suffix && bySuffix.get(suffix) ? bySuffix.get(suffix) : '';
    },
  };
}

function normalizeArguments(value) {
  if (typeof value === 'string') {
    const parsed = parseJsonLoose(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil([...String(text)].length / 4));
}

function parseTimeoutMs(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function writeSse(res, event, data) {
  if (res.destroyed || res.writableEnded) {
    return;
  }
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSseComment(res, text) {
  if (res.destroyed || res.writableEnded) {
    return;
  }
  res.write(`: ${text}\n\n`);
}

function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
}

function addCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
        const error = new Error('Request body too large.');
        error.statusCode = 413;
        error.code = 'request_too_large';
        reject(error);
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error('Request body must be valid JSON.');
        error.statusCode = 400;
        error.code = 'invalid_json';
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req, config) {
  if (!config.apiKey) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${config.apiKey}`;
}

function makeError(code, message) {
  return {
    error: {
      message,
      type: code,
      code,
    },
  };
}

function mapErrorStatus(error) {
  switch (error.code) {
    case 'qoder_cli_not_found':
      return 503;
    case 'qoder_cli_failed':
      return 502;
    case 'qoder_cli_timeout':
      return 504;
    case 'request_cancelled':
      return 499;
    default:
      return 500;
  }
}

function sanitizeErrorMessage(error) {
  if (error?.code === 'qoder_cli_failed' && error.stderr) {
    return `QoderWork CN CLI failed: ${error.stderr}`;
  }
  return String(error?.message || 'Bridge error.');
}

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const config = loadConfig();
  const server = createServer({ config });
  server.listen(config.port, config.host, () => {
    console.log(`qoderworkcn-responses-bridge listening on http://${config.host}:${config.port}`);
  });
}
