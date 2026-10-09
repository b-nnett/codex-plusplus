import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const directory=process.env.CODEXPP_ADAPTER_OUTPUT;
const vendorDirectory=process.env.CODEXPP_VENDOR_SOURCE;
// Optional integration check runs the reviewed app's actual compiled search and command components.
function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`missing ${name}`);
  const end=source.indexOf('function ',start+9);
  return source.slice(start,end<0?source.length:end).replace(/var [^;]*;$/, '').split('\nimport')[0];
}
test('Reviewed native Settings search and Cmd-K entries find and open Extensions',{skip:!directory||!vendorDirectory},()=>{
  const page=readFileSync(join(directory,'settings-page-3d4f7a87f05b.js'),'utf8');
  const components=readFileSync(join(directory,'app-initial-c468e3fd7f91.js'),'utf8');
  const navigation=readFileSync(join(directory,'use-visible-settings-sections-71b359348d48.js'),'utf8');
  const command=readFileSync(join(vendorDirectory,'settings-command-menu-section-items-b0e78e2fb818.js'),'utf8');
  const selected=[];
  const context=vm.createContext({
    q:{c:()=>Array(30).fill(Symbol.for('react.memo_cache_sentinel'))},
    J:{jsx:(type,props)=>({type,props})},F:'native-command-item',
    _:()=>({formatMessage:message=>message.defaultMessage}),
    r:()=>({}),i:{},x:()=>({platform:'mac'}),a:()=>({jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}),
    b:()=>{}, sr:new WeakMap(), or:{default:values=>values.reduce((a,b)=>a+b,0)},
    It:(label,query)=>label.toLowerCase().includes(query.toLowerCase())?1:0,
    On:()=>{},Tt:{},A6:{'local-environments':{defaultMessage:'Environments'}},
  });
  for(const [source,name] of [[components,'k6'],[navigation,'la'],[navigation,'ppExtensionIcon']])vm.runInContext(functionSource(source,name),context);
  vm.runInContext('D=k6;B=la;et=k6;',context);
  vm.runInContext(functionSource(command,'K'),context);
  context.onNavigate=path=>selected.push(path);
  const item=vm.runInContext('K({section:{slug:"codexpp-extensions"},close:()=>{},onNavigate})',context);
  assert.equal(item.type,'native-command-item');
  assert.equal(item.props.title,'Extensions');
  assert.equal(item.props.value,'settings Extensions');
  assert.equal(typeof item.props.LeftIcon,'function');
  item.props.onSelect();
  assert.deepEqual(selected,['/settings/codexpp-extensions']);
  for(const name of ['Qn','$n','er','tr','nr','rr','ir','ar'])vm.runInContext(functionSource(page,name),context);
  const result=vm.runInContext('Qn({intl:{messages:{},formatMessage:message=>message.defaultMessage},query:"Extensions",targets:[{sectionSlug:"codexpp-extensions",messages:[],terms:["Codex++","Install Extension","Open in Finder"]}],visibleSectionSlugs:["codexpp-extensions"]})',context);
  assert.equal(result[0].sectionSlug,'codexpp-extensions');
  assert.equal(result[0].panelLabel,'Codex++');
  const aliases=vm.runInContext('Qn({intl:{messages:{},formatMessage:message=>message.defaultMessage},query:"Codex++",targets:[{sectionSlug:"codexpp-extensions",messages:[],terms:["Codex++"]}],visibleSectionSlugs:["codexpp-extensions"]})',context);
  assert.equal(aliases[0].sectionSlug,'codexpp-extensions');
});

