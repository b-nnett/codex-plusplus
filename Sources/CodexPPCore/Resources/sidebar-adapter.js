// Expose the app's sidebar internals to better-sidebar under stable names.
// Each capability is discovered by its code shape (property names, change
// records, icon names, literals), never by minified identifiers. A candidate
// must also pass independent corroborating checks: how it is used elsewhere,
// and how it links to other capabilities. Every capability is optional: one
// that no longer matches is reported missing instead of failing the patch.
globalThis.CodexPPSidebarAdapter = Object.freeze({
  adapt(source) {
    const parse = text => acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'module'});
    if (source.includes('__codexPPSidebar')) throw Error('Sidebar already adapted.');
    const ast = parse(source);

    // --- AST helpers -------------------------------------------------------
    const isFunction = node => /Function/.test(node?.type);
    const key = node => node?.type === 'Identifier' ? node.name : node?.type === 'Literal' ? node.value :
      node?.type === 'TemplateLiteral' && !node.expressions.length ? node.quasis[0].value.cooked : undefined;
    const keys = object => new Set(object.properties.filter(p => p.type === 'Property' && !p.computed).map(p => key(p.key)));
    const property = (object, name) => ['ObjectExpression', 'ObjectPattern'].includes(object?.type) ?
      object.properties.find(p => p.type === 'Property' && !p.computed && key(p.key) === name) : undefined;
    // Optional chains (a?.b) wrap the member expression.
    const unchain = node => node?.type === 'ChainExpression' ? node.expression : node;
    const member = (node, name) => (node = unchain(node))?.type === 'MemberExpression' && !node.computed && node.property.name === name;
    const identifier = (node, name) => node?.type === 'Identifier' && (name === undefined || node.name === name);
    const callTo = (node, name) => node?.type === 'CallExpression' && identifier(node.callee, name);
    function walk(node, visit, parents = []) {
      if (!node || typeof node.type !== 'string') return;
      visit(node, parents);
      parents.push(node);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) { for (const child of value) walk(child, visit, parents); }
        else if (value && typeof value.type === 'string') walk(value, visit, parents);
      }
      parents.pop();
    }
    const contains = (node, test) => { let found = false; walk(node, child => { if (!found && test(child)) found = true; }); return found; };
    // The function's own code, not nested function bodies.
    function shallow(fn, visit) {
      walk(fn.body, (node, parents) => {
        if (parents.slice(parents.indexOf(fn.body) + 1).some(isFunction)) return;
        visit(node);
      }, [fn.body]);
    }
    const containsShallow = (fn, test) => { let found = false; shallow(fn, child => { if (!found && test(child)) found = true; }); return found; };

    // --- One pass to index the module ---------------------------------------
    const bindings = [];      // [name, value] for every `name = value` and declarator.
    const records = [];       // CommonJS interop records: {name, factory, assigned}.
    const functions = [];     // FunctionDeclarations at any depth.
    const changeRecords = []; // {object, owner, call} for objects with a `kind` field.
    const factories = [];     // Scope facade candidates.
    const calls = [];         // Every CallExpression, for usage evidence.
    walk(ast, (node, parents) => {
      if (node.type === 'CallExpression') calls.push(node);
      if (node.type === 'FunctionDeclaration') functions.push(node);
      const target = node.type === 'AssignmentExpression' && node.operator === '=' && node.left.type === 'Identifier' ? [node.left.name, node.right] :
        node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init ? [node.id.name, node.init] : null;
      if (target) bindings.push(target);
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'CallExpression' &&
          node.init.arguments.length === 1 && isFunction(node.init.arguments[0])) {
        const factory = node.init.arguments[0], exports = factory.params[0];
        if (identifier(exports)) {
          const assigned = new Map();
          shallow(factory, child => {
            if (child.type === 'AssignmentExpression' && child.left.type === 'MemberExpression' && !child.left.computed &&
                identifier(child.left.object, exports.name)) assigned.set(child.left.property.name, child.right);
          });
          records.push({name: node.id.name, factory, assigned});
        }
      }
      if (node.type === 'ObjectExpression') {
        const owner = [...parents].reverse().find(isFunction);
        const parent = parents.at(-1);
        if (property(node, 'kind') && owner?.type === 'FunctionDeclaration')
          changeRecords.push({object: node, owner, call: parent?.type === 'CallExpression' && parent.arguments.includes(node) ? parent : null});
        if (['chain', 'get', 'node', 'query', 'scope'].every(name => keys(node).has(name)) && owner?.type === 'FunctionDeclaration' &&
            parent?.type === 'VariableDeclarator' && parents.at(-2)?.type === 'VariableDeclaration')
          factories.push({object: node, owner, declarator: parent, declaration: parents.at(-2)});
      }
    });
    const usesAsFirstArgument = name => calls.filter(call => identifier(call.arguments[0], name)).length;

    // --- Discovery -----------------------------------------------------------
    const resolved = {}, missing = [], evidence = {};
    function settle(name, candidates, why) {
      const unique = [...new Set(candidates)];
      if (unique.length === 1) { resolved[name] = unique[0]; evidence[name] = why; }
      else missing.push(`${name} (${unique.length} matches)`);
      return resolved[name];
    }

    // React: the record that defines the hooks API and a semver version.
    const react = settle('react', records.filter(record =>
      ['createElement', 'cloneElement', 'isValidElement', 'createContext', 'useContext', 'useState', 'useRef', 'useEffect']
        .every(name => record.assigned.has(name)) &&
      /^\d+\.\d+\.\d+/.test(String(key(record.assigned.get('version')) ?? ''))).map(record => record.name),
      'defines the hooks API and a version');
    const reactVersion = react ? key(records.find(record => record.name === react).assigned.get('version')) : null;
    // Records that only re-export React (t.exports = React()).
    const reactRecords = new Set(react ? [react] : []);
    for (const record of records) {
      const body = record.factory.body;
      const statement = body.type === 'BlockStatement' ? (body.body.length === 1 ? body.body[0].expression : null) : body;
      if (statement?.type === 'AssignmentExpression' && member(statement.left, 'exports') && callTo(statement.right, react)) reactRecords.add(record.name);
    }

    // react-dom/client: defines createRoot, names itself react-dom, loads
    // React, and refuses to run unless React's version equals its own.
    settle('reactDOM', react ? records.filter(record => record.assigned.has('createRoot') &&
      contains(record.factory, node => key(node) === 'react-dom') &&
      contains(record.factory, node => node.type === 'BinaryExpression' && /^[!=]==?$/.test(node.operator) &&
        (key(node.left) === reactVersion || key(node.right) === reactVersion)) &&
      contains(record.factory, node => node.type === 'CallExpression' && identifier(node.callee) && reactRecords.has(node.callee.name) && !node.arguments.length))
      .map(record => record.name) : [], `createRoot; react-dom; loads React and checks version ${reactVersion}`);

    // Tooltip: a one-argument component reading tooltip props, rendered with
    // tooltipContent props across the app.
    settle('tooltip', functions.filter(fn => {
      const props = fn.params[0];
      if (!identifier(props) || fn.params.length !== 1) return false;
      const text = source.slice(fn.start, fn.end);
      if (!text.includes('tooltipContent') || !text.includes('delayDuration')) return false;
      const reads = name => contains(fn.body, node => member(node, name) && identifier(unchain(node).object, props.name));
      return reads('tooltipContent') && reads('delayDuration') && reads('children') &&
        contains(fn.body, node => member(node, 'useContext')) &&
        calls.filter(call => identifier(call.arguments[0], fn.id.name) && property(call.arguments[1], 'tooltipContent')).length >= 3;
    }).map(fn => fn.id.name), 'reads tooltip props; rendered with tooltipContent at least 3 times');

    // Canonical section key: rewrites codex:thread: keys via the cloud key map.
    const canonicalKey = settle('canonicalKey', functions.filter(fn => {
      const second = fn.params[1];
      if (!identifier(fn.params[0]) || !identifier(second)) return false;
      const text = source.slice(fn.start, fn.end);
      if (!text.includes('localKeyByCloudKey') || !text.includes('codex:thread:')) return false;
      return contains(fn.body, node => node.type === 'CallExpression' && member(node.callee, 'startsWith') &&
          identifier(unchain(node.callee).object, second.name) && key(node.arguments[0]) === 'codex:thread:') &&
        contains(fn.body, node => node.type === 'CallExpression' && member(node.callee, 'slice') &&
          identifier(unchain(node.callee).object, second.name) && key(node.arguments[0]) === 'codex:thread:'.length) &&
        contains(fn.body, node => member(node, 'localKeyByCloudKey'));
    }).map(fn => fn.id.name), 'rewrites codex:thread: keys through localKeyByCloudKey');

    // Section actions emit change records through one shared mutator, which
    // itself branches on the record's kind.
    const kindOf = record => key(property(record.object, 'kind').value);
    const viaMutator = record => record.call && identifier(record.call.callee) &&
      identifier(record.call.arguments[0], record.owner.params[0]?.name);
    const mutatorCandidates = new Set(changeRecords.filter(record => viaMutator(record) && ['details', 'move', 'remove'].includes(kindOf(record)))
      .map(record => record.call.callee.name));
    const mutator = settle('sectionMutator', [...mutatorCandidates].filter(name => {
      const fn = functions.find(candidate => candidate.id.name === name);
      return fn && fn.params.length >= 4 && contains(fn.body, node => node.type === 'BinaryExpression' &&
        member(node.left, 'kind') && key(node.right) === 'remove');
    }), 'shared by details, move and remove records; branches on kind');
    const callsCanonical = fn => Boolean(canonicalKey) && contains(fn.body, node => callTo(node, canonicalKey));
    const action = (name, kind, fields, extra) => settle(name, mutator ? changeRecords.filter(record =>
      kindOf(record) === kind && viaMutator(record) && record.call.callee.name === mutator &&
      fields.every(field => keys(record.object).has(field)) && extra(record)).map(record => record.owner.id.name) : [],
      `${kind} record through the section mutator`);
    action('renameSection', 'details', ['sectionId'], record => record.owner.params.length === 3 &&
      identifier(property(record.object, 'sectionId').value, record.owner.params[1]?.name));
    action('moveSectionItem', 'move', ['itemKey', 'wasPinned'], record => callsCanonical(record.owner));
    action('removeSectionItem', 'remove', ['itemKey', 'reason'], record => callsCanonical(record.owner));
    settle('createSection', mutator ? functions.filter(fn => {
      const text = source.slice(fn.start, fn.end);
      return identifier(fn.params[0]) && text.includes('randomUUID') && text.includes('sectionOrder') &&
        contains(fn.body, node => node.type === 'CallExpression' && member(node.callee, 'randomUUID') && identifier(unchain(node.callee).object, 'crypto')) &&
        contains(fn.body, node => node.type === 'ObjectExpression' && ['id', 'name', 'itemKeys'].every(field => keys(node).has(field))) &&
        contains(fn.body, node => member(node, 'sectionOrder')) &&
        contains(fn.body, node => callTo(node, mutator) && identifier(node.arguments[0], fn.params[0].name)) && callsCanonical(fn);
    }).map(fn => fn.id.name) : [], 'new UUID section through the section mutator; canonical keys');

    // The app-level scope definition: AppScope, owning many atoms.
    const appScope = settle('appScopeDefinition', bindings.filter(([name, value]) => callTo(value) &&
      value.arguments.length === 1 && key(value.arguments[0]) === 'AppScope' && usesAsFirstArgument(name) >= 20).map(([name]) => name),
      'AppScope, first argument of at least 20 atom definitions');
    const atom = value => callTo(value) && identifier(value.arguments[0], appScope);

    // Sections: the AppScope atom reading `.sections`, consumed by other atoms.
    settle('sections', appScope ? bindings.filter(([name, value]) => {
      const read = value.arguments?.at(-1);
      if (!atom(value) || value.arguments.length !== 2 || !isFunction(read) || read.params[0]?.type !== 'ObjectPattern') return false;
      const get = property(read.params[0], 'get')?.value;
      return identifier(get) && member(read.body, 'sections') && callTo(unchain(read.body).object, get.name) &&
        bindings.some(([other, consumer]) => other !== name && atom(consumer) &&
          contains(consumer, node => node.type === 'CallExpression' && identifier(node.arguments[0], name)));
    }).map(([name]) => name) : [], 'AppScope atom reading .sections, consumed by other atoms');

    // Navigation: the AppScope atom holding the navigation bridge, whose
    // navigate method the app calls.
    const navigationObjects = new Set(bindings.filter(([, value]) => value.type === 'ObjectExpression' && keys(value).size === 3 &&
      ['navigate', 'navigateToLocalConversation', 'prepareNavigation'].every(field => keys(value).has(field))).map(([name]) => name));
    settle('navigationSignal', appScope ? bindings.filter(([name, value]) => atom(value) && value.arguments.length === 2 &&
      identifier(value.arguments[1]) && navigationObjects.has(value.arguments[1].name) &&
      calls.some(call => member(call.callee, 'navigate') && unchain(call.callee).object.type === 'CallExpression' &&
        member(unchain(call.callee).object.callee, 'get') && identifier(unchain(call.callee).object.arguments[0], name)))
      .map(([name]) => name) : [], 'AppScope atom with the navigation bridge; .get(atom).navigate() is called');

    // Feature gates: the AppScope atom family reading a gate by its key
    // without logging an exposure, with a mount hook.
    const gates = settle('gates', appScope ? bindings.filter(([, value]) => {
      if (!atom(value)) return false;
      const read = value.arguments.find(isFunction);
      const gateKey = read?.params[0];
      return identifier(gateKey) && containsShallow(read, node => node.type === 'CallExpression' && member(node.callee, 'getFeatureGate') &&
          identifier(node.arguments[0], gateKey.name) && property(node.arguments[1], 'disableExposureLog')) &&
        value.arguments.some(argument => property(argument, 'onMount'));
    }).map(([name]) => name) : [], 'AppScope gate family without exposure logging, with onMount');

    // Pin icons: named icon definitions, wrapped by one shared icon factory.
    const factoryUses = new Map();
    for (const [, value] of bindings) if (callTo(value) && value.arguments.length === 1 && identifier(value.arguments[0]))
      factoryUses.set(value.callee.name, (factoryUses.get(value.callee.name) || 0) + 1);
    const wrappers = {};
    function icon(name, iconName) {
      const definitions = bindings.filter(([, value]) => callTo(value) && value.arguments[0]?.type === 'ObjectExpression' &&
        key(property(value.arguments[0], 'name')?.value) === iconName && property(value.arguments[0], 'canvas')).map(([definition]) => definition);
      const candidates = definitions.length === 1 ? bindings.filter(([, value]) => callTo(value) && value.arguments.length === 1 &&
        identifier(value.arguments[0], definitions[0]) && factoryUses.get(value.callee.name) >= 20) : [];
      for (const [wrapper, value] of candidates) wrappers[wrapper] = value.callee.name;
      return settle(name, candidates.map(([wrapper]) => wrapper), `${iconName}, wrapped by the shared icon factory`);
    }
    const pinIcon = icon('pinIcon', 'pin-light-16');
    const unpinIcon = icon('unpinIcon', 'pin-fill-light-16');
    if (pinIcon && unpinIcon && wrappers[pinIcon] !== wrappers[unpinIcon]) {
      for (const name of ['pinIcon', 'unpinIcon']) { delete resolved[name]; delete evidence[name]; missing.push(`${name} (different icon factories)`); }
    }

    // Scope facades: the AppScope factory. Capture only non-transactional
    // facades, which the factory completes with set() before returning.
    settle('scopeFactory', appScope ? factories.filter(({object, owner, declarator, declaration}) => {
      const scopeParam = owner.params[0], transaction = owner.params[3];
      if (!identifier(scopeParam) || !identifier(transaction) || !identifier(declarator.id) || !owner.body.body.includes(declaration)) return false;
      if (!identifier(property(object, 'scope').value, scopeParam.name)) return false;
      const facade = declarator.id.name;
      const plain = contains(declaration, node => node.type === 'BinaryExpression' && node.operator === '==' &&
        identifier(node.left, transaction.name) && node.right.type === 'Literal' && node.right.value === null);
      const completes = owner.body.body.some(statement => statement.type === 'ReturnStatement' && contains(statement, node =>
        node.type === 'AssignmentExpression' && member(node.left, 'set') && identifier(unchain(node.left).object, facade)) &&
        (identifier(statement.argument, facade) || (statement.argument?.type === 'SequenceExpression' &&
          identifier(statement.argument.expressions.at(-1), facade))));
      return plain && completes;
    }) : [], 'scope facade with chain, node and scope; completed with set(); non-transactional');

    // Only offer the layout gate when an AppScope atom still reads it through
    // the gate family. Its meaning cannot be checked mechanically; review it.
    const sidebarLayoutGate = '3085093835';
    const gateRead = Boolean(gates) && bindings.some(([, value]) => atom(value) && contains(value, node => node.type === 'CallExpression' &&
      node.arguments.length === 2 && identifier(node.arguments[0], gates) && key(node.arguments[1]) === sidebarLayoutGate));
    if (gateRead) evidence.sidebarLayoutGate = 'read through the gate family in an AppScope atom';
    else missing.push('sidebarLayoutGate');

    // --- Contract -------------------------------------------------------------
    let result = source;
    const factory = resolved.scopeFactory;
    if (factory) {
      const capture = `;${factory.owner.params[0].name}===${appScope}&&${factory.owner.params[3].name}==null&&(__codexPPSidebarAppScope=${factory.declarator.id.name});`;
      result = result.slice(0, factory.declaration.end) + capture + result.slice(factory.declaration.end);
    } else missing.push('appScope');
    const getter = name => resolved[name] ? `get ${name}(){return ${resolved[name]}},` : '';
    result += `\n;var __codexPPSidebarAppScope;Object.defineProperty(globalThis,'__codexPPSidebar',{configurable:true,value:Object.freeze({` +
      `protocol:1,` +
      (resolved.react ? `react(){return ${resolved.react}()},` : '') +
      (resolved.reactDOM ? `reactDOM(){return ${resolved.reactDOM}()},` : '') +
      ['tooltip', 'renameSection', 'moveSectionItem', 'removeSectionItem', 'createSection', 'canonicalKey',
        'sections', 'navigationSignal', 'gates', 'pinIcon', 'unpinIcon'].map(getter).join('') +
      (factory ? `appScope(){return __codexPPSidebarAppScope},` : '') +
      `sidebarLayoutGate:${gateRead ? JSON.stringify(sidebarLayoutGate) : 'null'},` +
      `reactVersion:${JSON.stringify(reactVersion ?? null)},` +
      `missing:Object.freeze(${JSON.stringify(missing)})})});\n`;
    parse(result);
    const report = Object.fromEntries(Object.entries(evidence).map(([name, why]) =>
      [name, {local: typeof resolved[name] === 'string' ? resolved[name] : resolved[name]?.owner?.id?.name ?? null, why}]));
    return {source: result, missing, report};
  }
});
