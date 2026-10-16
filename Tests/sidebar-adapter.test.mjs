import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const resource = name => fs.readFileSync(new URL(`../Sources/CodexPPCore/Resources/${name}.js`, import.meta.url), 'utf8');
const parser = vm.createContext({});
for (const name of ['acorn', 'sidebar-adapter']) vm.runInContext(resource(name), parser);
const adapt = source => parser.CodexPPSidebarAdapter.adapt(source);

const atoms = Array.from({length: 20}, (_, index) => `F${index}=J(AS,()=>${index})`).join(',');
const icons = Array.from({length: 20}, (_, index) => `Y${index}=Z({name:\`icon-${index}\`,canvas:{}}),W${index}=$(Y${index})`).join(',');
// Shared with SidebarAdapterTests.swift so both parser engines see identical
// input. Minified-looking names on purpose: discovery must not depend on them.
// Each decoy in it satisfies the original single-shape test for one capability.
const fixture = fs.readFileSync(new URL('fixtures/sidebar-adapter/app-shared.js', import.meta.url), 'utf8');

function evaluate(source) {
  const context = vm.createContext({crypto, mk:name => ({name}), Uk:(_, value) => ({value}), Jk:(_, read, options) => ({read, options}),
    J:(_, read) => ({read}), Z:value => value, $:icon => ({icon}), o:() => {}, jsx:() => {}});
  vm.runInContext(source.replace('export{r1 as A};', '') + ';init();', context);
  return context;
}

test('Sidebar discovery exposes every capability and passes over decoys', () => {
  const {source, missing, report} = adapt(fixture);
  assert.deepEqual([...missing], []);
  assert.deepEqual(Object.fromEntries(Object.entries(report).map(([name, entry]) => [name, entry.local])), {
    react:'r1', reactDOM:'d1', tooltip:'q1', canonicalKey:'k3', sectionMutator:'r3', renameSection:'u3', moveSectionItem:'m3',
    removeSectionItem:'x3', createSection:'c3', appScopeDefinition:'AS', sections:'S1', navigationSignal:'NAV', gates:'G1',
    pinIcon:'P1', unpinIcon:'P2', scopeFactory:'Fk', sidebarLayoutGate:null
  });
  const context = evaluate(source);
  const contract = context.__codexPPSidebar;
  assert.equal(contract.protocol, 1);
  assert.equal(contract.reactVersion, '19.2.7');
  assert.equal(contract.react().createElement(), 'el');
  assert.equal(typeof contract.reactDOM().createRoot, 'function');
  assert.equal(contract.navigationSignal.value.navigate, context.o);
  assert.equal(contract.pinIcon.icon.name, 'pin-light-16');
  assert.equal(contract.unpinIcon.icon.name, 'pin-fill-light-16');
  assert.equal(contract.sidebarLayoutGate, '3085093835');
  assert.equal(contract.appScope(), undefined);
  const facade = vm.runInContext('Fk(AS,[],{})', context);
  assert.equal(contract.appScope(), facade, 'AppScope facades are captured');
  vm.runInContext('Fk({other:true},[],{})', context);
  assert.equal(contract.appScope(), facade, 'other scopes are ignored');
  vm.runInContext('Fk(AS,[],{},{transaction:true})', context);
  assert.equal(contract.appScope(), facade, 'transactional facades are ignored');
  assert.equal(typeof contract.appScope().set, 'function');
});

// Each mutation removes one corroborating signal. The capability must then be
// reported missing rather than resolved from its primary shape alone.
const corroborations = {
  react: [',e.version=`19.2.7`', ''],
  reactDOM: ['if(n.version!==`19.2.7`)throw Error(\'mismatch\');', ''],
  tooltip: ["jsx(q1,{tooltipContent:'c'})", "jsx(q1,{label:'c'})"],
  canonicalKey: ['let n=t.slice(13);', 'let n=t;'],
  sectionMutator: ['if(r?.kind===`remove`)return;', ''],
  moveSectionItem: ['let c=k3(e,n);', 'let c=n;'],
  removeSectionItem: ['let a=k3(e,t);', 'let a=t;'],
  createSection: ['itemKeys:n.map(t=>k3(e,t))', 'itemKeys:n'],
  appScopeDefinition: [`,${atoms}`, ''],
  sections: [',S2=J(AS,({get:e})=>e(S1).length>0)', ''],
  navigationSignal: ["function go(e){return e.get(NAV).navigate('/')}", ''],
  gates: [',{onMount:()=>{}}', ''],
  pinIcon: [`,${icons}`, ''],
  scopeFactory: ['return s.set=c,s', 'return s']
};
for (const [capability, [from, to]] of Object.entries(corroborations)) {
  test(`${capability} needs its corroborating evidence`, () => {
    assert.ok(fixture.includes(from), `fixture lacks ${from}`);
    const {missing} = adapt(fixture.replace(from, to));
    assert.ok(missing.some(entry => entry.startsWith(capability)), `${capability} still resolved: ${missing.join(', ')}`);
  });
}

