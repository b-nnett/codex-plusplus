import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../Sources/CodexPP/Resources/native-settings.js', import.meta.url), 'utf8');
function fixture(value) {
  const commands = [];
  const context = vm.createContext({document:{querySelectorAll:()=>[]}, __codexPPBridge:{request:async(action,extra)=>{commands.push({action,...extra});return value;}}});
  vm.runInContext(source, context);
  const React = {createElement:(type,props,...children)=>({type,props:props??{},children}),useState:initial=>[initial,()=>{}],useEffect:()=>{},Fragment:Symbol('Fragment')};
  const components = Object.fromEntries(['Page','Title','Section','Card','Row','Toggle','Button'].map(name=>[name,function NativeComponent(){}]));
  components.Section.Header=function NativeHeader(){};
  components.Section.Content=function NativeContent(){};
  const element = context.__codexPPNativeSettings.render(React,value,components);
  const tree = element.type(element.props);
  const all = [];
  function visit(node) { if(!node || typeof node!=='object')return; all.push(node); for(const child of node.children??[])visit(child); if(typeof node.props?.control==='object')visit(node.props.control); }
  visit(tree);
  return {tree,all,components,React,commands};
}
const value = {extensionsPaused:false,intent:0,extensions:[{id:'demo',name:'Demo',description:'A renderer extension',enabled:true}]};
test('Extensions uses the supplied native page, title, section, rows and controls',()=>{
  const {tree,all,components}=fixture(value);
  assert.equal(tree.type,components.Page);
  assert.equal(tree.props.title.type,components.Title);
  assert.equal(tree.props.title.props.slug,'codexpp-extensions');
  for(const type of ['Section','Card','Row','Button'])assert.ok(all.some(node=>node.type===components[type]));
  assert.ok(all.every(node=>!['h1','button','input'].includes(node.type)));
  assert.ok(all.every(node=>node.props.style===undefined));
});
test('Native switches and buttons dispatch the authenticated extension actions',async()=>{
  const {all,components,React,commands}=fixture(value);
  const enabled=all.find(node=>node.type===components.Row&&node.props.label==='Enable Extensions');
  const switchNode=enabled.props.control({'aria-labelledby':'enable-label'});
  assert.equal(switchNode.type,components.Toggle);
  assert.equal(switchNode.props['aria-labelledby'],'enable-label');
  assert.equal(switchNode.props.checked,true);
  await switchNode.props.onChange(false);
  const extension=all.find(node=>node.type===components.Row&&node.props.label==='Demo');
  const controls=extension.props.control({'aria-labelledby':'demo-label'});
  assert.equal(controls.type,React.Fragment);
  await controls.children[1].props.onChange(false);
  await controls.children[0].props.onClick();
  await all.find(node=>node.type===components.Button&&node.children[0]==='Install…').props.onClick();
  await all.find(node=>node.type===components.Button&&node.children[0]==='Open in Finder').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(commands)),[{action:'pause'},{action:'set-enabled',extensionId:'demo',enabled:false},{action:'remove',extensionId:'demo'},{action:'install'},{action:'folder'}]);
});
test('The paused state uses the native switch to resume',async()=>{
  const {all,components,commands}=fixture({...value,extensionsPaused:true});
  const row=all.find(node=>node.type===components.Row&&node.props.label==='Enable Extensions');
  const toggle=row.props.control({});
  assert.equal(toggle.props.checked,false);
  await toggle.props.onChange(true);
  assert.equal(commands[0].action,'resume');
});
