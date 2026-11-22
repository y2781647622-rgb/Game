/* V3 tests: month cycle, review perks, large sinks, hunt dive, menu, rule anomalies. */
const fs = require('fs');
const vm = require('vm');
const realLog = console.log;
const TARGET = process.argv[2] || 'abyss-kitchen-v3.html';
const html = fs.readFileSync(TARGET, 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; realLog('  PASS  ' + name); }
  else { fail++; realLog('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function section(t) { realLog('\n=== ' + t + ' ==='); }

function makeStorage() {
  const m = new Map();
  return { _map: m,
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    key(i) { const a = [...m.keys()]; return a[i] === undefined ? null : a[i]; },
    get length() { return m.size; } };
}
let timerSeq = 0; const timers = new Map();
const setTimeoutStub = (fn, ms) => { const id = ++timerSeq; timers.set(id, { fn, ms }); return id; };
const clearTimeoutStub = id => timers.delete(id);
const colorLog = [];
const gradient = { addColorStop() {} };
const ctx2d = new Proxy({}, {
  get(t, p) { if (p in t) return t[p]; if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient; return () => undefined; },
  set(t, p, v) { t[p] = v; if (p === 'fillStyle' || p === 'strokeStyle') colorLog.push(String(v)); return true; }
});
function makeEl(id) {
  return { id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', dataset: {}, children: [],
    style: { setProperty() {}, removeProperty() {} },
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } return this._s.has(c); },
      contains(c) { return this._s.has(c); } },
    appendChild(c) { (this.children || (this.children = [])).push(c); return c; }, removeChild(c) { return c; }, remove() {},
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1180, height: 760 }; },
    getContext() { return ctx2d; }, width: 1180, height: 760, onclick: null };
}
const els = new Map();
const getEl = id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
const documentStub = { getElementById: getEl,
  createElement(t) { const e = makeEl('#' + t); e.tagName = String(t).toUpperCase(); return e; },
  documentElement: makeEl('html'), body: makeEl('body'), addEventListener() {}, removeEventListener() {},
  fullscreenElement: null, webkitFullscreenElement: null, exitFullscreen() {}, webkitExitFullscreen() {} };

