// Discover the native browser menu by its property contract, not minified names.
globalThis.CodexPPBrowserAdapter = Object.freeze({
  adapt(source) {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      visit(node);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) { for (const child of value) walk(child, visit); }
        else if (value && typeof value.type === 'string') walk(value, visit);
      }
    }
    const matches = [];
    walk(ast, node => {
      if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return;
      const pattern = node.params[0];
      if (pattern?.type !== 'ObjectPattern') return;
      const properties = new Map(pattern.properties.filter(p => p.type === 'Property' && !p.computed)
        .map(p => [p.key.name || p.key.value, p.value]));
      if (!['params', 'webContents', 'window', 'onComment', 'onInspect', 'isAnnotationModeEnabled'].every(key => properties.has(key))) return;
      const params = properties.get('params'), window = properties.get('window'), contents = properties.get('webContents');
      if (params.type !== 'Identifier' || window.type !== 'Identifier' || contents.type !== 'Identifier') return;
      walk(node.body, call => {
        if (call.type !== 'CallExpression' || call.callee.type !== 'MemberExpression' || call.callee.computed || call.callee.property.name !== 'popup') return;
        const build = call.callee.object;
        if (build.type !== 'CallExpression' || build.callee.type !== 'MemberExpression' || build.callee.computed || build.callee.property.name !== 'buildFromTemplate') return;
        const options = call.arguments[0];
        if (options?.type !== 'ObjectExpression' || !options.properties.every(p => p.type === 'Property' && !p.computed)) return;
        const named = new Map(options.properties.map(p => [p.key.name || p.key.value, p]));
        const windowOption = named.get('window'), frameOption = named.get('frame');
        if (windowOption?.value.name !== window.name || named.size !== (frameOption ? 2 : 1)) return;
        // Upstream may adopt Electron's public frame option. Keep its value as
        // the fallback instead of failing the patch, but never adapt twice.
        if (frameOption && source.slice(frameOption.value.start, frameOption.value.end).includes('__codexPPNativeBrowser')) {
          throw new Error('Native browser menu already adapted.');
        }
        matches.push({ position: options.end - 1, frame: frameOption?.value, params: params.name, contents: contents.name, window: window.name });
      });
    });
    if (matches.length !== 1) throw new Error(`Native browser menu: expected one match, found ${matches.length}.`);
    const match = matches[0];
    const ours = `globalThis.__codexPPNativeBrowser?.frameForContextMenu(${match.params},${match.contents},${match.window})`;
    const result = match.frame
      ? source.slice(0, match.frame.start) + `${ours}??(${source.slice(match.frame.start, match.frame.end)})` + source.slice(match.frame.end)
      : source.slice(0, match.position) + `,frame:${ours}` + source.slice(match.position);
    acorn.parse(result, { ecmaVersion: 'latest', sourceType: 'script' });
    return result;
  }
});
