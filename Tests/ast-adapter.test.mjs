import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx=vm.createContext({});
for(const name of ['acorn','settings-adapter'])vm.runInContext(readFileSync(new URL(`../Sources/CodexPPCore/Resources/${name}.js`,import.meta.url),'utf8'),ctx);
const vendor=process.env.CODEXPP_VENDOR_SOURCE;
const names=['settings-page-3d4f7a87f05b.js','use-visible-settings-sections-71b359348d48.js','app-initial-c468e3fd7f91.js','app-shared-2f2228189a8d.js','general-settings-1acdfc89481a.js','general-settings-4f37c778160b.js'];
const input=()=>Object.fromEntries(names.map(name=>['webview/assets/'+name,readFileSync(vendor+'/'+name,'utf8')]));
const adapt=modules=>ctx.CodexPPSettingsAdapter.adapt({modules,runtime:''});
function walk(node,visitor,parent){if(!node||typeof node.type!=='string')return;visitor(node,parent);for(const item of Object.values(node)){if(Array.isArray(item))for(const child of item)walk(child,visitor,node);else if(item&&typeof item.type==='string')walk(item,visitor,node);}}
function rewrite(source,edits){const chunks=[];let cursor=0;for(const [start,edit] of [...edits].sort((a,b)=>a[0]-b[0])){chunks.push(source.slice(cursor,start),edit.text);cursor=edit.end;}chunks.push(source.slice(cursor));return chunks.join('');}

test('Parser is bundled and rejects invalid JavaScript without evaluating it',()=>{
  assert.equal(ctx.acorn.version,'8.15.0');
  assert.throws(()=>adapt({'webview/assets/settings-page.js':'invalid {'}));
  assert.throws(()=>adapt({'webview/assets/settings-page.js':'throw Error("must not execute");'}),/SettingsPage/);
});
test('Discovery follows the current native Settings graph',{skip:!vendor},()=>{
  const result=adapt(input());
  assert.equal(result.patches.length,3);
  assert.deepEqual(Object.keys(result.report.components).sort(),['Button','Card','Page','Row','Section','Title','Toggle']);
  assert.equal(result.report.components.Button.binding,'r5');
  for(const patch of result.patches)ctx.acorn.parse(patch.source,{ecmaVersion:'latest',sourceType:'module'});
});
test('Renamed bundles, export aliases, local symbols and cache indexes retain discovery',{skip:!vendor},()=>{
  const original=input();
  const paths=new Map(Object.keys(original).map((path,index)=>[path,path.replace(/-[^-]+\.js$/,`-fixture${index}.js`)]));
  const altered={};
  for(const [path,source] of Object.entries(original)){
    const ast=ctx.acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=new Map();
    walk(ast,(node,parent)=>{
      if(node.type==='Identifier'){
        const skip=((parent?.type==='MethodDefinition'||parent?.type==='PropertyDefinition')&&parent.key===node&&!parent.computed)||(parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed)||(parent?.type==='Property'&&parent.key===node&&!parent.computed&&!parent.shorthand);
        if(skip)return;
        if(parent?.type==='ExportSpecifier'&&parent.exported===node){if(['SettingsPage','GeneralSettings'].includes(node.name))return;edits.set(node.start,{end:node.end,text:'export_'+node.name});return;}
        if(parent?.type==='ImportSpecifier'&&parent.imported===node){edits.set(node.start,{end:node.end,text:'export_'+node.name});return;}
        const text=parent?.type==='Property'&&parent.shorthand?node.name+':renamed_'+node.name:'renamed_'+node.name;
        edits.set(node.start,{end:node.end,text});
      }
      if(node.type==='Literal'&&typeof node.value==='number'&&parent?.type==='MemberExpression'&&parent.property===node&&parent.computed)edits.set(node.start,{end:node.end,text:String(node.value+200)});
      if(node.type==='ImportDeclaration'){
        const target='webview/assets/'+node.source.value.slice(2);
        if(paths.has(target))edits.set(node.source.start,{end:node.source.end,text:JSON.stringify('./'+paths.get(target).split('/').at(-1))});
      }
    });
    altered[paths.get(path)]=rewrite(source,edits);
  }
  const result=adapt(altered);
  assert.equal(result.report.components.Button.binding,'renamed_r5');
  for(const c of Object.values(result.report.components)){assert.ok(c.binding.startsWith('renamed_'));assert.ok(c.path.includes('fixture'));}
  assert.equal(result.report.page.binding,'renamed_ri');
});
test('Missing or ambiguous Settings exports fail closed',{skip:!vendor},()=>{
  const modules=input();
  const page=Object.keys(modules).find(path=>path.includes('/settings-page-'));
  assert.throws(()=>adapt({...modules,[page]:modules[page].replace('as SettingsPage','as NotSettingsPage')}),/SettingsPage/);
  assert.throws(()=>adapt({...modules,'webview/assets/settings-page-duplicate.js':modules[page]}),/expected one match/);
});