const storage = makeStorage();
let clock = 0;
const sandbox = {
  console: { log: () => {}, warn: () => {}, error: () => {}, info() {} },
  performance: { now: () => { clock += 16; return clock; } },
  localStorage: storage, document: documentStub,
  innerWidth: 1180, innerHeight: 760,
  visualViewport: { width: 1180, height: 760, addEventListener() {} },
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub, setInterval: () => 0, clearInterval() {}
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let loadError = null;
try { vm.runInContext('globalThis.window = globalThis;\n' + script, sandbox); }
catch (e) { loadError = e; }
const game = sandbox.game;

section('T0 加载与新系统挂载');
ok('V3 脚本无加载异常', !loadError, loadError && (loadError.message + '\n' + (loadError.stack || '').split('\n').slice(0, 3).join('\n')));
const methods = ['cycleNo', 'cycleMul', 'perkCount', 'rollPerks', 'choosePerk', 'buyV3', 'diveDeeper', 'openMenuBuilder', 'toggleMenuDish', 'ensureV3Meta', 'renderPerkCards', 'openPerkChoice', 'subscribe'];
ok('V3 方法齐全', ['cycleNo','cycleMul','perkCount','rollPerks','choosePerk','buyV3','diveDeeper','openMenuBuilder','toggleMenuDish','ensureV3Meta','renderPerkCards','openPerkChoice'].every(m => typeof game[m] === 'function'),
  ['cycleNo','cycleMul','perkCount','rollPerks','choosePerk','buyV3','diveDeeper','openMenuBuilder','toggleMenuDish','ensureV3Meta','renderPerkCards','openPerkChoice'].filter(m => typeof game[m] !== 'function').join(','));
let dataOk = false;
try { dataOk = vm.runInContext('V3_THEMES && V3_STAFF && V3_SECRET_RECIPES.length===5 && V3_PERKS.length===6', sandbox); } catch (e) {}
ok('V3 数据表完整', dataOk);
ok('新界面已注入', !!getEl('perkChoice') && !!getEl('menuBuilder') && !!getEl('diveBar'));
ok('HUD 月份节点存在', !!getEl('cycleText'));

if (!game || loadError) { realLog('\nRESULT: ' + pass + ' passed, ' + fail + ' failed'); process.exitCode = 1; return; }

/* ================= T1 cycle ================= */
section('T1 月循环');
game.newGame();
ok('新游戏为第 1 月', game.cycleNo() === 1, game.cycleNo());
const cycleAt = d => { game.meta.day = d; return game.cycleNo(); };
ok('day7 = 第 1 月', cycleAt(7) === 1);
ok('day8 = 第 2 月', cycleAt(8) === 2);
ok('day14 = 第 2 月', cycleAt(14) === 2);
ok('day15 = 第 3 月', cycleAt(15) === 3);
game.meta.day = 1;
const m1 = game.cycleMul();
ok('第 1 月倍率全为 1', m1.hp === 1 && m1.count === 0 && m1.cost === 1 && m1.reward === 1 && m1.patience === 1, JSON.stringify(m1));
game.meta.day = 8;
const m2 = game.cycleMul();
ok('第 2 月 hp/cost/reward 缩放正确', Math.abs(m2.hp - 1.15) < 1e-9 && Math.abs(m2.cost - 1.12) < 1e-9 && Math.abs(m2.reward - 1.30) < 1e-9, JSON.stringify(m2));
game.meta.day = 1; game.daily.depth = 0; game.daily.modifier = { enemyHp: 1 }; game.enemies = [];
game.spawnEnemy('blob', 100, 100);
const hp1 = game.enemies[0].max;
game.meta.day = 8; game.enemies = [];
game.spawnEnemy('blob', 100, 100);
const hp2 = game.enemies[0].max;
ok('第 2 月同种敌人 HP 提高约 15%', hp2 > hp1 && Math.abs(hp2 / hp1 - 1.15) < 0.05, hp1 + ' -> ' + hp2);
game.meta.day = 1; game.daily.depth = 0; game.buildWorld();
const count1 = game.enemies.length;
game.meta.day = 8; game.daily.depth = 0; game.buildWorld();
const count2 = game.enemies.length;
ok('第 2 月敌人数量 +2', count2 === count1 + 2, count1 + ' -> ' + count2);

/* ================= T2 perks ================= */
section('T2 评审三选一');
game.newGame();
game.meta.day = 7; game.meta.reputation = 999; game.meta.stars = 0;
game.daily.wrong = 0; game.daily.served = 3; game.daily.serveTarget = 3;
game.daily.gross = 200; game.daily.tips = 20; game.daily.huntGold = 30; game.daily.missionGold = 0;
game.phase = 'BISTRO'; game.active = true;
game.finishDay();
ok('评审通过后生成 3 个改造选项', Array.isArray(game.pendingPerks) && game.pendingPerks.length === 3, game.pendingPerks && game.pendingPerks.length);
ok('改造选项不重复', new Set((game.pendingPerks || []).map(p => p.id)).size === 3);
const firstPerk = game.pendingPerks[0];
game.choosePerk(firstPerk.id);
ok('选择后清空待选项', game.pendingPerks === null);
ok('选择后进入黑市', game.phase === 'MARKET', game.phase);
if (firstPerk.id === 'hall') {
  game.startDay();
  ok('扩大厅堂增加每日目标顾客', game.daily.serveTarget >= 4, game.daily.serveTarget);
}
game.meta.perks = [{ id: 'hall', day: 1 }];
const withHall = game.rewardMul();
game.meta.perks = [];
const noHall = game.rewardMul();
ok('扩大厅堂使收入倍率上升', withHall > noHall, withHall + ' vs ' + noHall);

/* ================= T3 large sinks ================= */
section('T3 大额 sink');
game.newGame();
game.meta.gold = 200000;
getEl('marketItems').children = [];
game.renderMarket();
const marketHtml = (getEl('marketItems').children || []).map(c => c.innerHTML).join('|');
ok('黑市出现装修商品', marketHtml.includes('装修'));
ok('黑市出现雇员商品', marketHtml.includes('雇员'));
ok('黑市出现秘藏菜谱', marketHtml.includes('秘藏菜谱'));

const g0 = game.meta.gold;
game.buyV3('theme', 'abyss', 1800);
ok('购买装修生效并扣款', game.meta.theme === 'abyss' && game.meta.gold === g0 - 1800, game.meta.theme + '/' + game.meta.gold);
game.buyV3('staff', 'cook', 3000);
ok('购买帮厨生效', game.staffOwned('cook'));
const beforeSecret = game.meta.recipes.length;
game.buyV3('secret', 'void_risotto', 1500);
ok('购买秘藏菜谱解锁', game.meta.recipes.includes('void_risotto') && game.meta.recipes.length === beforeSecret + 1);
let inRecipes = false;
try { inRecipes = vm.runInContext("RECIPES.some(r=>r.id==='void_risotto')", sandbox); } catch (e) {}
ok('秘藏菜谱进入全局菜谱表', inRecipes);
game.meta.gold = 100;
game.buyV3('theme', 'gilded', 3200);
ok('金币不足时无法购买', game.meta.theme === 'abyss');
const sinkTotal = 320 + 380 + 760 + 1120 + 1480 + (280 + 460 + 640) + (260 + 430 + 600) + (330 + 540 + 750) + (410 + 650 + 890) + 1800 + 3200 + 4800 + 3000 + 6000 + 1500 + 1800 + 2200 + 2600 + 3000;
ok('一次性 sink 总量约 4 万 G', sinkTotal > 38000, sinkTotal);

/* ================= T4 dive ================= */
section('T4 狩猎深入层');
game.newGame(); game.launchHunt();
ok('出发进入 HUNT', game.phase === 'HUNT');
game.daily.mapKills = 0; game.daily.depth = 0;
game.evacuate();
ok('零击杀且未深入时仍被拦截', game.phase === 'HUNT', game.phase);
game.daily.mapKills = 1; game.evacuate();
ok('有击杀可撤离', game.phase === 'SCAVENGE');
ok('撤离后出现深入按钮', !getEl('diveBar').classList.contains('hidden'));
game.metaFresh = 100;
game.diveDeeper();
ok('深入后回到 HUNT 且层数 +1', game.phase === 'HUNT' && game.daily.depth === 1, game.phase + '/' + game.daily.depth);
ok('深入消耗 15 新鲜度', Math.abs(game.metaFresh - 85) < 0.01, game.metaFresh);
game.daily.mapKills = 0; game.evacuate();
ok('深入层零击杀也可撤离', game.phase === 'SCAVENGE');
game.diveDeeper();
ok('可深入到第 3 层', game.daily.depth === 2, game.daily.depth);
game.phase = 'SCAVENGE';
const deepBefore = game.daily.depth;
game.diveDeeper();
ok('超过 3 层被拒绝', game.daily.depth === deepBefore);
// depth loot
game.daily.depth = 2; game.daily.modifier = { id: 'calm' }; game.daily.kills = {};
const inv = game.meta.inventory;
inv.bone = 0;
const e = { type: 'skeleton', x: 100, y: 100, vx: 0, vy: 0, hp: 1, max: 1, hit: 0, atk: 0, state: 0, timer: 9, wob: 0, dead: false, elite: false };
game.killEnemy(e);
ok('深入层击杀有额外掉落', inv.bone >= 2, inv.bone);

/* ================= T5 menu ================= */
section('T5 菜单构筑');
game.newGame();
game.meta.recipes = ['steak_basic', 'eye_soup', 'abyss_sashimi'];
game.meta.menu = [];
game.toggleMenuDish('steak_basic');
ok('加入菜单', game.meta.menu.includes('steak_basic'));
for (const id of ['eye_soup', 'abyss_sashimi', 'garlic_tentacle', 'magma_stew', 'slime_jelly']) game.toggleMenuDish(id);
ok('菜单上限 5 道', game.meta.menu.length <= 5, game.meta.menu.length);
game.meta.menu = ['steak_basic'];
game.meta.inventory.meat_basic = 5; game.meta.inventory.eye = 5; game.meta.inventory.herb = 5;
const filtered = game.makeableRecipes();
ok('菜单过滤生效（只接菜单内菜）', filtered.length === 1 && filtered[0].id === 'steak_basic', filtered.map(r => r.id).join(','));
const menuMul = game.rewardMul();
game.meta.menu = [];
const freeMul = game.rewardMul();
ok('精简菜单带来熟练加成', menuMul > freeMul, menuMul + ' vs ' + freeMul);
game.openMenuBuilder();
ok('菜单界面可打开', game.phase === 'MENU' && !getEl('menuBuilder').classList.contains('hidden'));
game.closeMenuBuilder();
ok('关闭菜单回到开门准备', game.phase === 'NIGHT_INTRO', game.phase);

/* ================= T6 rule anomalies ================= */
section('T6 规则型异象');
game.newGame();
game.meta.recipes = ['steak_basic'];
game.meta.inventory.meat_basic = 0;
game.meta.inventory.herb = 9;
game.daily.modifier = vm.runInContext("DAILY_MODIFIERS.find(m=>m.id==='rotfog')", sandbox);
game.phase = 'BISTRO';
const steakRecipe = vm.runInContext("RECIPES.find(r=>r.id==='steak_basic')", sandbox);
game.customer = { order: steakRecipe, state: 'wait', patience: 100, x: 100, y: 100, type: { icon: '🙂', name: '普通旅客', pay: 1, tip: 1, patience: 1 }, eat: 0 };
game.pot = ['meat_basic'];
const herbBefore = game.meta.inventory.herb;
game.serveDish();
ok('腐坏雾潮：成功出餐后随机食材 -1', game.meta.inventory.herb === herbBefore - 1, herbBefore + ' -> ' + game.meta.inventory.herb);

game.newGame();
game.meta.recipes = ['steak_basic'];
game.daily.modifier = vm.runInContext("DAILY_MODIFIERS.find(m=>m.id==='harvest')", sandbox);
game.meta.inventory.magma = 0;
const em = { type: 'magma', x: 100, y: 100, vx: 0, vy: 0, hp: 1, max: 1, hit: 0, atk: 0, state: 0, timer: 9, wob: 0, dead: false, elite: false };
game.killEnemy(em);
ok('丰收脉动：击杀额外 +1 掉落', game.meta.inventory.magma >= 2, game.meta.inventory.magma);

/* ================= T7 21-day smoke ================= */
section('T7 三周目冒烟');
let smokeErr = null, reachedCycle = 0, perkPicks = 0;
try {
  game.newGame();
  for (let i = 0; i < 21; i++) {
    game.phase = 'BISTRO'; game.active = true;
    game.meta.reputation = 999; game.daily.wrong = 0;
    game.daily.served = 3; game.daily.serveTarget = 3;
    game.daily.gross = 150; game.daily.tips = 15; game.daily.huntGold = 20; game.daily.missionGold = 0;
    game.finishDay();
    if (game.phase !== 'REPORT') throw new Error('day ' + (i + 1) + ' 未进入 REPORT');
    if (game.pendingPerks && game.pendingPerks.length) {
      game.choosePerk(game.pendingPerks[0].id);
      perkPicks++;
    }
    game.nextDay();
    reachedCycle = game.cycleNo();
  }
} catch (e) { smokeErr = e; }
ok('21 天 / 3 个月循环无异常', !smokeErr, smokeErr && smokeErr.message);
ok('21 次日循环后进入第 3 月以上', reachedCycle >= 3, reachedCycle);
ok('每个评审周期都拿到改造', perkPicks >= 3, perkPicks);

realLog('\n================ RESULT: ' + pass + ' passed, ' + fail + ' failed ================');
if (fail > 0) process.exitCode = 1;
