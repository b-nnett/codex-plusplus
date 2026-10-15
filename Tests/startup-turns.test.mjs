// Behaviour tests for the turns lane of startup edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adapt} from './startup-harness.mjs';

// The vendor stream handler's command-output flush (app-shared), reduced to its shape.
const outputShared = 'function vde(e,t){let n=e.turnHistory?.kind===`canonical`?e.turnHistory.history:null;if(n!=null){for(let e=n.islands.length-1;e>=0;--e){let r=n.islands[e];' +
  'for(let e=r.entries.length-1;e>=0;--e){let i=r.entries[e]?.value,a=i==null?null:n.entitiesByKey[i];if(i!=null&&a!=null&&t(a))return{entityKey:i,turn:a}}}return null}' +
  'for(let n=e.turns.length-1;n>=0;--n){let r=e.turns[n];if(r!=null&&t(r))return{entityKey:`turn:${r.turnId}`,turn:r}}return null}' +
  'function yV(e,t,n){return e.items.find(e=>e.id===t&&e.type===n)??null}' +
  'var ctn=class{hostId;threadStore;logger;constructor(e){this.hostId=`local`,this.threadStore=e,this.logger={debug(){}}}' +
  'applyOutputDeltas(e){if(e.length===0)return;let t=new Map;for(let n of e){let e=t.get(n.conversationId);e?e.push(n):t.set(n.conversationId,[n])}' +
  'for(let[e,n]of t){let t=this.threadStore.conversations.get(e);if(!t)continue;let r={changes:[],turnEntityKeys:new Set};' +
  'this.threadStore.updateConversationState(e,t=>{for(let{turnId:i,itemId:a,delta:o}of n){let n=vde(t,e=>e.items.some(e=>e.id===a&&e.type===`commandExecution`)),' +
  's=n==null?null:yV(n.turn,a,`commandExecution`);if(s!=null&&n!=null){let i=s.aggregatedOutput??``;s.aggregatedOutput=i+o;r.turnEntityKeys.add(n.entityKey),' +
  'r.changes.push({type:`text`,key:{hostId:this.hostId,threadId:e,entityKey:n.entityKey,itemId:a},target:{field:`aggregatedOutput`},edits:[{at:i.length,deleteCount:0,insert:o}]})}' +
  's??this.logger.debug(`Dropping commandExecution/outputDelta for missing item`)}},{broadcastPatchesToFollowers:!1,acceptedTranscriptText:r})}}' +
  'applyFrameTextDeltas(e){this.threadStore.updateConversationState(e,t=>{t.x=1},{broadcastPatchesToFollowers:!1,acceptedTranscriptText:{}})}};';

const command = (id, output = '') => ({type: 'commandExecution', id, aggregatedOutput: output});
const canonical = (...turns) => ({id: 'thread', turns: [], turnHistory: {kind: 'canonical', history: {
  islands: [{newerBoundary: {status: 'exhausted'}, entries: turns.map(t => ({value: `turn:${t.turnId}`}))}],
  entitiesByKey: Object.fromEntries(turns.map(t => [`turn:${t.turnId}`, t]))}}});

function run(source, conversation, deltas) {
  const sandbox = {};
  vm.runInNewContext(`${source};this.ctn=ctn;`, sandbox);
  const calls = [];
  const store = {conversations: new Map([['thread', conversation]]), updateConversationState(id, update, options) {
    update(conversation);
    calls.push(JSON.parse(JSON.stringify({id, options: {...options, acceptedTranscriptText: undefined}})));
  }};
  new sandbox.ctn(store).applyOutputDeltas(deltas.map(d => ({conversationId: 'thread', ...d})));
  return {options: calls[0].options, conversation};
}

test('command output for the latest turn is reported as an item content change', () => {
  const {shared: patched, applied} = adapt({shared: outputShared});
  assert.equal(applied.commandOutputItemContentOnly, 'shared');
  const latest = () => ({turnId: 't2', items: [{type: 'agentMessage', id: 'a'}, command('c1', 'one\n'), command('c2')]});
  const older = {turnId: 't1', items: [command('old', 'x')]};

  // Stock: the store is told nothing about what changed.
  const stock = run(outputShared, canonical(older, latest()), [{turnId: 't2', itemId: 'c1', delta: 'two\n'}]);
  assert.deepEqual(stock.options, {broadcastPatchesToFollowers: false});

  // Patched: the latest turn and its changed commands are named; the output is applied the same way.
  const patchedRun = run(patched, canonical(older, latest()), [{turnId: 't2', itemId: 'c1', delta: 'two\n'}, {turnId: 't2', itemId: 'c2', delta: 'x'}]);
  assert.deepEqual(patchedRun.options, {broadcastPatchesToFollowers: false, knownHistoryInvalidation: {type: 'entityKeys', entityKeys: ['turn:t2']},
    knownChangedItems: [{entityKey: 'turn:t2', itemId: 'c1'}, {entityKey: 'turn:t2', itemId: 'c2'}]});
  const items = patchedRun.conversation.turnHistory.history.entitiesByKey['turn:t2'].items;
  assert.equal(items[1].aggregatedOutput, 'one\ntwo\n');
  assert.equal(items[2].aggregatedOutput, 'x');

  // Fallback: anything else keeps the original update.
  const original = {broadcastPatchesToFollowers: false};
  assert.deepEqual(run(patched, canonical(older, latest()), [{turnId: 't1', itemId: 'old', delta: 'y'}]).options, original, 'a command in an older turn');
  assert.deepEqual(run(patched, canonical(older, latest()), [{turnId: 't9', itemId: 'c1', delta: 'y'}]).options, original, 'a delta for another turn id');
  assert.deepEqual(run(patched, canonical(older, latest()), [{turnId: 't2', itemId: 'missing', delta: 'y'}]).options, original, 'an unknown item');
  assert.deepEqual(run(patched, {id: 'thread', turns: [latest()]}, [{turnId: 't2', itemId: 'c1', delta: 'y'}]).options, original, 'a conversation without canonical history');
  const loading = canonical(older, latest()); loading.turnHistory.history.islands[0].newerBoundary.status = 'loading';
  assert.deepEqual(run(patched, loading, [{turnId: 't2', itemId: 'c1', delta: 'y'}]).options, original, 'newer turns not loaded');
});

test('the command output edit is skipped when the flush has another shape', () => {
  const {applied, skipped} = adapt({shared: outputShared.replace('acceptedTranscriptText:r})}}', 'acceptedTranscriptText:r,knownChangedItems:[]})}}')});
  assert.equal(applied.commandOutputItemContentOnly, undefined);
  assert.equal(skipped.commandOutputItemContentOnly, 'expected one match, found 0');
});