test('Unmatched or ambiguous shapes are reported missing instead of failing the patch', () => {
  const ambiguous = fixture.replace('function q1', "function q2(e){useCtx.useContext(z);return e.tooltipContent&&e.delayDuration&&e.children}\nfunction view2(){return [jsx(q2,{tooltipContent:1}),jsx(q2,{tooltipContent:2}),jsx(q2,{tooltipContent:3})]}\nfunction q1")
    .replace('pin-fill-light-16', 'pin-fill-light-17').replace('`3085093835`', '`1`');
  const {source, missing} = adapt(ambiguous);
  assert.ok(missing.includes('tooltip (2 matches)'));
  assert.ok(missing.includes('unpinIcon (0 matches)'));
  assert.ok(missing.includes('sidebarLayoutGate'));
  assert.match(source, /sidebarLayoutGate:null/);
  assert.doesNotMatch(source, /get tooltip\(\)/);
  assert.throws(() => adapt(source), /already adapted/);
});

const vendor = process.env.CODEXPP_SIDEBAR_MODULE;
test('Discovery resolves every capability in the reviewed app-shared module', {skip: !vendor, timeout: 120000}, () => {
  const {source, missing, report} = adapt(fs.readFileSync(vendor, 'utf8'));
  assert.deepEqual([...missing], []);
  assert.match(source, /sidebarLayoutGate:"3085093835"/);
  // The reviewed 26.1007 build's exports, resolved independently of their names.
  assert.deepEqual(Object.fromEntries(['tooltip', 'renameSection', 'moveSectionItem', 'removeSectionItem', 'createSection', 'canonicalKey',
    'sections', 'navigationSignal', 'gates', 'pinIcon', 'unpinIcon'].map(name => [name, report[name].local])), {
    tooltip:'w5', renameSection:'Lti', moveSectionItem:'Vti', removeSectionItem:'Uti', createSection:'Iti', canonicalKey:'i3',
    sections:'s3', navigationSignal:'TF', gates:'$U', pinIcon:'Dmr', unpinIcon:'Omr'
  });
});

test('Split sidebar modules retain live hooks and capture only the app scope', () => {
  // Move the real scope definition into an imported module. The remaining
  // decoy does not have enough consumers to qualify.
  const shared = 'var SharedScope=mk(`AppScope`);export{SharedScope as Scope};';
  const initial = 'import{Scope as AS}from "./app-shared.js";\n' + fixture
    .replace('var AS,N1', 'var N1').replace('AS=mk(`AppScope`),', '');
  const output = parser.CodexPPSidebarAdapter.adaptModules([
    {path:'app-shared.js',source:shared}, {path:'app-initial.js',source:initial}
  ]);
  assert.deepEqual([...output.missing], []);
  const context = evaluate(output.patches[0].source.replace('export{SharedScope as Scope};','') + '\nglobalThis.earlyContract=globalThis.__codexPPSidebar;\n' +
    output.patches[1].source.replace('import{Scope as AS}from "./app-shared.js";', 'var AS=SharedScope;'));
  assert.deepEqual([...context.__codexPPSidebar.missing], []);
  assert.equal(typeof context.__codexPPSidebar.renameSection, 'function');
  assert.equal(context.earlyContract.renameSection, context.__codexPPSidebar.renameSection);
  const facade=vm.runInContext('Fk(AS,[],{})',context);
  assert.equal(context.__codexPPSidebar.appScope(),facade);
  assert.equal(context.__codexPPSidebar.react().createElement(),'el');
});

test('Split discovery rejects duplicate capability owners', () => {
  assert.throws(() => parser.CodexPPSidebarAdapter.adaptModules([
    {path:'one.js',source:fixture}, {path:'two.js',source:fixture}
  ]), /Ambiguous/);
});

test('Split discovery does not trust an unrelated scope import', () => {
  const shared='var Scope=mk(`AppScope`);export{Scope};';
  const initial='import{Scope as AS}from "./unrelated.js";\n'+fixture
    .replace('var AS,N1','var N1').replace('AS=mk(`AppScope`),','');
  const output=parser.CodexPPSidebarAdapter.adaptModules([
    {path:'app-shared.js',source:shared},{path:'app-initial.js',source:initial}
  ]);
  assert.ok(output.missing.includes('appScopeDefinition'));
  assert.ok(output.missing.includes('appScope'));
});
