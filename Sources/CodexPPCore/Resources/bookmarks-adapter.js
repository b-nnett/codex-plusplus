// Adapt reviewed browser components by their property contracts.
globalThis.CodexPPBookmarksAdapter = Object.freeze({
  adapt(modules, runtime) {
    const parse = s => acorn.parse(s, {ecmaVersion:'latest', sourceType:'module'});
    const key = n => n?.type === 'Identifier' ? n.name : n?.type === 'Literal' ? n.value :
      n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : undefined;
    function walk(n, visit, shallow = false) {
      if (!n?.type) return;
      visit(n);
      for (const v of Object.values(n)) for (const c of Array.isArray(v) ? v : [v]) {
        if (shallow && /Function/.test(c?.type)) continue;
        if (c?.type) walk(c, visit, shallow);
      }
    }
    const trees = Object.entries(modules).map(([path, source]) => ({path,source,ast:parse(source),edits:[],factory:null}));
    const found = {menu:[],tab:[],detached:[],suggested:[]};
    for (const tree of trees) {
      if (tree.source.includes('__codexPPBookmarks')) throw Error('Bookmarks already adapted.');
      walk(tree.ast, fn => {
        if (fn.type !== 'FunctionDeclaration') return;
        const props = new Map();
        walk(fn.body, n => {
          if (n.type === 'VariableDeclarator' && n.id.type === 'ObjectPattern')
            for (const p of n.id.properties) if (p.type === 'Property') props.set(key(p.key), p.value);
        }, true);
        const has = names => names.every(n => props.has(n));
        let role;
        if (has(['onOpenHistory','onOpenBrowserSettings','onImportBrowserProfile','onCaptureScreenshot'])) role='menu';
        else if (has(['browserTabId','conversationId','renderSlots','isVisible','onToggleFloatingComposer'])) role='tab';
        else if (has(['browserTabId','conversationId','snapshot','browserToolbarCapabilities','settingsButton','requestToolbarSourceAction'])) role='detached';
        else if (has(['onNavigate']) && tree.source.slice(fn.start,fn.end).includes('threadWorkspace.newTab.suggested.heading')) role='suggested';
        if (role) found[role].push({tree,fn,props});
      });
    }
    for (const [role, values] of Object.entries(found)) if (values.length !== 1) throw Error(`Bookmarks ${role}: expected one match, found ${values.length}.`);
    const iconMatches=[];
    const suggestedTree=found.suggested[0].tree;
    walk(suggestedTree.ast,fn=>{
      if(fn.type!=='FunctionDeclaration') return;
      let site,readsIcon=false,hasImage=false;
      walk(fn.body,n=>{
        if(n.type==='VariableDeclarator' && n.id.type==='ObjectPattern')
          for(const p of n.id.properties) if(p.type==='Property' && key(p.key)==='site') site=p.value.name;
      },true);
      if(!site) return;
      walk(fn.body,n=>{
        if(n.type==='MemberExpression' && n.object.name===site && key(n.property)==='faviconDataURL') readsIcon=true;
        if(n.type==='CallExpression' && key(n.arguments[0])==='img') hasImage=true;
      },true);
      if(readsIcon && hasImage) iconMatches.push(fn.id.name);
    });
    if(iconMatches.length!==1) throw Error(`Bookmarks favicon: expected one match, found ${iconMatches.length}.`);
    suggestedTree.siteIcon=iconMatches[0];
    const menu = found.menu[0];
    // Resolve the React factory through the menu's useRef, then follow its import
    // across modules. This tolerates renamed local bindings and bundle paths.
    let reactNamespace, item;
    walk(menu.fn.body, n => {
      if (n.type === 'MemberExpression' && !n.computed && key(n.property)==='useRef') reactNamespace=n.object.name;
      if (n.type === 'MemberExpression' && !n.computed && key(n.property)==='Item') item=menu.tree.source.slice(n.object.start,n.object.end);
    }, true);
    const factories=[];
    walk(menu.tree.ast, n => {
      if (n.type === 'AssignmentExpression' && n.left.name===reactNamespace && n.right.type==='CallExpression' && n.right.callee.type==='Identifier') factories.push(n.right.callee.name);
    });
    if (factories.length!==1 || !item) throw Error('Bookmarks: missing React/menu bindings.');
    let reactImport;
    for (const n of menu.tree.ast.body) if(n.type==='ImportDeclaration')
      for(const p of n.specifiers) if(p.local.name===factories[0]) reactImport={name:key(p.imported),source:n.source.value};
    if (!reactImport) throw Error('Bookmarks: missing React factory import.');
    const reports=[];
    for (const [role,[match]] of Object.entries(found)) {
      const {tree,fn,props}=match;
      let factory, jsx;
      for(const n of tree.ast.body) if(n.type==='ImportDeclaration' && n.source.value===reactImport.source)
        for(const p of n.specifiers) if(key(p.imported)===reactImport.name) factory=p.local.name;
      walk(fn.body,n=>{
        if(n.type==='MemberExpression' && !n.computed && ['jsx','jsxs'].includes(key(n.property))) jsx=tree.source.slice(n.object.start,n.object.end)+'.jsx';
      },true);
      if(!factory || !jsx) throw Error(`Bookmarks ${role}: missing renderer bindings.`);
      tree.factory=factory;
      const react='__codexPPBookmarkReactFactory()';
      let arg;
      if(role==='tab') {
        const members=new Map();
        walk(fn.body,n=>{
          if(n.type==='MemberExpression' && !n.computed && n.object.type==='Identifier') {
            const keys=members.get(n.object.name)||new Set(); keys.add(key(n.property)); members.set(n.object.name,keys);
          }
        },true);
        const snapshots=[...members].filter(([,v])=>['url','tabType','securityState'].every(k=>v.has(k)));
        if(snapshots.length!==1) throw Error('Bookmarks: ambiguous browser snapshot.');
        arg=snapshots[0][0];
      } else if(role==='detached') arg=props.get('snapshot').name;
      else if(role==='suggested') arg=props.get('onNavigate').name;
      const returns=[];
      walk(fn.body,n=>{if(n.type==='ReturnStatement' && n.argument) returns.push(n.argument);},true);
      if(!returns.length) throw Error(`Bookmarks ${role}: missing component return.`);
      for(const n of returns) {
        const original=tree.source.slice(n.start,n.end);
        const text=role==='menu' ? `globalThis.__codexPPBookmarks.menu(${react},${jsx},${item}.Item,(${original}))` :
          role==='suggested' ? `globalThis.__codexPPBookmarks.section(${react},${jsx},${arg},(${original}),__codexPPBookmarkSiteIcon)` :
          `globalThis.__codexPPBookmarks.provide(${react},${jsx},${arg},(${original}))`;
        tree.edits.push({start:n.start,end:n.end,text});
      }
      reports.push({role,path:tree.path});
    }
    const patches=[];
    for(const tree of trees) if(tree.edits.length) {
      let source=tree.source;
      for(const edit of tree.edits.sort((a,b)=>b.start-a.start)) source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
      source=runtime+'\nconst __codexPPBookmarkReactFactory='+tree.factory+';\n'+
        (tree.siteIcon ? 'const __codexPPBookmarkSiteIcon='+tree.siteIcon+';\n' : '')+source; parse(source); patches.push({path:tree.path,source});
    }
    return {patches,report:{schema:1,components:reports}};
  }
});
