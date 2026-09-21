const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  const localRequire = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), `${name}.ts`)) : require(name);
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports);
  return mod.exports;
}
const { getNavigationLinks, getFlatNavItems } = load(path.resolve(__dirname, '../lib/config/navigation.ts'));
test('all existing mentee destinations remain searchable after grouping', () => {
  const routes = getFlatNavItems('mentee').map(item => item.path);
  for (const page of ['dashboard', 'tasks', 'roadmap', 'meetings', 'messages', 'daily-log', 'blockers', 'progress', 'gamification', 'certificates', 'community', 'announcements', 'library', 'settings']) {
    assert.equal(routes.filter(route => route === `/mentee/${page}`).length, 1, page);
  }
});
test('every tab highlights one sidebar entry and points to an existing page', () => {
  const links = getNavigationLinks('mentee');
  for (const item of getFlatNavItems('mentee')) {
    assert.equal(links.filter(link => link.path === item.path || link.activePaths?.includes(item.path)).length, 1, item.path);
    assert.ok(fs.existsSync(path.resolve(__dirname, `../app${item.path}/page.tsx`)), item.path);
  }
});
