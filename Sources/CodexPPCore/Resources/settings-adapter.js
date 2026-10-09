/* Codex++ Settings adapter. Parse vendor code as data; never evaluate it. */
(function (global) {
  'use strict';
  const slug = 'codexpp-extensions';
  function fail(message) { throw Error('Settings compatibility: ' + message); }
  function one(values, label) { const unique = [...new Set(values)]; if (unique.length !== 1) fail(`${label}: expected one match, found ${unique.length}`); return unique[0]; }
  function key(node) { return node?.type === 'Identifier' ? node.name : value(node); }
  function value(node) { if (node?.type === 'Literal') return node.value; if (node?.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked; }
  function properties(node) { return new Map((node?.properties || []).filter(p => p.type === 'Property').map(p => [key(p.key), p])); }
  function has(node, ...names) { const p = properties(node); return names.every(name => p.has(name)); }
  function member(node, name) { return node?.type === 'MemberExpression' && key(node.property) === name; }
  function callee(node) { const n = node?.callee; return n?.type === 'SequenceExpression' ? n.expressions.at(-1) : n; }
  function jsx(node) { return node.type === 'CallExpression' && (member(callee(node), 'jsx') || member(callee(node), 'jsxs')) && node.arguments[1]?.type === 'ObjectExpression'; }
  function normalize(from, relative) { if (!relative.startsWith('.')) fail('external module in native component graph'); const parts = from.split('/'); parts.pop(); for (const part of relative.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); } return parts.join('/'); }
  class Module {
    constructor(path, source) {
      global.__ppTrace?.('parse '+path);this.path = path; this.source = source; this.ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});global.__ppTrace?.('index '+path);
      this.nodes = []; this.parents = new Map(); this.imports = new Map(); this.exports = new Map(); this.functions = new Map(); this.edits = [];
      const visit = (node, parent) => { if (!node || typeof node.type !== 'string') return; this.nodes.push(node); this.parents.set(node, parent); for (const name of Object.keys(node)) { const item = node[name]; if (Array.isArray(item)) { for (const child of item) visit(child, node); } else if (item && typeof item.type === 'string') visit(item, node); } };
      visit(this.ast, null);
      this.byStart=this.nodes.slice().sort((a,b)=>a.start-b.start||b.end-a.end);
      for (const node of this.ast.body) {
        if (node.type === 'FunctionDeclaration') this.functions.set(node.id.name, node);
        if (node.type === 'ImportDeclaration') for (const spec of node.specifiers) { if (spec.type !== 'ImportSpecifier') continue; this.imports.set(spec.local.name, {path:normalize(path,node.source.value), exported:key(spec.imported)}); }
        if (node.type === 'ExportNamedDeclaration') for (const spec of node.specifiers) this.exports.set(key(spec.exported), spec.local.name);
      }
    }
    text(node) { return this.source.slice(node.start, node.end); }
    inside(node, predicate) { let lo=0,hi=this.byStart.length;while(lo<hi){const mid=(lo+hi)>>>1;if(this.byStart[mid].start<node.start)lo=mid+1;else hi=mid;}const result=[];for(let i=lo;i<this.byStart.length&&this.byStart[i].start<=node.end;i++){const n=this.byStart[i];if(n.end<=node.end&&predicate(n))result.push(n);}return result; }
    owner(node) { for (let n = node; n; n = this.parents.get(n)) if (n.type === 'FunctionDeclaration' && this.functions.get(n.id.name) === n) return n; }
    statement(node, fn) { return one(fn.body.body.filter(n => n.start <= node.start && n.end >= node.end), 'containing route statement'); }
    edit(node, text) { this.edits.push({start:node.start,end:node.end,text}); }
    insert(position, text) { this.edits.push({start:position,end:position,text}); }
    result(prefix = '') {
      let source = this.source, previous = Infinity;
      for (const edit of this.edits.sort((a,b) => b.start-a.start || b.end-a.end)) {
        if (edit.end > previous) fail('overlapping AST edits in ' + this.path);
        source = source.slice(0,edit.start) + edit.text + source.slice(edit.end); previous = edit.start;
      }
      source = prefix + source;
      acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
      return source;
    }
  }
  function adapt(input) {
    const modules = new Map(Object.entries(input.modules).map(([path, source]) => [path, new Module(path, source)]));
    const reserved=new Set(['ppExtensionsSection','ppExtensionIcon']);
    for(const m of modules.values())if(m.nodes.some(n=>n.type==='Identifier'&&(reserved.has(n.name)||n.name.startsWith('ppNative'))))fail('reserved adapter binding collision in '+m.path);
    global.__ppTrace?.('resolve Settings components');
    function resolve(module, local) { const imported = module.imports.get(local); if (!imported) return {module,local}; const target = modules.get(imported.path); if (!target) fail('native dependency is missing: ' + imported.path); return resolve(target, one([target.exports.get(imported.exported)].filter(Boolean),'export '+imported.exported)); }
    function exported(name) { return one([...modules.values()].filter(m => m.exports.has(name)), 'module exporting '+name); }
    function component(module, local) { if (typeof local !== 'string') fail('component is not a named binding'); const result=resolve(module,local); result.id=result.module.path+':'+result.local; return result; }
    function uniqueComponents(list,label) { const ids = new Map(list.map(c=>[c.id,c])); return one([...ids.values()],label+' ['+[...ids.keys()].join(', ')+']'); }
    function fromJSX(module,node) { const target=node.arguments[0]; if (target.type !== 'Identifier') fail('unsupported component call'); return component(module,target.name); }
    function shape(c,...props) { const fn=c.module.functions.get(c.local); return !!fn && c.module.inside(fn,n=>n.type==='ObjectPattern'&&has(n,...props)).length>0; }
    function initializer(c) {
      const m=c.module, fn=m.functions.get(c.local);
      let target=c.local;
      if (fn) {
        const cache=one(m.inside(fn,n=>n.type==='CallExpression'&&member(callee(n),'c')).map(n=>callee(n).object.name),'component memo runtime');
        target=cache;
      }
      const owner=one(m.nodes.filter(n=>n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&n.left.name===target).map(n=>m.owner(n)).filter(Boolean),'component initializer');
      return one([...m.exports].filter(([,local])=>local===owner.id.name).map(([name])=>name),'exported component initializer');
    }
    const pageModule=exported('SettingsPage'), page=resolve(pageModule,pageModule.exports.get('SettingsPage'));
    const generalEntry=exported('GeneralSettings'), general=resolve(generalEntry,generalEntry.exports.get('GeneralSettings'));
    const gm=general.module, gf=gm.functions.get(general.local), pm=page.module, pf=pm.functions.get(page.local);
    if (!gf || !pf) fail('Settings exports are not functions');
    if(pm.inside(pf,n=>n.type==='Identifier'&&['pp','ppSnapshot','ppRoute'].includes(n.name)).length)fail('reserved binding collision in Settings page');
    const calls=gm.nodes.filter(jsx);
    const pageComponent=uniqueComponents(gm.inside(gf,n=>jsx(n)&&has(n.arguments[1],'title','children')).map(n=>fromJSX(gm,n)),'Settings page component');
    const titleComponent=uniqueComponents(gm.inside(gf,n=>jsx(n)&&value(properties(n.arguments[1]).get('slug')?.value)==='general-settings').map(n=>fromJSX(gm,n)),'Settings title component');
    const groupCalls=calls.filter(n=>member(n.arguments[0],'Header')&&n.arguments[0].object.type==='Identifier');
    const section=uniqueComponents(groupCalls.map(n=>component(gm,n.arguments[0].object.name)),'Settings section component');
    const sectionAliases=[...new Set(groupCalls.map(n=>n.arguments[0].object.name))];
    const card=uniqueComponents(calls.filter(n=>member(n.arguments[0],'Content')&&sectionAliases.includes(n.arguments[0].object.name)).map(n=>properties(n.arguments[1]).get('children')?.value).filter(n=>n&&jsx(n)&&n.arguments[0].type==='Identifier'&&gm.imports.has(n.arguments[0].name)).map(n=>fromJSX(gm,n)),'Settings card component');
    const row=uniqueComponents(calls.filter(n=>has(n.arguments[1],'label','control')&&n.arguments[0].type==='Identifier'&&gm.imports.has(n.arguments[0].name)).map(n=>fromJSX(gm,n)).filter(c=>shape(c,'label','control','controlSizing','layout')),'Settings row component');
    const toggle=uniqueComponents(calls.filter(n=>has(n.arguments[1],'checked','onChange','ariaLabel')&&n.arguments[0].type==='Identifier'&&gm.imports.has(n.arguments[0].name)).map(n=>fromJSX(gm,n)),'Settings toggle component');
    const button=uniqueComponents(pm.nodes.filter(n=>jsx(n)&&has(n.arguments[1],'color','onClick','size','aria-label')&&pm.inside(properties(n.arguments[1]).get('aria-label').value,n=>value(n)==='settings.teams.nav.createLabel').length).map(n=>fromJSX(pm,n)),'Settings button component');
    const roles={Page:pageComponent,Title:titleComponent,Section:section,Card:card,Row:row,Toggle:toggle,Button:button};
    let imports='';
    function importBinding(c,alias,init=true) {
      const exportedName=one([...c.module.exports].filter(([,local])=>local===c.local).map(([name])=>name),'native component export');
      const relative='./'+c.module.path.split('/').at(-1);
      imports+=`import{${exportedName} as ${alias}${init?','+initializer(c)+' as '+alias+'Init':''}}from${JSON.stringify(relative)};\n`;
    }
    for (const [role,c] of Object.entries(roles)) importBinding(c,'ppNative'+role);
    const roleInit=Object.keys(roles).map(role=>'ppNative'+role+'Init();').join('');
    const react=one(pm.inside(pf,n=>n.type==='CallExpression'&&member(callee(n),'useRef')).map(n=>callee(n).object.name),'Settings React instance');
    pm.insert(pf.body.start+1,`${roleInit}const pp=globalThis.__codexPPNativeSettings;const ppSnapshot=${react}.useSyncExternalStore(pp.subscribe,pp.getSnapshot);`);
    const visibility=one(pm.inside(pf,n=>n.type==='VariableDeclarator'&&n.id.type==='ObjectPattern'&&has(n.id,'activeSettingsSection','visibleSettingsSections','settingsNavigationSections','shouldRedirectToVisibleSettingsSection')),'Settings visibility hook');
    const visible=properties(visibility.id), redirect=visible.get('shouldRedirectToVisibleSettingsSection').value.name;
    const routeArgument=visibility.init.arguments[0];
    const routeName=one(pm.inside(routeArgument,n=>n.type==='BinaryExpression'&&value(n.right)==='time-management').map(n=>n.left.name),'route argument');
    const routeBinding=one(pm.inside(pf,n=>n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.id.name===routeName),'route binding');
    pm.insert(pm.statement(routeBinding,pf).start,`const ppRoute=(${pm.text(routeBinding.init)})===${JSON.stringify(slug)};`);
    pm.edit(routeBinding.init,`ppRoute?'general-settings':(${pm.text(routeBinding.init)})`);
    const navigation=one(pm.inside(pf,n=>n.type==='CallExpression'&&n.callee.type==='Identifier'&&has(n.arguments[0],'pathname')&&pm.inside(n.arguments[0],n=>n.type==='TemplateLiteral'&&n.quasis.some(q=>q.value.cooked.startsWith('/settings/teams/'))).length).map(n=>n.callee.name),'native router navigation');
    const contentCall=one(pm.inside(pf,n=>jsx(n)&&has(n.arguments[1],'navigationKey','slateLayout','targetId','targetText','children')),'Settings content context');
    const content=properties(contentCall.arguments[1]).get('children').value;
    if(content.type!=='Identifier')fail('Settings content is not a local binding');
    const redirectIf=one(pf.body.body.filter(n=>n.type==='IfStatement'&&(n.test.type==='Identifier'?n.test:n.test.type==='SequenceExpression'?n.test.expressions.at(-1):null)?.name===redirect),'native visibility redirect');
    const redirectTest=redirectIf.test.type==='SequenceExpression'?redirectIf.test.expressions.at(-1):redirectIf.test;
    pm.edit(redirectTest,`${redirect}&&!ppRoute`);
    const roleObject=Object.keys(roles).map(role=>`${role}:ppNative${role}`).join(',');
    pm.insert(redirectIf.start,`${react}.useEffect(()=>pp.attachNavigate(path=>${navigation}(path)),[${navigation}]);if(ppRoute)${content.name}=pp.render(${react},ppSnapshot,{${roleObject}});`);
    const sidebarCall=one(pm.inside(pf,n=>jsx(n)&&has(n.arguments[1],'searchableSections','activeSection','settingsSections')),'Settings sidebar component');
    const active=properties(sidebarCall.arguments[1]).get('activeSection').value;
    const activeBinding=one(pm.inside(pf,n=>n.type==='VariableDeclarator'&&n.id.name===active.name),'sidebar selection binding');
    pm.edit(activeBinding.init,`ppRoute?${JSON.stringify(slug)}:(${pm.text(activeBinding.init)})`);
    // Register the sidebar item using the app's existing component and callbacks.
    const sidebarMap=one(pm.nodes.filter(n=>n.type==='CallExpression'&&member(n.callee,'map')&&member(n.callee.object,'sections')&&n.arguments[0]?.body?.type==='BlockStatement'),'native sidebar sections map');
    const callback=sidebarMap.arguments[0], sidebarFn=pm.owner(sidebarMap);
    const sidebarProps=one(pm.inside(sidebarFn,n=>n.type==='ObjectPattern'&&has(n,'activeSection','onSelect','settingsSections')),'native sidebar props');
    const sp=properties(sidebarProps), item=callback.params[0].name;
    const itemCalls=pm.inside(callback,n=>jsx(n)&&has(n.arguments[1],'data-settings-panel-slug','isActive','onClick'));
    const sidebarItem=uniqueComponents(itemCalls.filter(n=>n.arguments[0].type==='Identifier').map(n=>fromJSX(pm,n)),'native sidebar item');
    importBinding(sidebarItem,'ppNativeSidebarItem',false);
    const jsxNamespace=one(itemCalls.map(n=>callee(n).object.name),'sidebar JSX runtime');
    pm.insert(callback.body.start+1,`if(${item}.slug===${JSON.stringify(slug)})return ${jsxNamespace}.jsx(ppNativeSidebarItem,{'data-settings-panel-slug':${item}.slug,isActive:${sp.get('activeSection').value.name}===${item}.slug,label:'Extensions',weightClassName:'font-normal',onClick:()=>${sp.get('onSelect').value.name}(${item}.slug),icon:globalThis.__codexPPNativeSettings.icon(${jsxNamespace})},${item}.slug);`);
    const groups=one(pm.nodes.filter(n=>n.type==='ArrayExpression'&&n.elements.some(n=>n?.type==='ObjectExpression'&&value(properties(n).get('key')?.value)==='personal')&&n.elements.some(n=>n?.type==='ObjectExpression'&&value(properties(n).get('key')?.value)==='coding')),'native Settings groups');
    pm.insert(groups.end-1,`,{key:'codexpp',heading:{id:'codexpp.settings.heading',defaultMessage:'Codex++'},slugs:[${JSON.stringify(slug)}]}`);
    const targets=one(pm.nodes.filter(n=>n.type==='ObjectExpression'&&has(n,'messages','sectionSlug')&&properties(n).get('sectionSlug').value.type==='Identifier'),'Settings search target');
    const targetFn=pm.owner(targets);
    const targetReturn=one(pm.inside(targetFn,n=>n.type==='ReturnStatement'&&pm.parents.get(n)===targetFn.body),'search target return');
    pm.edit(targetReturn.argument,`(${pm.text(targetReturn.argument)}).concat([{sectionSlug:${JSON.stringify(slug)},messages:[],terms:['Codex++','Extensions','Install Extension','Pause Extensions','Resume Extensions','Open in Finder']}])`);
    const searchResult=one(pm.nodes.filter(n=>n.type==='ObjectExpression'&&has(n,'path','label','panelLabel','sectionSlug')&&pm.owner(n)?.params.some(p=>p.type==='ObjectPattern'&&has(p,'visibleSectionSlugs'))),'Settings search result');
    const sr=properties(searchResult), label=sr.get('panelLabel').value;
    pm.edit(label,`${pm.text(sr.get('sectionSlug').value)}===${JSON.stringify(slug)}?'Codex++':(${pm.text(label)})`);
    // Shared visibility registration: both arrays must contain the same descriptor.
    const navModule=one([...modules.values()].filter(m=>m.nodes.some(n=>n.type==='ObjectExpression'&&has(n,'visibleSettingsSections','settingsNavigationSections','shouldRenderRouteContent','activeSettingsSection'))),'visibility module');
    const visibilityResult=one(navModule.nodes.filter(n=>n.type==='ObjectExpression'&&has(n,'visibleSettingsSections','settingsNavigationSections','shouldRenderRouteContent','activeSettingsSection')),'visibility result');
    for(const name of ['visibleSettingsSections','settingsNavigationSections']){
      const expression=properties(visibilityResult).get(name).value;
      navModule.edit(expression,`[...(${navModule.text(expression)}),ppExtensionsSection]`);
    }
    const iconGetter=one([...navModule.functions.values()].filter(fn=>navModule.inside(fn,n=>n.type==='ReturnStatement'&&navModule.inside(n,n=>n.type==='MemberExpression'&&n.computed&&n.property.type==='Identifier'&&fn.params[0]?.name===n.property.name).length&&navModule.inside(n,n=>value(n)==='cloud-environments').length).length),'native section icon getter');
    navModule.insert(iconGetter.body.start+1,`if(${iconGetter.params[0].name}===${JSON.stringify(slug)})return{component:ppExtensionIcon};`);
    return finish();
    function finish() {
      // JSX runtime factory is identified from the existing icon's initializer.
      const existingIcon=one(navModule.inside(iconGetter,n=>n.type==='ObjectExpression'&&has(n,'component')).map(n=>properties(n).get('component').value).filter(n=>n.type==='Identifier'),'existing section icon');
      const iconInit=one(navModule.nodes.filter(n=>n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&n.left.name===existingIcon.name).map(n=>navModule.owner(n)).filter(Boolean),'section icon initializer');
      const runtimeAssignment=one(navModule.inside(iconInit,n=>n.type==='AssignmentExpression'&&n.right.type==='CallExpression'&&n.right.callee.type==='Identifier'&&navModule.imports.has(n.right.callee.name)&&navModule.inside(iconInit,call=>call.type==='CallExpression'&&member(callee(call),'jsx')&&callee(call).object.name===n.left.name).length),'icon JSX runtime');
      const factory=runtimeAssignment.right.callee.name;
      const prefix=`const ppExtensionsSection={slug:${JSON.stringify(slug)}};function ppExtensionIcon(props){const jsx=${factory}();return jsx.jsxs('svg',{viewBox:'0 0 16 16',width:20,height:20,fill:'currentColor','aria-hidden':true,...props,children:[[1,9,6],[9,9,6],[1,1,6],[10,2,4]].map(([x,y,size],key)=>jsx.jsx('rect',{x,y,width:size,height:size,rx:1.5},key))});}\n`;
      const titleFn=titleComponent.module.functions.get(titleComponent.local), tm=titleComponent.module;
      const titleSwitch=one(tm.inside(titleFn,n=>n.type==='SwitchStatement'&&n.cases.some(c=>value(c.test)==='general-settings')&&n.cases.some(c=>value(c.test)==='extension')),'native page title switch');
      const extensionCase=one(titleSwitch.cases.filter(c=>value(c.test)==='extension'),'native title case');
      const titleGetterName=one(tm.inside(extensionCase,n=>n.type==='CallExpression'&&n.callee.type==='Identifier').map(n=>n.callee.name),'section title metadata lookup');
      const titleGetter=tm.functions.get(titleGetterName);if(!titleGetter)fail('section title metadata is not a local function');
      tm.insert(titleGetter.body.start+1,`if(${titleGetter.params[0].name}===${JSON.stringify(slug)})return{id:'codexpp.settings.extensions.title',defaultMessage:'Extensions'};`);
      tm.insert(extensionCase.start,`case ${JSON.stringify(slug)}:`);
      const sectionRegistry=one(tm.nodes.filter(n=>n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&n.right.type==='ObjectExpression'&&has(n.right,'general-settings','plugins-settings','worktrees')).map(n=>n.left.name),'native Settings component registry');
      const prefetch=one([...tm.functions.values()].filter(fn=>fn.async&&tm.inside(fn,n=>n.type==='CallExpression'&&member(n.callee,'prefetch')&&n.callee.object.type==='MemberExpression'&&n.callee.object.computed&&n.callee.object.object.name===sectionRegistry&&n.callee.object.property.name===fn.params[0]?.name).length),'native Settings prefetch');
      tm.insert(prefetch.body.start+1,`if(${prefetch.params[0].name}===${JSON.stringify(slug)})return;`);
      if(new Set([pm.path,navModule.path,tm.path]).size!==3)fail('unsupported merged Settings modules');
      const patches=[{path:pm.path,source:pm.result(imports+input.runtime+'\n')},{path:navModule.path,source:navModule.result(prefix)},{path:tm.path,source:tm.result()}];
      return {patches,report:{schema:1,page:{path:pm.path,binding:pf.id.name},components:Object.fromEntries(Object.entries(roles).map(([role,c])=>[role,{path:c.module.path,binding:c.local}])),hooks:{visibility:navModule.path,title:tm.path,search:pm.path}}};
    }
  }
  global.CodexPPSettingsAdapter={adapt};
})(globalThis);
