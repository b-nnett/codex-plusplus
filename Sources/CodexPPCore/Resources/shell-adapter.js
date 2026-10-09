// Translate a reviewed app build into our owned, versioned shell contract.
// No bundle filenames, minified symbols, localized labels or React internals.
globalThis.CodexPPShellAdapter = Object.freeze({
  adapt(source, runtime) {
    const parse = text => acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'module'});
    const key = node => node?.type === 'Literal' ? node.value :
      node?.type === 'TemplateLiteral' && !node.expressions.length ? node.quasis[0].value.cooked :
      node?.type === 'Identifier' ? node.name : undefined;
    const matches = {frame: [], panel: [], main: [], titlebar: [], command: []};
    function walk(node) {
      if (!node || typeof node.type !== 'string') return;
      if (node.type === 'ObjectExpression') {
        const props = new Map(node.properties.filter(p => p.type === 'Property' && !p.computed).map(p => [key(p.key), p.value]));
        if ([...props.keys()].some(k => String(k).startsWith('data-codexpp-shell-'))) throw Error('Shell already adapted.');
        const add = (role, extra = '') => matches[role].push({start: node.end - 1, end: node.end - 1,
          text: `,"data-codexpp-shell-role":"${role}"${extra}`});
        const value = name => source.slice(props.get(name).start, props.get(name).end);
        if (props.has('data-app-shell-frame') && props.has('data-app-shell-sidebar-open'))
          add('frame', `,"data-codexpp-shell-sidebar-open":${value('data-app-shell-sidebar-open')}`);
        if (props.has('data-app-shell-left-panel-appearance') && props.has('data-slate-sidebar-peeking'))
          add('panel', `,"data-codexpp-shell-peeking":${value('data-slate-sidebar-peeking')}`);
        if (props.has('data-app-shell-main-surface')) add('main');
        if (props.has('data-app-shell-titlebar')) add('titlebar');
      }
      if (node.type === 'ArrayExpression' && node.elements.length === 2 && key(node.elements[0]) === 'toggleSidebar') {
        const command = node.elements[1];
        if (command?.type === 'Identifier') matches.command.push({start: command.start, end: command.end,
          text: `globalThis.__codexPPShell.registerSidebarToggle(${source.slice(command.start, command.end)})`});
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value.type === 'string') walk(value);
      }
    }
    walk(parse(source));
    for (const [role, found] of Object.entries(matches)) {
      if (found.length !== 1) throw Error(`Shell ${role}: expected one match, found ${found.length}.`);
    }
    for (const edit of Object.values(matches).flat().sort((a, b) => b.start - a.start))
      source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    const result = runtime + '\n' + source;
    parse(result);
    return result;
  }
});
