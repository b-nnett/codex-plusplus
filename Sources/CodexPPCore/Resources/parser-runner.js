'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const [adapter, request, output, requestedTimeout = '55000'] = process.argv.slice(2);
const timeout = Number(requestedTimeout);
if (!/^\d+$/.test(requestedTimeout) || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 175000) throw Error('Invalid parser deadline.');
if (!['settings', 'bookmarks', 'shell', 'browser', 'sidebar', 'startup'].includes(adapter)) throw Error('Unknown parser adapter.');
const input = JSON.parse(fs.readFileSync(request, 'utf8'));
const context = vm.createContext({});
for (const name of ['acorn', `${adapter}-adapter`]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8'), context, {filename: name});
}
context.input = input;
const calls = {
  settings: 'CodexPPSettingsAdapter.adapt(input)',
  bookmarks: 'CodexPPBookmarksAdapter.adapt(input.modules,input.runtime)',
  shell: 'CodexPPShellAdapter.adapt(input.source,input.runtime)',
  browser: 'CodexPPBrowserAdapter.adapt(input.source)',
  sidebar: 'input.modules ? CodexPPSidebarAdapter.adaptModules(input.modules) : CodexPPSidebarAdapter.adapt(input.source)',
  startup: 'CodexPPStartupAdapter.adapt(input)'
};
const result = vm.runInContext(calls[adapter], context, {timeout});
fs.writeFileSync(output, JSON.stringify(result));
