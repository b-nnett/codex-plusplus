(() => {
  if (globalThis.__codexPPNativeSettings) return;
  let snapshot = { extensions: [], extensionsPaused: false, intent: 0 };
  let fingerprint = '', navigate, seenIntent = 0;
  const listeners = new Set();
  function consumeIntent() {
    if (navigate && snapshot.intent > seenIntent) {
      seenIntent = snapshot.intent;
      navigate('/settings/codexpp-extensions');
    }
  }
  function icon(jsx) {
    return jsx.jsx('svg', { viewBox: '0 0 16 16', width: 20, height: 20, fill: 'currentColor', 'aria-hidden': true,
      children: [[1,9,6],[9,9,6],[1,1,6],[10,2,4]].map(([x,y,size], index) => jsx.jsx('rect', { x,y,width:size,height:size,rx:1.5 }, index)) });
  }
  function Page({ React, value, components }) {
    const { Page: SettingsPage, Title, Section, Card, Row, Toggle, Button } = components;
    const h = React.createElement;
    const [error, setError] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    React.useEffect(() => {
      const row = Array.from(document.querySelectorAll('[data-codexpp-extension-id]')).find(node => node.dataset.codexppExtensionId === value.selectedExtensionId);
      if (row) { row.scrollIntoView({ block: 'center' }); row.focus({ preventScroll: true }); }
    }, [value.intent, value.selectedExtensionId]);
    async function command(action, extra = {}) {
      setBusy(true); setError(null);
      try {
        const bridge = globalThis.__codexPPBridge;
        if (!bridge) throw Error('Open the Codex++ menu bar helper to manage Extensions.');
        globalThis.__codexPPNativeSettings.update(await bridge.request(action, extra));
      } catch (error) { setError(error.message || String(error)); }
      finally { setBusy(false); }
    }
    const button = (label, action, extra, props = {}) => h(Button, { disabled: busy, onClick: () => command(action, extra), color: 'secondary', size: 'compact', ...props }, label);
    const extensionIcon = h('svg', { width:20, height:20, viewBox:'0 0 16 16', fill:'currentColor', 'aria-hidden':true }, ...[[1,9,6],[9,9,6],[1,1,6],[10,2,4]].map(([x,y,size], key) => h('rect',{key,x,y,width:size,height:size,rx:1.5})));
    return h(SettingsPage, { title: h(Title, { slug: 'codexpp-extensions' }), 'data-codexpp-native-page': '' },
      error && h('p', { role:'alert', className:'text-sm text-danger' }, error),
      h(Section, null,
        h(Section.Header, { title:'Extensions' }),
        h(Section.Content, null,
          h(Card, null,
            h(Row, { label:'Enable Extensions', description: value.extensionsPaused ? 'Extensions are paused.' : undefined,
              control: props => h(Toggle, { ...props, checked:!value.extensionsPaused, disabled:busy, onChange: enabled => command(enabled ? 'resume' : 'pause') }) }),
            h(Row, { label:'Install Extension', control:button('Install…', 'install') }),
            h(Row, { label:'Extensions folder', control:button('Open in Finder', 'folder') })))),
      h(Section, null,
        h(Section.Header, { title:'Installed Extensions' }),
        h(Section.Content, null,
          h(Card, null,
            !value.extensions.length && h(Row, { label:'No extensions installed.' }),
            ...value.extensions.map(extension => h('div', { key:extension.id, tabIndex:-1, 'data-codexpp-extension-id':extension.id },
              h(Row, { label:extension.name, icon:extensionIcon, description:extension.description || extension.version,
                control: props => h(React.Fragment, null,
                  button('Remove','remove',{extensionId:extension.id},{'aria-label':`Remove ${extension.name}`,color:'ghostSecondary'}),
                  h(Toggle, { ...props, checked:extension.enabled, disabled:busy, onChange:enabled=>command('set-enabled',{extensionId:extension.id,enabled}) })) }),
              extension.error && h('p',{role:'alert',className:'px-4 pb-3 text-sm text-danger'},extension.error)))))));
  }

  globalThis.__codexPPNativeSettings = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    attachNavigate(handler) { navigate = handler; consumeIntent(); return () => { if (navigate === handler) navigate = undefined; }; },
    update(value) {
      const next = JSON.stringify(value);
      if (next !== fingerprint) { snapshot = value; fingerprint = next; for (const listener of listeners) listener(); }
      consumeIntent();
    },
    render: (React, value, components) => React.createElement(Page, { React, value, components }),
    icon
  };
})();
