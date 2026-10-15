// Behaviour tests for the usage lane of startup edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adapt} from './startup-harness.mjs';

// The description generator of the app-server chunk, reduced to its shape: the
// prompt builder, the trim, and the generator that forks the source thread.
const descriptionChunk = 'var x0=3e4,$q=`gpt-luna`,D0={description:1},O0={schema:1};' +
  'function y0(e){return[`You are in a fork of an existing Codex thread.`,`Fill the structured description field with a compact, search-oriented summary (up to 100 characters) of the thread\'s current purpose.`,' +
  '`Prioritize the most recent active purpose over older topics if the thread has shifted.`,e==null?null:`Current title: ${e}`,' +
  '`Do not respond to the user or do any other work; only fill the description field.`].filter(e=>e!=null).join(`\n`)}' +
  'function I0(e){return e?.replace(/\\s+/g,` `).trim().slice(0,100).trimEnd()||null}' +
  'async function L0(e){return globalThis.generate(e)}' +
  'async function P0({title:e,cwd:t,serviceTier:n,appServerClient:r,model:i=$q,timeoutMs:a=x0,sourceThreadId:o,serviceName:s,signal:c}){' +
  'return I0((await L0({appServerClient:r,model:i,cwd:t,fallbackToFreshThread:!1,feature:`thread_description`,outputSchema:O0,prompt:y0(e),responseSchema:D0,serviceTier:n,serviceName:s,signal:c,sourceThreadId:o,timeoutMs:a}))?.description)}';

const user = text => ({type: 'userMessage', id: `u-${text.slice(0, 8)}`, content: [{type: 'text', text, text_elements: []}, {type: 'image', url: 'x'}]});
const agent = text => ({type: 'agentMessage', id: `a-${text.slice(0, 8)}`, text, phase: 'final_answer'});
const turn = (id, ...items) => ({id, status: 'completed', itemsView: 'summary', items});

// A thread as the app-server's turn summaries report it (oldest first).
function host(turns, {fail = false} = {}) {
  const requests = [];
  return {requests, client: {
    startThread() {}, forkThread() {},
    async sendRequest(method, params, options) {
      requests.push({method, params, options});
      if (fail) throw new Error('unsupported');
      assert.equal(method, 'thread/turns/list');
      const ordered = params.sortDirection === 'asc' ? turns : [...turns].reverse();
      return {data: ordered.slice(0, params.limit), nextCursor: null};
    }}};
}

function load(source) {
  const calls = [];
  const sandbox = {generate: async options => { calls.push(options); return {description: `  summary   ${calls.length}  `}; }};
  vm.runInNewContext(`${source};this.P0=P0;this.y0=y0;`, sandbox);
  return {calls, describe: (client, title = 'Fix pinned order', sourceThreadId = 'thread-1') =>
    sandbox.P0({title, cwd: '/repo', serviceTier: null, appServerClient: client, sourceThreadId, serviceName: undefined}), y0: sandbox.y0};
}