test('The actual Settings route hands valid native component bindings to the Extensions render',{skip:!directory},()=>{
  const page=readFileSync(join(directory,'settings-page-3d4f7a87f05b.js'),'utf8');
  const runtime=readFileSync(new URL('../Sources/CodexPP/Resources/native-settings.js',import.meta.url),'utf8');
  const makeElement=(type,props,...children)=>{
    assert.ok(typeof type==='string'||typeof type==='function'||typeof type==='symbol',`Invalid React component: ${String(type)}`);
    return {type,props:props??{},children};
  };
  const React={createElement:makeElement,Fragment:Symbol('Fragment'),Suspense:()=>{},useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:()=>{},useEffectEvent:callback=>callback,useSyncExternalStore:(subscribe,get)=>get()};
  const jsx={jsx:(type,props)=>makeElement(type,props,props?.children),jsxs:(type,props)=>makeElement(type,props,...props?.children??[]),Fragment:React.Fragment};
  const bindings={};
  // Resolve the adapter's imports in the same scope as the compiled Settings function.
  // The native host hooks are fixture values; its route function and our page are unmodified.
  for(const match of page.matchAll(/import\{([^}]+)\}from["']([^"']+)["']/g)){
    for(const specifier of match[1].split(',')){
      const parts=specifier.trim().split(/\s+as\s+/);
      bindings[parts.at(-1)]=function NativeComponent(){};
    }
  }
  const Section=bindings.ppNativeSection;
  Section.Header=function NativeHeader(){};
  Section.Content=function NativeContent(){};
  Object.assign(bindings,{
    Er:function NativeSidebar(){},ci:{c:()=>Array(138).fill(Symbol.for('react.memo_cache_sentinel'))},li:React,$:jsx,
    window:{location:{href:'app://-/settings/codexpp-extensions'},history:{state:null}},
    document:{querySelectorAll:()=>[]},
    ee:()=>({get:()=>null,set:()=>{}}),c:()=>({size:0}),ye:()=>({formatMessage:message=>message?.defaultMessage??''}),
    ae:()=>()=>{},l:()=>({pathname:'/settings/codexpp-extensions',search:'',hash:'',state:null,key:'extensions'}),
    yt:()=>({connectedRemoteConnections:[],selectedHostId:'local',setSelectedHostId:()=>{}}),
    He:path=>path==='/settings/:section/*'?{params:{section:'codexpp-extensions'}}:null,
    ne:()=>({kind:'local'}),mn:()=>({activeSettingsSection:'general-settings',settingsNavigationSections:[{slug:'general-settings'},{slug:'codexpp-extensions'}],visibleSettingsSections:[{slug:'general-settings'},{slug:'codexpp-extensions'}],shouldRenderRouteContent:true,shouldRedirectToVisibleSettingsSection:false}),
    ie:()=> 'slate',wn:()=>false,lr:slug=>({sectionSlug:slug}),ii:()=>false,
  });
  const context=vm.createContext(bindings);
  vm.runInContext(runtime,context);
  const registry=context.__codexPPNativeSettings;
  let supplied;
  const render=registry.render;
  registry.render=(react,value,components)=>{
    supplied=components;
    const element=render(react,value,components);
    const tree=element.type(element.props);
    assert.equal(tree.type,components.Page);
    return tree;
  };
  const broken=functionSource(page,'ri').replace('Button:ppNativeButton','Button:u');
  vm.runInContext(broken,context);
  assert.throws(()=>vm.runInContext('ri()',context),/Invalid React component: \[object Object\]/);
  vm.runInContext(functionSource(page,'ri'),context);
  vm.runInContext('ri()',context);
  assert.equal(supplied.Button,bindings.ppNativeButton);
  assert.equal(typeof supplied.Button,'function');
  assert.equal(supplied.Page,bindings.ppNativePage);
  assert.equal(supplied.Title,bindings.ppNativeTitle);
});

test('The native title component renders Extensions instead of falling through its slug switch',{skip:!directory},()=>{
  const components=readFileSync(join(directory,'app-initial-c468e3fd7f91.js'),'utf8');
  const context=vm.createContext({vNs:{c:()=>Array(61).fill(Symbol.for('react.memo_cache_sentinel'))},j6:{jsx:(type,props)=>({type,props})},$:function NativeMessage(){}});
  vm.runInContext(functionSource(components,'k6'),context);
  vm.runInContext(functionSource(components,'_Ns'),context);
  const title=vm.runInContext('_Ns({slug:"codexpp-extensions"})',context);
  assert.equal(title.props.defaultMessage,'Extensions');
  assert.equal(title.props.id,'codexpp.settings.extensions.title');
});

test('Shared section registration survives the native search visibility filter',{skip:!directory},()=>{
  const navigation=readFileSync(join(directory,'use-visible-settings-sections-71b359348d48.js'),'utf8');
  const page=readFileSync(join(directory,'settings-page-3d4f7a87f05b.js'),'utf8');
  const descriptor=navigation.match(/const ppExtensionsSection=([^;]+);/);
  assert.ok(descriptor);
  const visible=navigation.match(/visibleSettingsSections:(\[[^\]]+\]),activeSettingsSection/);
  const sidebar=navigation.match(/settingsNavigationSections:(\[[^\]]+\]),showEnterpriseUsageLabel/);
  assert.ok(visible);assert.ok(sidebar);
  const filter=page.match(/t=e=>(e.slug===`cloud-settings`[^;]+?),e\[99\]/);
  assert.ok(filter);
  const context=vm.createContext({J:[{slug:'general-settings'}],Bt:[]});
  vm.runInContext(`const ppExtensionsSection=${descriptor[1]};const C=${sidebar[1]},D=${visible[1]};`,context);
  const slugs=vm.runInContext(`D.filter(e=>${filter[1]}).map(e=>e.slug)`,context);
  assert.ok(slugs.includes('codexpp-extensions'));
  assert.equal(vm.runInContext('C.find(e=>e.slug==="codexpp-extensions")===D.find(e=>e.slug==="codexpp-extensions")',context),true);
});
