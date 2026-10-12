// Startup fast path, discovered by code shape rather than minified names. Each
// edit is independent and optional: a missing or ambiguous match leaves that
// code untouched and is reported, so an unrecognised build starts exactly as
// it does unpatched.
//
// statsigCacheFirst: the Statsig React hook keeps `isLoading` until the network
//   fetch in initializeAsync settles, although the SDK has already loaded and
//   published this user's cached values (values_updated, status "Loading",
//   source "Cache"). The app renders a spinner over everything until then.
//   Clear `isLoading` as soon as cached values for the user are live; the
//   network result still arrives through values_updated and re-renders.
// startupRevealUnthrottled: React holds a committed Suspense fallback for at
//   least 300 ms before revealing content (FALLBACK_THROTTLE_MS). Startup
//   commits a chain of fallbacks that are all the same spinner, and each one
//   restarts the timer, adding hundreds of milliseconds of pure waiting. Skip
//   the throttle during a window's first 10 seconds; React behaves as before
//   afterwards.
// entryPreload (webview/index.html): the entry module awaits import(rpc) and
//   only then import(app-main), whose dependencies include the 11 MB
//   app-initial bundle, so the largest file is requested only after the 8 MB
//   app-shared bundle has evaluated. Declare every chunk in the entry's
//   dependency list up front (modulepreload for JS, preload for CSS) so
//   Chromium fetches and compiles them in parallel; execution order is
//   unchanged.
// settingsCacheFirst: SettingsPreloadGate holds the window until get-settings
//   returns from the main process (about 360 ms at startup, while the settings
//   store initialises), and auth requests are sent only after it opens. Seed
//   the query with the last successful result for this build (localStorage)
//   as initialData, stale from the start, so the gate opens at once and the
//   fresh settings arrive immediately after.
// authStorageGateCacheFirst (main process): before spawning its app-server,
//   the app asks Statsig over the network whether the
//   codex_desktop_secret_auth_storage rollout flag is on, and adds
//   features.secret_auth_storage=true to the CLI when it is; every launch
//   waits on that round trip, and any failure starts the CLI without the flag.
//   Start with the last network-confirmed answer for this app version, device
//   and platform, and save the fresh answer for the next launch (only answers
//   recognised from the network are saved). No saved answer means the
//   original wait.
// learnedStartupPreload: when the initial bundle starts evaluating, add
//   <link rel=modulepreload> for the chunks the previous launch of this build
//   requested in its first 1.5 s (at most 40; fetched and compiled, not run),
//   and record this launch's list about 8 s in. Needs chunkTimings.
// deferDockIcon (main process): window-manager setup applies the Dock icon
//   preference synchronously (image decode plus app.dock.setIcon, about 50 ms)
//   before the first window exists. Apply it 3 s later instead; theme-change
//   updates are unchanged, and the default preference looks the same.
// appGateReasons (diagnostic): the component that holds the window until auth,
//   app info, platform and the query client are loaded records which of its
//   four flags were still set on each blocking render, in
//   globalThis.__codexPPStartup.appGate.
// chunkTimings: wrap Vite's preload helper so each dynamic import records its
//   chunk path and start/end times in globalThis.__codexPPStartup.chunks (first
//   400), for traced launches.
// statsigUserCacheFirst: when the Statsig user changes during startup, the
//   app's provider waits for a second network update. updateUserAsync loads the
//   new user's cache synchronously; accept it immediately when present.
// statsigBootstrapCacheFirst: for ChatGPT sign-ins the app fetches a Statsig
//   bootstrap payload from OpenAI (with retries) before creating the client,
//   and shows a spinner over the whole window until it arrives: about a second
//   on a good network, far longer on a bad one. Keep the last payload for the
//   same identity (client key, app version, device, user, account, auth
//   method) and build the client from it immediately; the fetch still runs,
//   and its result is saved (IndexedDB; the payload exceeds localStorage's
//   quota) and applied to the live client, which re-renders through
//   values_updated. No cached payload means the original wait.
// policyPhaseTimings (main process, startup-requirements; diagnostic only):
//   record when the network-policy step starts, finishes loading the shell
//   environment, sends the policy read and validates the result, in
//   globalThis.__codexPPStartupMain.policy (performance.now() times). No
//   behaviour changes.
// shellEnvironmentCacheFirst (main process): the policy step first runs the
//   user's login shell to capture its environment (about 140 ms). Apply the
//   variables the shell added last time and continue at once; the real load
//   still runs and overwrites them when it finishes, long before the app
//   starts its app-server. Variables whose names look sensitive are never
//   written to disk: when the shell sets any, every launch keeps the original
//   wait. Per-session variables are not cached either. The Codex home mkdir
//   that follows becomes synchronous (recursive, normally a no-op): before
//   Electron's ready, async I/O completes only once the loop runs, so the
//   policy CLI could not be spawned until then; now it boots during
//   Chromium's startup.
// loadingGateTimings: the shared loading indicator receives a debugName naming
//   the gate it stands for (production drops it from the DOM). An effect added
//   to it records when each name first mounted and last unmounted, in
//   globalThis.__codexPPGates (performance.now() times), so traced launches
//   show which gate held the window. The hook is unconditional, so React's
//   hook order is unchanged between renders.
// deferDictationCues: the composer eagerly constructs an AudioContext and
//   fetches and decodes three dictation sound cues at startup. The cue player
//   creates them on first use, so the eager preload is dropped.
globalThis.CodexPPStartupAdapter = Object.freeze({
  adapt(input) {
    const marker = '/*codexpp:startup*/';
    const parse = source => acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    function walk(node, visit, ancestors = []) {
      if (!node || typeof node.type !== 'string') return;
      visit(node, ancestors);
      ancestors.push(node);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) { for (const child of value) walk(child, visit, ancestors); }
        else if (value && typeof value.type === 'string') walk(value, visit, ancestors);
      }
      ancestors.pop();
    }
    const member = (node, name) => node?.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
      !node.callee.computed && node.callee.property.type === 'Identifier' && node.callee.property.name === name;
    const isFalse = node => node?.type === 'UnaryExpression' && node.operator === '!' && node.argument.type === 'Literal' && node.argument.value === 1;
    const applied = {}, skipped = {}, edits = { shared: [], initial: [], requirements: [], main: [] };
    const sources = { shared: input.shared, initial: input.initial, requirements: input.requirements, main: input.main };
    if ([sources.shared, sources.initial, sources.requirements, sources.main].some(source => typeof source === 'string' && source.includes(marker))) {
      throw new Error('Startup fast path already applied.');
    }
    const trees = {};
    let result_html = null;
    for (const [key, source] of Object.entries(sources)) if (typeof source === 'string') trees[key] = parse(source);
    function record(name, file, matches, edit) {
      if (!trees[file]) { skipped[name] = 'module not found'; return; }
      if (matches.length !== 1) { skipped[name] = `expected one match, found ${matches.length}`; return; }
      edits[file].push(edit(matches[0]));
      applied[name] = file;
    }

    // client.initializeAsync().catch(...).finally(() => setLoading(!1))
    if (trees.shared) {
      const matches = [];
      walk(trees.shared, node => {
        if (!member(node, 'finally') || node.arguments.length !== 1) return;
        const caught = node.callee.object, init = caught?.callee?.object;
        if (!member(caught, 'catch') || !member(init, 'initializeAsync') || init.arguments.length !== 0) return;
        const client = init.callee.object, done = node.arguments[0];
        if (client.type !== 'Identifier' || done.type !== 'ArrowFunctionExpression' || done.params.length !== 0) return;
        const set = done.body;
        if (set.type !== 'CallExpression' || set.callee.type !== 'Identifier' || set.arguments.length !== 1 || !isFalse(set.arguments[0])) return;
        matches.push({ node, client: client.name, setLoading: set.callee.name });
      });
      record('statsigCacheFirst', 'shared', matches, ({ node, client, setLoading }) => {
        const original = sources.shared.slice(node.start, node.end);
        const listener = `function ppCached(e){e?.status==="Loading"&&e.values?.source==="Cache"&&(${client}.off("values_updated",ppCached),${setLoading}(!1))}`;
        return { start: node.start, end: node.end,
          text: `${marker}((ppCached)=>(${client}.on("values_updated",ppCached),${original}.finally(()=>${client}.off("values_updated",ppCached))))(${listener})` };
      });
      // finishConcurrentRender: if (retryLanes && (wait = lastFallbackTime + 300 - now(), 10 < wait)) schedule `Throttled` commit
      const throttles = [];
      walk(trees.shared, (node, ancestors) => {
        if (node.type !== 'BinaryExpression' || node.operator !== '-' || node.right.type !== 'CallExpression' || node.right.arguments.length !== 0) return;
        const sum = node.left;
        if (sum.type !== 'BinaryExpression' || sum.operator !== '+' || sum.right.type !== 'Literal' || sum.right.value !== 300) return;
        const owner = [...ancestors].reverse().find(a => a.type === 'FunctionDeclaration' || a.type === 'FunctionExpression');
        if (owner && sources.shared.slice(owner.start, owner.end).includes('`Throttled`')) throttles.push(sum.right);
      });
      record('startupRevealUnthrottled', 'shared', throttles, literal => ({ start: literal.start, end: literal.end,
        text: `${marker}(performance.now()<1e4?0:300)` }));

      // X = Qk(scope, () => ({queryKey: key(`get-settings`), queryFn: ..., placeholderData: ..., ...}))
      const settingsQueries = [];
      walk(trees.shared, node => {
        if (node.type !== 'ObjectExpression') return;
        const props = new Map(node.properties.filter(p => p.type === 'Property' && !p.computed).map(p => [p.key.name, p]));
        const key = props.get('queryKey')?.value;
        if (!props.has('queryFn') || !props.has('placeholderData') || key?.type !== 'CallExpression' ||
            sources.shared.slice(key.start, key.end).indexOf('`get-settings`') < 0) return;
        settingsQueries.push({ node, prop: props.get('queryFn'), fn: props.get('queryFn').value });
      });
      record('settingsCacheFirst', 'shared', settingsQueries, ({ node, prop, fn }) => {
        const original = sources.shared.slice(fn.start, fn.end);
        const store = 'ppSettingsKey="codexpp.settings:"+import.meta.url';
        return { start: prop.start, end: node.end - 1, text: `${marker}queryFn:()=>Promise.resolve((${original})()).then(ppSettings=>{try{const ${store};` +
          `ppSettings!=null&&localStorage.setItem(ppSettingsKey,JSON.stringify(ppSettings))}catch{}return ppSettings}),` +
          sources.shared.slice(fn.end, node.end - 1).replace(/^,/, '') +
          `,...(()=>{try{const ${store},ppStored=localStorage.getItem(ppSettingsKey);return ppStored==null?{}:{initialData:JSON.parse(ppStored),initialDataUpdatedAt:0}}catch{return{}}})()` };
      });

      // Vite's __vitePreload(importThunk, deps, importerUrl): it links deps
      // with <link rel=modulepreload> (csp-nonce aware) before importing.
      const preloaders = [];
      walk(trees.shared, node => {
        if (node.type !== 'FunctionExpression' || node.params.length !== 3) return;
        const text = sources.shared.slice(node.start, node.end);
        if (text.includes('getElementsByTagName(`link`)') && text.includes('csp-nonce') && text.includes('import.meta.url')) preloaders.push(node);
      });
      record('chunkTimings', 'shared', preloaders, node => {
        const original = sources.shared.slice(node.start, node.end);
        return { start: node.start, end: node.end, text: `${marker}((ppPreload)=>function(e,t,n){const ppStart=performance.now(),` +
          `ppName=String(e).match(/import\\((?:\`|")([^\`"]+)/)?.[1]??"?";return ppPreload.call(this,e,t,n).finally(()=>{try{const ppLog=(globalThis.__codexPPStartup??={}).chunks??=[];` +
          `ppLog.length<400&&ppLog.push([ppName,ppStart,performance.now()])}catch{}})})(${original})` };
      });
    } else skipped.statsigCacheFirst = 'module not found';

    if (trees.initial) {
      // client.updateUserAsync(user).then(log).finally(() => { cancelled || setUser(user) })
      const matches = [];
      walk(trees.initial, (node, ancestors) => {
        if (!member(node, 'finally') || node.arguments.length !== 1) return;
        const then = node.callee.object, update = then?.callee?.object;
        if (!member(then, 'then') || !member(update, 'updateUserAsync') || update.arguments.length !== 1) return;
        const client = update.callee.object, user = update.arguments[0], done = node.arguments[0];
        if (client.type !== 'Identifier' || user.type !== 'Identifier' || done.type !== 'ArrowFunctionExpression') return;
        const body = done.body.type === 'BlockStatement' && done.body.body.length === 1 && done.body.body[0].type === 'ExpressionStatement'
          ? done.body.body[0].expression : done.body;
        if (body.type !== 'LogicalExpression' || body.operator !== '||' || body.left.type !== 'Identifier') return;
        const set = body.right;
        if (set.type !== 'CallExpression' || set.callee.type !== 'Identifier' || set.arguments.length !== 1 ||
            set.arguments[0].type !== 'Identifier' || set.arguments[0].name !== user.name) return;
        // Only the app's Statsig provider (its spinner is labelled in source).
        const owner = [...ancestors].reverse().find(a => a.type === 'FunctionDeclaration');
        if (!owner || !sources.initial.slice(owner.start, owner.end).includes('CodexStatsigProvider.async')) return;
        matches.push({ update, client: client.name, cancelled: body.left.name, setUser: set.callee.name, user: user.name });
      });
      record('statsigUserCacheFirst', 'initial', matches, ({ update, client, cancelled, setUser, user }) => {
        const original = sources.initial.slice(update.start, update.end);
        return { start: update.start, end: update.end,
          // updateUserAsync publishes the cached values synchronously before
          // its network fetch; observe exactly that call.
          text: `${marker}((ppCache)=>{const ppSeen=ppEvent=>{ppEvent?.status==="Loading"&&ppEvent.values?.source==="Cache"&&(ppCache.hit=!0)};` +
            `${client}.on("values_updated",ppSeen);try{return ${original}}finally{${client}.off("values_updated",ppSeen),ppCache.hit&&!${cancelled}&&${setUser}(${user})}})({})` };
      });

      // window.setTimeout(() => { try { preloadCues() } catch {} }, 0), where
      // preloadCues constructs an AudioContext.
      const audio = new Set();
      walk(trees.initial, node => {
        if (node.type !== 'FunctionDeclaration' || !node.id) return;
        const text = sources.initial.slice(node.start, node.end);
        if (text.includes('new AudioContext(') && text.includes('latencyHint') && text.includes('decodeAudioData')) audio.add(node.id.name);
      });
      const preloads = [];
      walk(trees.initial, node => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.computed ||
            node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'window' || node.callee.property.name !== 'setTimeout') return;
        const [callback, delay] = node.arguments;
        if (node.arguments.length !== 2 || delay.type !== 'Literal' || delay.value !== 0 || callback.type !== 'ArrowFunctionExpression') return;
        const statements = callback.body.type === 'BlockStatement' ? callback.body.body : [];
        const attempt = statements.length === 1 && statements[0].type === 'TryStatement' ? statements[0].block.body : [];
        const call = attempt.length === 1 && attempt[0].type === 'ExpressionStatement' ? attempt[0].expression : null;
        if (call?.type === 'CallExpression' && call.arguments.length === 0 && call.callee.type === 'Identifier' && audio.has(call.callee.name)) {
          preloads.push(node);
        }
      });
      record('deferDictationCues', 'initial', preloads, node => ({ start: node.start, end: node.end, text: `${marker}void 0` }));

      // g = async input => { let t = await fetchBootstrap(input, attempts);
      //   try { let c = new X.StatsigClient(key, t.user, options); return c.dataAdapter.setData(t.statsigPayload), ..., c } catch ... }
      const bootstraps = [];
      walk(trees.initial, (node, ancestors) => {
        if (node.type !== 'ArrowFunctionExpression' || !node.async || node.params.length !== 1 || node.params[0].type !== 'Identifier' ||
            node.body.type !== 'BlockStatement' || node.body.body.length !== 2) return;
        const [declaration, attempt] = node.body.body;
        if (declaration.type !== 'VariableDeclaration' || declaration.declarations.length !== 1 || attempt.type !== 'TryStatement') return;
        const [declarator] = declaration.declarations;
        const fetch = declarator.init?.type === 'AwaitExpression' ? declarator.init.argument : null;
        if (declarator.id.type !== 'Identifier' || fetch?.type !== 'CallExpression' || fetch.callee.type !== 'Identifier') return;
        const result = declarator.id.name, tryText = sources.initial.slice(attempt.start, attempt.end);
        if (!tryText.includes('.StatsigClient(') || !tryText.includes(`${result}.user`) || !tryText.includes(`.dataAdapter.setData(${result}.statsigPayload)`)) return;
        const owner = [...ancestors].reverse().find(a => a.type === 'FunctionDeclaration');
        if (!owner || !sources.initial.slice(owner.start, owner.end).includes('CodexStatsigProvider.sync')) return;
        const props = owner.body.body[0]?.type === 'VariableDeclaration' ? owner.body.body[0].declarations
          .find(d => d.id.type === 'ObjectPattern' && d.init?.type === 'Identifier' && d.init.name === owner.params[0]?.name) : null;
        const named = new Map((props?.id.properties ?? []).filter(p => p.type === 'Property' && !p.computed && p.value.type === 'Identifier')
          .map(p => [p.key.name || p.key.value, p.value.name]));
        if (!['auth', 'appVersion', 'statsigClientKey', 'stableId'].every(key => named.has(key))) return;
        bootstraps.push({ node, input: node.params[0].name, result, fetch: sources.initial.slice(fetch.start, fetch.end), tryText, named });
      });
      record('statsigBootstrapCacheFirst', 'initial', bootstraps, ({ node, input, result, fetch, tryText, named }) => {
        // ChatGPT sign-ins fill userId only after the account lookup, so the
        // identity takes the first user identifier available, plus account
        // and email; with neither a user identifier nor an email, no caching.
        const auth = named.get('auth');
        const who = `(${auth}?.userId??${auth}?.authenticatedUserId??${auth}?.accountUserId??null)`;
        const id = `JSON.stringify([${named.get('statsigClientKey')},${named.get('appVersion')},${named.get('stableId')}??null,${auth}?.authMethod??null,` +
          `${who},${auth}?.accountId??${auth}?.authenticatedAccountId??null,${auth}?.email??null])`;
        const known = `(${who}!=null||${auth}?.email!=null)`;
        // globalThis.__codexPPStartup.statsigBootstrap records what happened,
        // for traced launches: hit, miss, no-identity, saved, or an error.
        // The payload is megabytes, beyond localStorage's quota: keep it in
        // IndexedDB (database codexpp-startup, store kv).
        const idb = `ppStore=(ppMode,ppWork)=>new Promise((ppDone,ppFail)=>{const ppOpen=indexedDB.open("codexpp-startup",1);` +
          `ppOpen.onupgradeneeded=()=>ppOpen.result.createObjectStore("kv");ppOpen.onerror=()=>ppFail(ppOpen.error);` +
          `ppOpen.onsuccess=()=>{const ppDb=ppOpen.result,ppTx=ppDb.transaction("kv",ppMode),ppReq=ppWork(ppTx.objectStore("kv"));` +
          `ppTx.oncomplete=()=>{ppDb.close();ppDone(ppReq?.result??null)};ppTx.onerror=ppTx.onabort=()=>{ppDb.close();ppFail(ppTx.error)}}})`;
        return { start: node.start, end: node.end, text: `${marker}async ${input}=>{const ppKey="statsigBootstrap.v1",ppId=${id},` +
          `ppNote=ppState=>{try{((globalThis.__codexPPStartup??={}).statsigBootstrap??=[]).push(ppState)}catch{}},${idb},` +
          `ppFetch=${fetch},ppBuild=${result}=>{${tryText}},` +
          `ppSave=${result}=>{if(!${known}||${result}?.statsigPayload==null)return ppNote("not-saved");` +
          `ppStore("readwrite",ppKv=>ppKv.put({id:ppId,user:${result}.user,statsigPayload:${result}.statsigPayload},ppKey))` +
          `.then(()=>ppNote("saved"),ppError=>ppNote("save-error:"+ppError?.name))};` +
          // The fetch runs during the cache read; mark its rejection handled
          // so a fast failure is not reported as unhandled before the await.
          `ppFetch.catch(()=>{});let ppHit=null;try{const ppStored=${known}?await ppStore("readonly",ppKv=>ppKv.get(ppKey)):null;ppHit=ppStored?.id===ppId?ppStored:null;` +
          `ppNote(ppHit?"hit":!${known}?"no-identity":ppStored?"stale":"miss")}catch(ppError){ppNote("read-error:"+ppError?.name)}` +
          `if(ppHit){let ppClient=null;try{ppClient=ppBuild(ppHit)}catch{ppNote("cache-unusable");ppStore("readwrite",ppKv=>ppKv.delete(ppKey)).catch(()=>{})}` +
          `if(ppClient){ppFetch.then(${result}=>{ppSave(${result});try{ppClient.dataAdapter.setData(${result}.statsigPayload),ppClient.updateUserSync(${result}.user)}catch{}},()=>{});return ppClient}}` +
          `const ${result}=await ppFetch;ppSave(${result});return ppBuild(${result})}` };
      });

      // if (auth.isLoading || appInfoLoading || platformLoading || clientLoading) { ...return <Indicator/> }
      const appGates = [];
      walk(trees.initial, node => {
        if (node.type !== 'IfStatement' || node.consequent.type !== 'BlockStatement') return;
        const flags = [];
        for (let test = node.test; test.type === 'LogicalExpression' && test.operator === '||'; test = test.left) flags.unshift(test.right);
        let first = node.test; while (first.type === 'LogicalExpression') first = first.left;
        flags.unshift(first);
        if (flags.length !== 4 || flags[0].type !== 'MemberExpression' || flags[0].property.name !== 'isLoading' || !flags.slice(1).every(f => f.type === 'Identifier')) return;
        const body = sources.initial.slice(node.consequent.start, node.consequent.end);
        if (!/jsx\)\([A-Za-z_$][\w$]*,\{\}\)/.test(body)) return;
        appGates.push({ node, flags: flags.map(f => sources.initial.slice(f.start, f.end)) });
      });
      record('appGateReasons', 'initial', appGates, ({ node, flags }) => ({ start: node.consequent.start + 1, end: node.consequent.start + 1,
        text: `${marker}try{const ppLog=(globalThis.__codexPPStartup??={}).appGate??=[],ppNow=[${flags.map(f => `!!(${f})`).join(',')}];` +
          `JSON.stringify(ppLog.at(-1)?.[1])!==JSON.stringify(ppNow)&&ppLog.length<50&&ppLog.push([performance.now(),ppNow])}catch{}` }));

      // First statement of the initial bundle: learned preload of startup chunks.
      const firstStatement = trees.initial.body.find(statement => statement.type !== 'ImportDeclaration');
      if (firstStatement && applied.chunkTimings) {
        edits.initial.push({ start: firstStatement.start, end: firstStatement.start, text: `${marker}(()=>{try{` +
          `const ppKey="codexpp.startupChunks.v2:"+import.meta.url;let ppList=null;try{ppList=JSON.parse(localStorage.getItem(ppKey)??"null")}catch{}` +
          `if(Array.isArray(ppList))for(const ppName of ppList.slice(0,40)){if(typeof ppName!=="string"||!/^\\.\\/[\\w.-]+\\.js$/.test(ppName))continue;` +
          `const ppLink=document.createElement("link");ppLink.rel="modulepreload";ppLink.crossOrigin="";ppLink.href=new URL(ppName,import.meta.url).href;document.head.append(ppLink)}` +
          `setTimeout(()=>{try{const ppSeen=[...new Set((globalThis.__codexPPStartup?.chunks??[]).filter(ppChunk=>ppChunk[1]<1500).map(ppChunk=>ppChunk[0]))].slice(0,40);` +
          `ppSeen.length&&localStorage.setItem(ppKey,JSON.stringify(ppSeen))}catch{}},8e3)}catch{}})();` });
        applied.learnedStartupPreload = 'initial';
      } else skipped.learnedStartupPreload = trees.initial ? 'needs chunkTimings' : 'module not found';

      // function Indicator(e){let t=...,{variant:a,debugName:o,startupIndicator:s,...}=e; ...}
      const indicators = [];
      walk(trees.initial, node => {
        if (node.type !== 'FunctionDeclaration' || node.params.length !== 1 || node.params[0].type !== 'Identifier') return;
        const first = node.body.body[0];
        if (first?.type !== 'VariableDeclaration') return;
        for (const declarator of first.declarations) {
          if (declarator.id.type !== 'ObjectPattern' || declarator.init?.type !== 'Identifier' || declarator.init.name !== node.params[0].name) continue;
          const named = new Map(declarator.id.properties.filter(p => p.type === 'Property' && !p.computed && p.value.type === 'Identifier')
            .map(p => [p.key.name || p.key.value, p.value.name]));
          if (!(named.has('debugName') && named.has('variant') && named.has('startupIndicator'))) continue;
          // The component's own React namespace, from its useState call.
          let react = null;
          walk(node.body, call => {
            if (react == null && call.type === 'CallExpression' && call.callee.type === 'SequenceExpression' &&
                call.callee.expressions.length === 2 && call.callee.expressions[1].type === 'MemberExpression' &&
                call.callee.expressions[1].object.type === 'Identifier' && call.callee.expressions[1].property.name === 'useState') {
              react = call.callee.expressions[1].object.name;
            }
          });
          if (react) indicators.push({ first, name: named.get('debugName'), react });
        }
      });
      record('loadingGateTimings', 'initial', indicators, ({ first, name, react }) => ({ start: first.end, end: first.end,
        text: `${marker}(0,${react}.useEffect)(()=>{const k=String(${name}),g=globalThis.__codexPPGates??={},r=g[k]??=[performance.now(),null];` +
          `return()=>{r[1]=performance.now()}},[]);` }));
    } else {
      skipped.statsigUserCacheFirst = 'module not found';
      skipped.deferDictationCues = 'module not found';
      skipped.loadingGateTimings = 'module not found';
      skipped.statsigBootstrapCacheFirst = 'module not found';
    }

    if (trees.main) {
      const src = sources.main, gates = [];
      walk(trees.main, node => {
        if (node.type !== 'FunctionDeclaration' || !node.async || node.params.length !== 1 || node.params[0].type !== 'ObjectPattern') return;
        const body = src.slice(node.body.start, node.body.end);
        if (!body.includes('`codex_desktop_secret_auth_storage`') || !body.includes('`features.secret_auth_storage=true`')) return;
        const keys = new Set(node.params[0].properties.map(p => p.key?.name));
        if (!['stableId', 'platform', 'appVersion'].every(k => keys.has(k))) return;
        const recognised = body.indexOf('`Network:Recognized`');
        const test = /return ([A-Za-z_$][\w$]*)\.success&&/.exec(body);
        if (recognised < 0 || !test || test.index > recognised) return;
        gates.push({ node, body, testStart: test.index + 'return '.length, recognisedEnd: recognised + '`Network:Recognized`'.length });
      });
      record('authStorageGateCacheFirst', 'main', gates, ({ node, body, testStart, recognisedEnd }) => {
        const inner = body.slice(0, testStart) + '(ppNetwork=' + body.slice(testStart, recognisedEnd) + ')' + body.slice(recognisedEnd);
        const params = src.slice(node.params[0].start, node.params[0].end);
        return { start: node.params[0].start, end: node.end, text: `${marker}ppArgs){let ppNetwork=!1;const ppFs=require("fs"),` +
          `ppFile=require("path").join(require("electron").app.getPath("userData"),"codexpp-auth-storage-gate.json"),` +
          `ppKey=JSON.stringify([ppArgs?.appVersion??null,ppArgs?.stableId??null,ppArgs?.platform??null]),` +
          `ppFresh=(async(${params})=>${inner})(ppArgs).then(ppOverrides=>{try{ppNetwork&&Array.isArray(ppOverrides)&&` +
          `ppFs.writeFileSync(ppFile,JSON.stringify({key:ppKey,overrides:ppOverrides}),{mode:0o600})}catch{}return ppOverrides});` +
          `let ppCached=null;try{ppCached=JSON.parse(ppFs.readFileSync(ppFile,"utf8"))}catch{}` +
          `if(ppCached?.key===ppKey&&Array.isArray(ppCached.overrides)&&ppCached.overrides.every(ppItem=>ppItem==="features.secret_auth_storage=true")){` +
          `ppFresh.catch(()=>{});(globalThis.__codexPPStartupMain??={}).authStorageGate="cached";return ppCached.overrides}return ppFresh}` };
      });
      // let L = () => { if (!mac) return; let e = pref(); I(e), loadIcon({preference: e, resourceName: ...}).then(...) }; if (mac) { L(); ... }
      const docks = [];
      const dockFns = new Set();
      walk(trees.main, node => {
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'ArrowFunctionExpression' && node.init.params.length === 0) {
          const text = src.slice(node.init.start, node.init.end);
          if (text.includes('{preference:') && text.includes('resourceName:') && text.includes('.then(')) dockFns.add(node.id.name);
        }
      });
      walk(trees.main, node => {
        if (node.type !== 'IfStatement' || node.consequent.type !== 'BlockStatement') return;
        const first = node.consequent.body[0];
        const call = first?.type === 'ExpressionStatement' ? first.expression : null;
        if (call?.type === 'CallExpression' && call.arguments.length === 0 && call.callee.type === 'Identifier' && dockFns.has(call.callee.name) &&
            src.slice(node.start, node.end).includes('nativeTheme')) docks.push({ call });
      });
      record('deferDockIcon', 'main', docks, ({ call }) => ({ start: call.start, end: call.end, text: `${marker}setTimeout(${call.callee.name},3e3)` }));
    } else {
      skipped.authStorageGateCacheFirst = 'module not found';
      skipped.deferDockIcon = 'module not found';
    }

    if (trees.requirements) {
      const src = sources.requirements, phases = [];
      walk(trees.requirements, node => {
        if (node.type !== 'FunctionDeclaration' || !node.async || node.params.length !== 0) return;
        const body = src.slice(node.start, node.end);
        if (!body.includes('`policy-read`') || !body.includes('`node-permissions`') || !body.includes('`policy-validation`')) return;
        const first = node.body.body[0];
        let request = null, validate = null;
        walk(node.body, inner => {
          if (inner.type === 'VariableDeclarator' && inner.id.type === 'ObjectPattern' && inner.init?.type === 'AwaitExpression' && inner.init.argument.type === 'CallExpression') {
            const keys = new Set(inner.id.properties.map(p => p.key?.name));
            if (keys.has('appServerVersion') && keys.has('response')) request = inner.init;
          }
          if (request && inner.type === 'VariableDeclarator' && inner.id.type === 'Identifier' && inner.init?.type === 'CallExpression' &&
              inner.init.callee.type === 'Identifier' && inner.init.arguments.length === 2 && inner.init.start > request.end && !validate) validate = inner;
        });
        let load = null, mkdir = null;
        walk(node.body, inner => {
          // await (0, fs.mkdir)(home, {recursive: !0})
          if (!mkdir && inner.type === 'AwaitExpression' && inner.argument.type === 'CallExpression' && inner.argument.arguments.length === 2 &&
              /^0,[A-Za-z_$][\w$]*\.mkdir$/.test(body.slice(inner.argument.callee.start - node.start, inner.argument.callee.end - node.start)) &&
              /^\{recursive:!0\}$/.test(body.slice(inner.argument.arguments[1].start - node.start, inner.argument.arguments[1].end - node.start))) mkdir = inner;
        });
        walk(first ?? node.body, inner => {
          if (!load && inner.type === 'AwaitExpression' && inner.argument.type === 'CallExpression' && inner.argument.arguments.length === 0 &&
              inner.argument.callee.type === 'Identifier') load = inner;
        });
        const electron = /([A-Za-z_$][\w$]*)\.app\.getVersion\(\)/.exec(body)?.[1];
        if (first?.type === 'ExpressionStatement' && request && validate) phases.push({ node, first, request, validate, load, electron, mkdir });
      });
      const mark = name => `((globalThis.__codexPPStartupMain??={}).policy??={})[${JSON.stringify(name)}]=performance.now()`;
      record('policyPhaseTimings', 'requirements', phases, ({ node }) => ({ start: node.body.start + 1, end: node.body.start + 1, text: `${marker}${mark('entry')};` }));
      if (phases.length === 1 && phases[0].load && phases[0].electron) {
        const { load, electron } = phases[0];
        const volatile = '/^(SHLVL|_|PWD|OLDPWD|TMPDIR|TERM_SESSION_ID|SECURITYSESSIONID|SSH_AUTH_SOCK|__CF_USER_TEXT_ENCODING|COMMAND_MODE|XPC_[A-Z_]+|LaunchInstanceID)$/';
        const sensitive = '/(KEY|TOKEN|SECRET|PASS|AUTH|CREDENTIAL|COOKIE|SESSION|PRIVATE)/i';
        edits.requirements.push({ start: load.start, end: load.end, text: `${marker}await(async ppLoad=>{const ppFs=require("fs"),` +
          `ppFile=require("path").join(${electron}.app.getPath("userData"),"codexpp-shell-environment.json"),ppBefore={...process.env},` +
          `ppSave=ppSavedAt=>{try{const ppEnv={},ppSensitive=[];for(const[ppName,ppValue]of Object.entries(process.env)){if(ppBefore[ppName]===ppValue||${volatile}.test(ppName))continue;` +
          `${sensitive}.test(ppName)?ppSensitive.push(ppName):ppEnv[ppName]=ppValue}ppFs.writeFileSync(ppFile,JSON.stringify({env:ppEnv,sensitive:ppSensitive.length>0,savedAt:ppSavedAt}),{mode:0o600})}catch{}};` +
          `let ppCached=null;try{ppCached=JSON.parse(ppFs.readFileSync(ppFile,"utf8"))}catch{}` +
          // A blocking load at least weekly drops variables removed from the
          // shell's configuration (background saves keep the old timestamp).
          `if(ppCached?.sensitive!==!1||typeof ppCached.env!=="object"||!(Date.now()-ppCached.savedAt<6048e5)){const ppResult=await ppLoad();ppSave(Date.now());return ppResult}` +
          // Start the real load first: it spawns the shell with the launch environment.
          `const ppPending=ppLoad();Object.assign(process.env,ppCached.env);(globalThis.__codexPPStartupMain??={}).shellEnvironment="cached";` +
          `void ppPending.then(()=>ppSave(ppCached.savedAt),()=>{})})(${src.slice(load.argument.callee.start, load.argument.callee.end)})` });
        applied.shellEnvironmentCacheFirst = 'requirements';
        const { mkdir } = phases[0];
        if (mkdir) edits.requirements.push({ start: mkdir.start, end: mkdir.end,
          text: `${marker}(require("fs").mkdirSync(${src.slice(mkdir.argument.arguments[0].start, mkdir.argument.arguments[0].end)},{recursive:!0}),void 0)` });
      } else if (trees.requirements) skipped.shellEnvironmentCacheFirst = 'shell environment load not found';
      if (phases.length === 1) {
        const { first, request, validate } = phases[0];
        edits.requirements.push({ start: first.end, end: first.end, text: `${marker}${mark('environment')};` });
        edits.requirements.push({ start: request.start, end: request.start, text: `${marker}(${mark('policy-read')},0)||` });
        edits.requirements.push({ start: validate.end, end: validate.end, text: `,ppPhase=(${mark('policy-validated')})` });
      }
    } else skipped.policyPhaseTimings = 'module not found';

    if (typeof input.html === 'string' && typeof input.entry === 'string') {
      const html = input.html;
      const list = /const __vite__mapDeps=.*?m\.f\|\|\(m\.f=(\[[^\]]*\])/.exec(input.entry)?.[1];
      let deps = null;
      try { deps = JSON.parse(list); } catch {}
      const anchor = html.lastIndexOf('<link rel="modulepreload"');
      if (html.includes('codexpp:startup')) throw new Error('Startup fast path already applied.');
      if (!Array.isArray(deps) || !deps.every(d => typeof d === 'string' && /^\.\/[\w.-]+\.(js|css)$/.test(d)) || anchor < 0) {
        skipped.entryPreload = 'entry dependency list not recognised';
      } else {
        const lineEnd = html.indexOf('>', anchor) + 1;
        const links = deps.filter(d => !html.includes(`assets/${d.slice(2)}"`)).map(d => d.endsWith('.css')
          ? `<link rel="preload" as="style" crossorigin href="./assets/${d.slice(2)}">`
          : `<link rel="modulepreload" crossorigin href="./assets/${d.slice(2)}">`);
        if (links.length) {
          result_html = html.slice(0, lineEnd) + `\n    <!--codexpp:startup-->` + links.map(l => `\n    ${l}`).join('') + html.slice(lineEnd);
          applied.entryPreload = 'html';
        } else skipped.entryPreload = 'nothing to preload';
      }
    }

    const result = { applied, skipped };
    if (result_html) result.html = result_html;
    for (const [file, list] of Object.entries(edits)) {
      if (!list.length) continue;
      let source = sources[file];
      for (const edit of list.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
      parse(source);
      result[file] = source;
    }
    return result;
  }
});
