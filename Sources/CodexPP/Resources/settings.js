(() => {
  if (globalThis.__codexPPNativeSettings) {
    if (globalThis.__codexPPSettings?.native) return;
    globalThis.__codexPPSettings?.stop();
    globalThis.__codexPPSettings = { native: true, update(value) { globalThis.__codexPPNativeSettings.update(value); }, stop() { delete globalThis.__codexPPSettings; } };
    return;
  }
  if (globalThis.__codexPPSettings) return;
  let snapshot = { extensions: [], extensionsPaused: false, intent: 0 };
  let nav, group, button, panel, nativePanel, oldHidden, active = false, seenIntent = 0;
  let scheduled = false, stopped = false, lastRendered;
  const element = (tag, text, attributes = {}) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const command = async (action, extra = {}) => {
    try {
      snapshot = await globalThis.__codexPPBridge.request(action, extra);
      lastRendered = undefined;
      render();
    } catch (error) {
      if (panel) {
        lastRendered = undefined;
        render();
        panel.querySelector('[role="alert"]')?.remove();
        panel.append(element('p', String(error.message || error), { role: 'alert' }));
      }
    }
  };
  function restore() {
    if (nativePanel) nativePanel.hidden = oldHidden;
    panel?.remove(); panel = null; nativePanel = null; active = false;
    button?.removeAttribute('aria-current');
  }
  function contentFor(sidebar) {
    const explicit = document.querySelector('[data-settings-content], [data-settings-panel-content]');
    if (explicit && !explicit.contains(sidebar)) return explicit;
    // The current native layout wraps its navigation and scrolling content in
    // sibling branches. Require content semantics and dimensions before hiding.
    let branch = sidebar;
    for (let depth = 0; depth < 6 && branch.parentElement; depth++, branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || sibling.contains(sidebar) || sibling === panel) continue;
        const bounds = sibling.getBoundingClientRect();
        if (bounds.width >= 240 && bounds.height >= 120 &&
            (sibling.matches('main,section,[role="main"],[role="tabpanel"]') || sibling.querySelector('h1,h2,[role="main"]'))) return sibling;
      }
    }
    return null;
  }
  function select() {
    if (!nav) return;
    if (!active) {
      nativePanel = contentFor(nav);
      if (!nativePanel) return; // Preserve the native page if its layout changes.
      oldHidden = nativePanel.hidden;
      nativePanel.hidden = true;
      panel = element('section', null, { 'data-codexpp-settings-content': '', 'aria-label': 'Extensions' });
      panel.style.cssText = 'flex:1;min-width:0;overflow:auto;padding:24px 32px;font:inherit;color:inherit';
      nativePanel.after(panel);
      active = true;
      button.setAttribute('aria-current', 'page');
    }
    render();
  }
  function render() {
    if (!panel) return;
    const fingerprint = JSON.stringify(snapshot);
    if (lastRendered === fingerprint && panel.hasChildNodes()) return;
    lastRendered = fingerprint;
    panel.replaceChildren();
    const header = element('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:24px';
    const heading = element('h1', 'Extensions'); heading.style.cssText = 'font-size:20px;font-weight:600;margin:0';
    const install = element('button', 'Install Extension…', { type: 'button' });
    install.addEventListener('click', () => command('install'));
    const controls = element('div');
    controls.style.cssText = 'display:flex;gap:12px';
    const pause = element('button', snapshot.extensionsPaused ? 'Resume Extensions' : 'Pause Extensions', { type: 'button' });
    pause.addEventListener('click', () => command(snapshot.extensionsPaused ? 'resume' : 'pause'));
    controls.append(pause, install);
    header.append(heading, controls); panel.append(header);
    if (snapshot.extensionsPaused) {
      panel.append(element('p', 'Extensions are paused.'));
    }
    if (!snapshot.extensions.length) panel.append(element('p', 'No extensions installed.'));
    for (const extension of snapshot.extensions) {
      const row = element('div');
      row.dataset.extensionId = extension.id;
      row.tabIndex = -1;
      row.style.cssText = 'display:flex;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--color-token-border,rgba(128,128,128,.2))';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 16 16');
      icon.setAttribute('width', '24'); icon.setAttribute('height', '24');
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = 'flex-shrink:0;fill:currentColor;opacity:.7';
      for (const [x, y, size] of [[1,9,6],[9,9,6],[1,1,6],[10,2,4]]) {
        const tile = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        for (const [key, value] of Object.entries({x,y,width:size,height:size,rx:1.5})) tile.setAttribute(key, value);
        icon.append(tile);
      }
      const info = element('div'); info.style.cssText = 'flex:1;min-width:0';
      info.append(element('div', extension.name));
      const detail = element('div', extension.description || extension.version); detail.style.cssText = 'opacity:.65;font-size:12px;margin-top:4px'; info.append(detail);
      if (extension.error) info.append(element('p', extension.error, { role: 'alert' }));
      const toggle = element('input', null, { type: 'checkbox', 'aria-label': `Enable ${extension.name}` });
      toggle.checked = extension.enabled;
      toggle.addEventListener('change', () => { toggle.disabled = true; command('set-enabled', { extensionId: extension.id, enabled: toggle.checked }); });
      const remove = element('button', 'Remove', { type: 'button', 'aria-label': `Remove ${extension.name}` });
      remove.addEventListener('click', () => command('remove', { extensionId: extension.id }));
      row.append(icon, info, toggle, remove); panel.append(row);
    }
    const folder = element('button', 'Open Extensions Folder', { type: 'button' }); folder.style.marginTop = '20px';
    folder.addEventListener('click', () => command('folder')); panel.append(folder);
  }
  function discover() {
    if (stopped) return;
    if (active && !nativePanel?.isConnected) restore();
    const found = document.querySelector('nav.sidebar-navigation');
    if (!found || !found.querySelector('[data-settings-panel-slug]')) {
      if (nav) { restore(); group?.remove(); nav = group = button = null; }
      return;
    }
    if (found !== nav || !group?.isConnected) {
      nav?.removeEventListener('click', nativeSelection, true);
      restore(); group?.remove(); nav = found;
      group = element('div', null, { 'data-codexpp-settings-nav': '' });
      const label = element('div', 'Codex++'); label.style.cssText = 'font-size:12px;opacity:.55;padding:12px 8px 4px';
      button = element('button', 'Extensions', { type: 'button', 'data-settings-panel-slug': 'codexpp-extensions' });
      button.className = nav.querySelector('[data-settings-panel-slug]').className;
      button.addEventListener('click', select);
      group.append(label, button);
      (nav.querySelector('.overflow-y-auto') || nav).append(group);
      nav.addEventListener('click', nativeSelection, true);
    }
    if (snapshot.intent > seenIntent && contentFor(nav)) {
      seenIntent = snapshot.intent; select();
      const selected = Array.from(panel?.querySelectorAll('[data-extension-id]') || []).find(row => row.dataset.extensionId === snapshot.selectedExtensionId);
      if (selected) { selected.scrollIntoView({ block: 'center' }); selected.focus({ preventScroll: true }); }
    }
  }
  function nativeSelection(event) {
    if (!group?.contains(event.target) && event.target.closest('[data-settings-panel-slug]')) restore();
  }
  const observer = new MutationObserver(() => {
    if (scheduled || stopped) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; discover(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  globalThis.__codexPPSettings = {
    update(value) { snapshot = value; discover(); if (active) render(); },
    stop() {
      stopped = true; observer.disconnect(); nav?.removeEventListener('click', nativeSelection, true);
      restore(); group?.remove(); delete globalThis.__codexPPSettings;
    }
  };
  discover();
})();
