import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// scripts/review-build.py's formatter and diff, on raw --review-build output.
const script = new URL('../scripts/review-build.py', import.meta.url).pathname;
const chunk = (key, prefix, path, prefixMatches = path ? 1 : 0) =>
  ({key, directory:'webview/assets', prefix, markers:[], prefixMatches, ...(path ? {path} : {})});
function review({build, startupEdits, chunks, settings = {status:'ok'}, startup = {}}) {
  return {
    schema:1, generatedAt:'2026-10-15T00:00:00Z', tool:{patchRevision:150, experiments:false},
    app:{requested:'/Applications/ChatGPT.app', original:'/Applications/.ChatGPT.codexpp-original-X.app'},
    identity:{version:'26.1.0', build, headerHash:'h'+build, archiveSHA256:'a'+build, pinned:false, vendorAuthenticated:true, status:'vendor-authenticated'},
    native:[{name:'bootstrapEntry', status:'applied', target:'.vite/build/early-bootstrap.js'}],
    adapters:[
      {name:'settings', required:true, seconds:2, edits:settings.status === 'ok' ? [{name:'page', status:'applied', target:'settings-page-1.js (a)'}] : [], ...settings},
      {name:'startup', required:true, seconds:25, status:'ok', edits:startupEdits, chunks, ...startup},
    ],
  };
}
const before = review({build:'100', chunks:[chunk('initial','app-initial-','app-initial-1.js'), chunk('shared','app-shared-','app-shared-1.js')], startupEdits:[
  {name:'cachedFlags', status:'applied', target:'initial', release:true},
  {name:'liveUpdates', status:'applied', target:'shared', release:true},
  {name:'queryTimings', status:'skipped', reason:'development builds only', release:false},
]});
const after = review({build:'200', chunks:[chunk('initial','app-initial-',null,2), chunk('shared','app-shared-','app-shared-2.js')], startupEdits:[
  {name:'cachedFlags', status:'skipped', reason:'module not found', release:true},
  {name:'liveUpdates', status:'skipped', reason:'expected one match, found 0', release:true},
  {name:'newSpeedup', status:'applied', target:'shared', release:true},
  {name:'queryTimings', status:'skipped', reason:'development builds only', release:false},
]});

function run(current, against) {
  const directory = mkdtempSync(join(tmpdir(), 'codexpp-review-test-'));
  try {
    const raw = join(directory, 'raw.json'), old = join(directory, 'old.json');
    writeFileSync(raw, JSON.stringify(current));
    const args = [script, '--from-json', raw, '--out-dir', directory];
    if (against) { writeFileSync(old, JSON.stringify(against)); args.push('--against', old); }
    const result = spawnSync('python3', args, {encoding:'utf8', timeout:20000});
    const build = current.identity.build;
    return {...result, report:JSON.parse(readFileSync(join(directory, `${build}.json`), 'utf8')), md:readFileSync(join(directory, `${build}.md`), 'utf8')};
  } finally { rmSync(directory, {recursive:true, force:true}); }
}

test('a release edit that applied before and now skips fails the review, with a chunk diagnosis', () => {
  const {status, report, md} = run(after, before);
  assert.equal(status, 1);
  assert.deepEqual(report.diff.regressions.map(r => r.edit), ['startup.cachedFlags', 'startup.liveUpdates']);
  assert.deepEqual(report.diff.newlyApplied, []);
  assert.deepEqual(report.diff.added.map(r => r.edit), ['startup.newSpeedup']);
  const edits = Object.fromEntries(report.adapters[1].edits.map(e => [e.name, e]));
  assert.match(edits.cachedFlags.hint, /chunk `initial` not found \(prefix `app-initial-` in webview\/assets matched 2 file\(s\); needs exactly one\)/);
  assert.match(edits.liveUpdates.hint, /code shape is gone from `shared` \(app-shared-2\.js\)/);
  assert.equal(edits.queryTimings.hint, 'diagnostic edit; release helpers never apply it');
  assert.match(report.summary.warnings[0], /startup discovery took 25\.0 s \(over 20 s; the first deadline is 60 s, then one retry at 180 s\)/);
  assert.match(md, /\*\*Regressions\*\* .*`startup\.cachedFlags` \(module not found\)/);
  assert.match(md, /## Skipped release edits/);
  assert.match(md, /Development-only diagnostics skipped as expected: queryTimings\./);
});

test('an unchanged build and a newly applied edit pass', () => {
  assert.equal(run(before, before).status, 0);
  assert.match(run(before, before).md, /No edit changed status\./);
  const {status, report} = run(before, after);
  assert.equal(status, 0);
  assert.deepEqual(report.diff.newlyApplied.map(r => r.edit), ['startup.cachedFlags', 'startup.liveUpdates']);
  // Not reported by an adapter that ran: taken out of Codex++, not a regression.
  assert.deepEqual(report.diff.removed.map(r => r.edit), ['startup.newSpeedup']);
  assert.deepEqual(report.diff.regressions, []);
});

test('edits lost to a failed adapter are regressions', () => {
  const broken = review({build:'200', chunks:[], startupEdits:[], settings:{status:'failed', error:'Settings compatibility: no page'}});
  const {status, report} = run(broken, before);
  assert.equal(status, 1);
  assert.ok(report.diff.regressions.some(r => r.edit === 'settings.page' && r.now === null));
  assert.deepEqual(report.diff.adapters, [{adapter:'settings', was:'ok', now:'failed'}]);
});

test('a required adapter failure means the build would not patch, even without a baseline', () => {
  const failed = review({build:'300', chunks:[], startupEdits:[], settings:{status:'failed',
    error:'Code discovery failed: /tmp/parser-runner.js:20\nError: Settings compatibility: expected one Button, found 2\n    at fail (settings-adapter:5:47)'}});
  const {status, report, md} = run(failed);
  assert.equal(status, 1);
  assert.equal(report.summary.wouldPatch, false);
  assert.deepEqual(report.summary.blockers, ['settings: Settings compatibility: expected one Button, found 2']);
  assert.match(md, /would FAIL/);
  assert.equal(report.diff, undefined);
});

test('a startup discovery that cannot finish, even retried, means the build would not patch', () => {
  const timedOut = review({build:'400', chunks:[], startupEdits:[], startup:{status:'failed', seconds:241,
    retries:['Code discovery timed out after 60 s; the app was not patched.'],
    error:'Startup discovery failed (Code discovery timed out after 180 s; the app was not patched.). ChatGPT was left as it was; retry the patch when the Mac is less busy.'}});
  const {status, report} = run(timedOut);
  assert.equal(status, 1);
  assert.match(report.summary.blockers[0], /^startup: Startup discovery failed \(Code discovery timed out after 180 s/);
  assert.match(report.summary.warnings[0], /startup discovery was retried with a longer deadline after: Code discovery timed out after 60 s/);
});
