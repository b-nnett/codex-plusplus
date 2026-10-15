// Shared harness for the startup adapter tests: loads Acorn and the adapter
// into one VM context and runs it on a fixture input.
import vm from 'node:vm';
import fs from 'node:fs';

const load = name => fs.readFileSync(new URL(`../Sources/CodexPPCore/Resources/${name}.js`, import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(load('acorn'), context);
vm.runInContext(load('startup-adapter'), context);
// Development builds apply the diagnostic edits too; release builds pass diagnostics: false.
export const adapt = input => { context.input = {diagnostics: true, ...input}; return JSON.parse(JSON.stringify(vm.runInContext('CodexPPStartupAdapter.adapt(input)', context))); };
