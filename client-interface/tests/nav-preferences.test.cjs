const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/config/navPreferences.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}});
const mod = {exports: {}};
new Function('exports', 'module', compiled.outputText)(mod.exports, mod);
const {applyNavPrefs} = mod.exports;
const links = ['/home', '/work', '/messages'].map(path => ({path, name:path}));
const usage = {'/messages': {score:100, last:1000}};
test('default and legacy preferences never reorder from usage', () => {
  for (const prefs of [undefined, {order:[], pinned:[]}, {order:[], pinned:[], manual:false}]) {
    assert.deepEqual(applyNavPrefs(links, prefs, usage, 1000), links);
  }
});
test('automatic ordering requires explicit opt-in', () => {
  assert.equal(applyNavPrefs(links, {order:[], pinned:[], adaptive:true}, usage, 1000)[0].path, '/messages');
});
test('manual ordering and pins remain respected', () => {
  const result = applyNavPrefs(links, {order:['/work','/home','/messages'], pinned:['/home'], manual:true}, usage, 1000);
  assert.deepEqual(result.map(link => link.path), ['/home','/work','/messages']);
});