test('a thread description is generated from the title and message excerpts in a fresh thread', async () => {
  const {appServer: patched, applied} = adapt({appServer: descriptionChunk});
  assert.equal(applied.compactThreadDescription, 'appServer');
  const turns = [turn('t1', user('Pinned threads lose their order ' + 'a'.repeat(3000)), agent('Found the sort')),
    turn('t2', user('second request'), agent('second answer')),
    turn('t3', user('Now persist the manual order'), agent('Persisted it ' + 'b'.repeat(5000))),
    turn('t4', user('Add a test for the pinned order'), agent('Added pinned-order.test.ts; it passes'))];

  // Stock: the whole source thread is forked.
  const stock = load(descriptionChunk);
  assert.equal(await stock.describe(host(turns).client), 'summary 1');
  assert.equal(stock.calls[0].sourceThreadId, 'thread-1');
  assert.equal(stock.calls[0].prompt, stock.y0('Fix pinned order'));

  // Patched: two summary pages, then a fresh generation with the same schema, model and feature.
  const run = load(patched), {client, requests} = host(turns);
  assert.equal(await run.describe(client), 'summary 1');
  assert.deepEqual(requests.map(r => [r.params.limit, r.params.sortDirection, r.params.itemsView, r.options.priority]),
    [[2, 'desc', 'summary', 'background'], [1, 'asc', 'summary', 'background']]);
  const call = run.calls[0];
  assert.equal(call.sourceThreadId, undefined);
  assert.equal(call.feature, 'thread_description');
  assert.equal(call.model, 'gpt-luna');
  assert.equal(call.outputSchema.schema, 1);
  const prompt = call.prompt, lines = prompt.split('\n');
  assert.match(lines[0], /^You are given excerpts of an existing Codex thread/);
  assert.ok(prompt.includes('Current title: Fix pinned order'));
  assert.ok(prompt.includes(stock.y0('x').split('\n')[1]), 'keeps the vendor instructions');
  assert.ok(!prompt.includes('You are in a fork'));
  const first = lines.find(l => l.startsWith('First user request: '));
  assert.ok(first.startsWith('First user request: Pinned threads lose their order'));
  assert.ok(first.length <= 'First user request: '.length + 2000);
  const recent = lines.slice(lines.indexOf('Most recent messages:') + 1);
  assert.deepEqual(recent.map(l => l.split(':')[0]), ['User', 'Assistant', 'User', 'Assistant'], 'the last four messages, oldest first');
  assert.ok(recent[0].startsWith('User: Now persist the manual order'));
  assert.ok(recent.at(-1).startsWith('Assistant: Added pinned-order.test.ts'));
  assert.ok(!prompt.includes('second request'));
  assert.ok(recent.join('').length <= 6000 + 4 * 'Assistant: '.length);

  // The same excerpts (no new turn, same title) reuse the description without a model call.
  assert.equal(await run.describe(client), 'summary 1');
  assert.equal(run.calls.length, 1);
  // A new turn, or a new title, generates again.
  turns.push(turn('t5', user('Ship it'), agent('Released 2.0.1')));
  assert.equal(await run.describe(client), 'summary 2');
  assert.equal(await run.describe(client, 'Pinned order'), 'summary 3');
  assert.equal(run.calls.length, 3);
});

test('a short thread sends its messages once, and an unfinished turn is described from what exists', async () => {
  const {appServer: patched} = adapt({appServer: descriptionChunk});
  const run = load(patched);
  await run.describe(host([turn('t1', user('Why does the build fail?'), agent('A missing key')), {id: 't2', status: 'inProgress', items: [user('Fix it')]}]).client);
  const prompt = run.calls[0].prompt;
  assert.ok(!prompt.includes('First user request'), 'the first request is already among the recent messages');
  assert.deepEqual(prompt.split('\n').slice(-3), ['User: Why does the build fail?', 'Assistant: A missing key', 'User: Fix it']);
  assert.equal(run.calls[0].sourceThreadId, undefined);
});

test('the thread is forked as before when its summaries are unavailable', async () => {
  const {appServer: patched} = adapt({appServer: descriptionChunk});
  const forks = async (client, label, sourceThreadId) => {
    const run = load(patched);
    await run.describe(client, 'Title', sourceThreadId);
    await run.describe(client, 'Title', sourceThreadId);
    assert.equal(run.calls.length, 2, `${label}: no reuse`);
    for (const call of run.calls) {
      assert.equal(call.prompt, run.y0('Title'), label);
      assert.equal(call.sourceThreadId, sourceThreadId, label);
    }
  };
  await forks({}, 'a client without requests', 'thread-1');
  await forks(host([], {fail: true}).client, 'a host without turn summaries', 'thread-1');
  await forks(host([]).client, 'no turns', 'thread-1');
  await forks(host([turn('t1', {type: 'commandExecution', id: 'c'}), turn('t2', agent('only a reply'))]).client, 'no user text', 'thread-1');
  await forks(host([turn('t1', user('hello'))]).client, 'no source thread', null);
  await forks({sendRequest: async () => ({result: {data: 'nope'}})}, 'an unexpected response', 'thread-1');

  // Instructions that are no longer the fork prompt keep the original generation.
  const {appServer: reworded} = adapt({appServer: descriptionChunk.replace('You are in a fork of an existing Codex thread.', 'Describe this thread.')});
  const run = load(reworded);
  await run.describe(host([turn('t1', user('hello'))]).client);
  assert.equal(run.calls[0].sourceThreadId, 'thread-1');
  assert.equal(run.calls[0].prompt, run.y0('Fix pinned order'));
});

test('the description edit is skipped when the generator has another shape', () => {
  const {applied, skipped} = adapt({appServer: descriptionChunk.replace('feature:`thread_description`', 'feature:`thread_summary`')});
  assert.equal(applied.compactThreadDescription, undefined);
  assert.equal(skipped.compactThreadDescription, 'expected one match, found 0');
  assert.equal(adapt({appServer: descriptionChunk.replace('sourceThreadId:o,timeoutMs', 'sourceThreadId:null,timeoutMs')}).skipped.compactThreadDescription, 'expected one match, found 0');
});
