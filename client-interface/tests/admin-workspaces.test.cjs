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

const { adminWorkspaces, matchesAdminTab } = load(path.resolve(__dirname, '../lib/config/adminWorkspaces.ts'));
const { getFlatNavItems } = load(path.resolve(__dirname, '../lib/config/navigation.ts'));
const { filterClanQueue, CLAN_PAGE_SIZE } = load(path.resolve(__dirname, '../lib/utils/admin-clan-queue.ts'));
test('workspace routes exist, are unique and retain permissions', () => {
  const navigation = getFlatNavItems('admin');
  const tabs = adminWorkspaces.flatMap(group => group.tabs);
  assert.equal(new Set(tabs.map(tab => tab.href)).size, tabs.length);
  for (const tab of tabs) {
    assert.ok(fs.existsSync(path.resolve(__dirname, `../app${tab.href}/page.tsx`)), tab.href);
    assert.equal(navigation.find(item => item.path === tab.href)?.permission, tab.permission);
    assert.equal(adminWorkspaces.filter(group => group.tabs.some(item => matchesAdminTab(tab.href, item.href))).length, 1);
  }
});
test('detail pages retain their workspace', () => {
  for (const [page, tab] of [['/admin/mentees/123','/admin/users/mentees'], ['/admin/mentors/123','/admin/users/mentors'], ['/admin/programs/123','/admin/programs/list']]) assert.ok(matchesAdminTab(page, tab));
  assert.equal(matchesAdminTab('/admin/roadmaps-other', '/admin/roadmaps'), false);
});
test('50 clans paginate without loss, and filters preserve source data', () => {
  const clans = Array.from({length:50}, (_, i) => ({id:String(i),name:`Clan ${i}`,programId:'p',programName:'Program',status:i%2?'green':'red',atRisk:i,pendingApprovals:i%3,openBlockers:i%4,leadMentor:{name:'Alex'}}));
  const before = JSON.stringify(clans);
  const result = filterClanQueue(clans, {programId:'',query:'',queue:'all'});
  const pages = [];
  for(let i=0;i<result.length;i+=CLAN_PAGE_SIZE) pages.push(result.slice(i,i+CLAN_PAGE_SIZE));
  assert.ok(pages.every(page => page.length <= 6));
  assert.equal(new Set(pages.flat().map(clan => clan.id)).size, 50);
  assert.equal(JSON.stringify(clans), before);
  assert.equal(filterClanQueue(clans, {programId:'p',query:' ALEX ',queue:'attention'}).length,25);
  assert.ok(filterClanQueue(clans, {programId:'',query:'',queue:'reviews'}).every(clan => clan.pendingApprovals > 0));
  assert.ok(filterClanQueue(clans, {programId:'',query:'',queue:'blockers'}).every(clan => clan.openBlockers > 0));
  assert.equal(filterClanQueue(clans, {programId:'other',query:'',queue:'all'}).length,0);
});
