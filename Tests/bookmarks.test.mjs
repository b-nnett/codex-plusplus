import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const resource=name=>fs.readFileSync(new URL(`../Sources/CodexPPCore/Resources/${name}.js`,import.meta.url),'utf8');
function nativeFixture() {
  const support=fs.mkdtempSync(path.join(os.tmpdir(),'codexpp-bookmarks-'));
  fs.writeFileSync(path.join(support,'settings.json'),JSON.stringify({enabled:{'better-browser':true}}));
  const sent=[], broadcasts=[];
  const owner={mainFrame:{url:'app://-/index.html'},send:(_c,m)=>sent.push(m),isDestroyed:()=>false};
  const detached={mainFrame:{url:'app://-/detached-window.html'},send:(_c,m)=>broadcasts.push(m),isDestroyed:()=>false};
  const website={mainFrame:{url:'https://example.com/'},send:()=>assert.fail('Website received bookmarks'),isDestroyed:()=>false};
  const electron={webContents:{getAllWebContents:()=>[detached,website]}};
  const ctx=vm.createContext({require:n=>n==='fs'?fs:path,URL,process});
  const create=()=>vm.runInContext(resource('native-bookmarks'),ctx)(electron,support);
  let bridge=create();
  const event={sender:owner,senderFrame:owner.mainFrame};
  const send=(action,extra={})=>{bridge.handle(event,{type:'codexpp-bookmarks',requestId:'test',action,...extra});return sent.at(-1);};
  return {support,send,event,create,bridge,broadcasts,cleanup:()=>fs.rmSync(support,{recursive:true,force:true})};
}
test('Bookmarks persist full URLs, deduplicate, synchronize windows and remove only the selected URL',()=>{
  const f=nativeFixture();try {
    assert.equal(f.send('list').items.length,0);
    f.send('save',{url:'https://EXAMPLE.com/a?x=1#anchor',title:'Page A'});
    f.send('save',{url:'https://example.com/a?x=1#anchor',title:'Duplicate'});
    const saved=f.send('save',{url:'https://example.com/b',title:'Page B'});
    assert.equal(saved.items.length,2);
    assert.equal(saved.items[0].url,'https://example.com/a?x=1#anchor');
    const newMessages=[];
    f.create().handle({...f.event,sender:{...f.event.sender,send:(_c,m)=>newMessages.push(m)}},{requestId:'reload',action:'list'});
    assert.equal(newMessages[0].items.length,2);
    assert.equal(fs.statSync(path.join(f.support,'bookmarks.json')).mode&0o777,0o600);
    assert.equal(f.send('remove',{url:saved.items[0].url}).items[0].title,'Page B');
    assert.equal(f.broadcasts.at(-1).items.length,1);
  } finally {f.cleanup();}
});
test('Invalid URLs, subframes, disabled extension and corrupt storage cannot overwrite bookmarks',()=>{
  const f=nativeFixture();try {
    f.send('save',{url:'https://example.com/',title:'Example'});
    const before=fs.readFileSync(path.join(f.support,'bookmarks.json'),'utf8');
    for(const url of ['about:blank','file:///tmp/a','javascript:alert(1)','https://user:secret@example.com/']) assert.equal(f.send('save',{url,title:'Bad'}).supported,false);
    assert.equal(fs.readFileSync(path.join(f.support,'bookmarks.json'),'utf8'),before);
    assert.throws(()=>f.bridge.handle({...f.event,senderFrame:{url:'app://-/index.html'}},{requestId:'child',action:'list'}),/sender/);
    assert.throws(()=>f.bridge.handle({...f.event,senderFrame:{url:'https://example.com/'}},{requestId:'site',action:'list'}),/sender/);
    fs.writeFileSync(path.join(f.support,'settings.json'),JSON.stringify({enabled:{'better-browser':true},extensionsPaused:true}));
    assert.equal(f.send('remove',{url:'https://example.com/'}).supported,false);
    fs.writeFileSync(path.join(f.support,'settings.json'),JSON.stringify({enabled:{'better-browser':true}}));
    fs.writeFileSync(path.join(f.support,'bookmarks.json'),'broken');
    assert.equal(f.send('save',{url:'https://example.com/b',title:'B'}).supported,false);
    assert.equal(fs.readFileSync(path.join(f.support,'bookmarks.json'),'utf8'),'broken');
  } finally {f.cleanup();}
});
function renderer() {
  const callbacks=new Set(), cleanups=[];
  let items=[],next=0;
  const window={addEventListener:(_n,fn)=>callbacks.add(fn),removeEventListener:(_n,fn)=>callbacks.delete(fn)};
  const ctx=vm.createContext({window,URL,setTimeout,clearTimeout,crypto:{randomUUID:()=>String(++next)},electronBridge:{sendMessageFromView(m) {
    if(m.action==='save'&&!items.some(i=>i.url===m.url))items.push({url:m.url,title:m.title});
    if(m.action==='remove')items=items.filter(i=>i.url!==m.url);
    for(const fn of callbacks)fn({source:null,data:{type:'codexpp-bookmarks-result',requestId:m.requestId,supported:true,protocol:1,items:[...items]}});
  }}});
  vm.runInContext(resource('bookmarks-runtime'),ctx);
  const jsx=(type,props)=>({type,props});
  const React={createContext:()=>{const c={current:null};c.Provider=c;return c;},useContext:c=>c.current,
    useSyncExternalStore:(_sub,get)=>get(),Children:{toArray:x=>Array.isArray(x)?x:[x]},cloneElement:(e,p)=>({...e,props:{...e.props,...p}}),Fragment:'fragment'};
  const api=ctx.__codexPPBookmarks;
  const menu=current=>{
    const provider=api.provide(React,jsx,current,null);provider.type.current=current;
    const wrapper=api.menu(React,jsx,'item',jsx('menu',{children:[jsx('item',{children:'History'})]}));
    return wrapper.type(wrapper.props);
  };
  const section=SiteIcon=>{const e=api.section(React,jsx,u=>cleanups.push(u),jsx('section',{children:'Suggested'}),SiteIcon);return e.type(e.props);};
  return {api,menu,section,cleanups,callbacks};
}
test('Menu follows the current tab; bookmark cards precede Suggested and navigate to the full URL',async()=>{
  const f=renderer();await f.api.enable();
  const current={url:'https://example.com/deep?x=1',title:'Deep page'};
  const original=f.menu({url:''});assert.equal(original.props.children[0].props.children,'History');
  let menu=f.menu(current);assert.equal(menu.props.children[0].props.children,'Save to bookmarks');
  menu.props.children[0].props.onSelect();await new Promise(r=>setImmediate(r));
  assert.equal(f.menu(current).props.children[0].props.children,'Remove from bookmarks');
  assert.equal(f.menu({url:'https://example.com/other'}).props.children[0].props.children,'Save to bookmarks');
  const section=f.section();assert.equal(section.props.children[0].props['aria-label'],'Bookmarks');
  assert.equal(section.props.children[1].props.children,'Suggested');
  const card=section.props.children[0].props.children[1].props.children[0].props.children;
  card.props.onClick({preventDefault(){}});assert.deepEqual(f.cleanups,[current.url]);
  f.menu(current).props.children[0].props.onSelect();await new Promise(r=>setImmediate(r));
  assert.equal(f.menu(current).props.children[0].props.children,'Save to bookmarks');
  f.api.disable();assert.equal(f.callbacks.size,0);assert.equal(f.section().props.children,'Suggested');
});
test('Malformed or ambiguous renderer contracts fail before producing patches',()=>{
  const c=vm.createContext({});for(const n of ['acorn','bookmarks-adapter'])vm.runInContext(resource(n),c);
  assert.throws(()=>c.CodexPPBookmarksAdapter.adapt({'unknown.js':'throw Error("must not run")'},''),/expected one match/);
});
const parser=vm.createContext({});for(const n of ['acorn','bookmarks-adapter'])vm.runInContext(resource(n),parser);
test('Reviewed renderer discovery patches all four surfaces and rejects a second patch',{skip:!process.env.CODEXPP_BOOKMARK_MODULES},()=>{
  const dir=process.env.CODEXPP_BOOKMARK_MODULES;
  const modules=Object.fromEntries(fs.readdirSync(dir).filter(n=>/^(options-menu-view|tab-content|page-|thread-app-shell-chrome)/.test(n)).map(n=>[n,fs.readFileSync(path.join(dir,n),'utf8')]));
  const result=parser.CodexPPBookmarksAdapter.adapt(modules,resource('bookmarks-runtime'));
  assert.equal(result.patches.length,4);
  const suggested=result.patches.find(p=>p.path.startsWith('thread-app-shell-chrome-')).source;
  assert.match(suggested,/const __codexPPBookmarkSiteIcon=cs;/);
  assert.match(suggested,/__codexPPBookmarks.section\([^;]+__codexPPBookmarkSiteIcon\)/);
  const tab=result.patches.find(p=>p.path.startsWith('tab-content-')).source;
  assert.match(tab,/const __codexPPBookmarkReactFactory=V;/);
  assert.match(tab,/__codexPPBookmarks.provide\(__codexPPBookmarkReactFactory\(\),/);
  assert.doesNotMatch(tab,/__codexPPBookmarks.provide\(V\(\),/);
  assert.deepEqual(Array.from(result.report.components,c=>c.role),['menu','tab','detached','suggested']);
  assert.throws(()=>parser.CodexPPBookmarksAdapter.adapt(Object.fromEntries(result.patches.map(p=>[p.path,p.source])),''),/already/);
  assert.throws(()=>parser.CodexPPBookmarksAdapter.adapt({},''),/expected one match/);
});

test('Renderer adaptation uses the imported React factory even when a component shadows its name',()=>{
  const shared="import {react as factory} from './shared.js';";
  const modules={
    'menu.js':shared+`let React;React=factory();function Menu(p){let {onOpenHistory,onOpenBrowserSettings,onImportBrowserProfile,onCaptureScreenshot}=p;React.useRef();return JSX.jsx(Items.Item,{children:'History'});}`,
    'tab.js':shared+`function Tab(p){let {browserTabId,conversationId,renderSlots,isVisible,onToggleFloatingComposer}=p;let factory=()=>{throw Error('Called the local setter')};let current={url:'https://example.com/',tabType:'web',securityState:null};current.url;current.tabType;current.securityState;return JSX.jsx('div',{});}`,
    'detached.js':shared+`function Detached(p){let {browserTabId,conversationId,snapshot,browserToolbarCapabilities,settingsButton,requestToolbarSourceAction}=p;return JSX.jsx('div',{});}`,
    'suggested.js':shared+`function Icon(p){let {site}=p;return JSX.jsx('img',{src:site.faviconDataURL});}function Suggested(p){let {onNavigate}=p;return JSX.jsx('section',{id:'threadWorkspace.newTab.suggested.heading'});}`
  };
  const patched=parser.CodexPPBookmarksAdapter.adapt(modules,'').patches.find(p=>p.path==='tab.js').source;
  const React={},ctx=vm.createContext({factory:()=>React,JSX:{jsx:()=>({})},__codexPPBookmarks:{provide:(react,_jsx,current)=>({react,current})}});
  vm.runInContext(patched.replace(shared,''),ctx);
  const result=ctx.Tab({});assert.equal(result.react,React);assert.equal(result.current.url,'https://example.com/');
});

test('Existing bookmark cards use the native site icon with a star fallback and their complete URL',async()=>{
  const f=renderer();await f.api.enable();
  const current={url:'https://example.com/deep?x=1#section',title:'Existing saved page'};
  f.menu(current).props.children[0].props.onSelect();await new Promise(r=>setImmediate(r));
  const SiteIcon=()=>{};
  const card=f.section(SiteIcon).props.children[0].props.children[1].props.children[0].props.children;
  const icon=card.props.children[0].props.children;
  assert.equal(icon.type,SiteIcon);
  assert.equal(icon.props.site.url,current.url);
  assert.equal(icon.props.site.title,current.title);
  assert.match(icon.props.site.faviconDataURL,/^data:image\/svg\+xml,/);
  assert.equal(f.section().props.children[0].props.children[1].props.children[0].props.children.props.children[0].props.children,'☆');
  f.api.disable();
});
