/* V5 tests: weapon mastery / evolution / map affinity / rent+wages / debt. */
const fs = require('fs');
const vm = require('vm');
const realLog = console.log;
const TARGET = process.argv[2] || 'abyss-kitchen-v5.html';
const html = fs.readFileSync(TARGET, 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; realLog('  PASS  ' + name); } else { fail++; realLog('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); } }
function section(t) { realLog('\n=== ' + t + ' ==='); }
function makeStorage() { const m = new Map(); return { _map: m, getItem(k) { return m.has(k) ? m.get(k) : null; }, setItem(k, v) { m.set(k, String(v)); }, removeItem(k) { m.delete(k); }, key(i) { const a = [...m.keys()]; return a[i] === undefined ? null : a[i]; }, get length() { return m.size; } }; }
let timerSeq = 0; const timers = new Map();
const setTimeoutStub = (fn, ms) => { const id = ++timerSeq; timers.set(id, { fn, ms }); return id; };
const colorLog = []; let drawCalls = 0;
const gradient = { addColorStop() {} };
const ctx2d = new Proxy({}, {
  get(t, p) { if (p in t) return t[p]; if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient; return () => { drawCalls++; }; },
  set(t, p, v) { t[p] = v; if (p === 'fillStyle' || p === 'strokeStyle') colorLog.push(String(v)); return true; }
});
function makeEl(id) {
  return { id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', dataset: {}, children: [], style: { setProperty() {}, removeProperty() {} },
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } return this._s.has(c); }, contains(c) { return this._s.has(c); } },
    appendChild(c) { (this.children || (this.children = [])).push(c); return c; }, removeChild(c) { return c; }, remove() {},
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1180, height: 760 }; }, getContext() { return ctx2d; }, width: 1180, height: 760, onclick: null };
}
const els = new Map();
const getEl = id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
const documentStub = { getElementById: getEl, createElement(t) { const e = makeEl('#' + t); e.tagName = String(t).toUpperCase(); return e; }, documentElement: makeEl('html'), body: makeEl('body'), addEventListener() {}, removeEventListener() {}, fullscreenElement: null, webkitFullscreenElement: null, exitFullscreen() {}, webkitExitFullscreen() {} };
const storage = makeStorage(); let clock = 0;
const sandbox = {
  console: { log: () => {}, warn: () => {}, error: () => {}, info() {} },
  performance: { now: () => { clock += 16; return clock; } },
  localStorage: storage, document: documentStub, innerWidth: 1180, innerHeight: 760,
  visualViewport: { width: 1180, height: 760, addEventListener() {} },
  addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  setTimeout: setTimeoutStub, clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval() {}
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
let loadError = null;
try { vm.runInContext('globalThis.window = globalThis;\n' + script, sandbox); } catch (e) { loadError = e; }
const game = sandbox.game;

section('T0 加载与武器经济系统');
ok('V5 脚本无加载异常', !loadError, loadError && (loadError.message + '\n' + (loadError.stack || '').split('\n').slice(0, 3).join('\n')));
ok('V5 方法齐全', ['masteryOf','masteryLevel','masteryMul','mapAffinity','applyEvolution','weaponUltimate','buyEvolution','applyDebt','ensureV5Meta'].every(m => typeof game[m] === 'function'));
const prices = vm.runInContext('({shears:WEAPONS.kitchenShears.price,fork:WEAPONS.saltFork.price,blade:WEAPONS.abyssBlade.price,cannon:WEAPONS.magmaCannon.price,chakram:WEAPONS.frostChakram.price})', sandbox);
ok('武器价格按三系重构', prices.shears === 280 && prices.fork === 320 && prices.blade === 680 && prices.cannon === 980 && prices.chakram === 1280, JSON.stringify(prices));
const maps = vm.runInContext('({a:MAPS.ABYSS.bestWeapon,v:MAPS.VOLCANO.bestWeapon,i:MAPS.ICE.bestWeapon})', sandbox);
ok('三地图有专属适配武器', maps.a === 'abyssBlade' && maps.v === 'magmaCannon' && maps.i === 'frostChakram', JSON.stringify(maps));

if (!game || loadError) { realLog('\nRESULT: ' + pass + ' passed, ' + fail + ' failed'); process.exitCode = 1; return; }

/* ================= T1 mastery ================= */
section('T1 武器专精');
game.newGame(); game.launchHunt(); game.spawnEnemy = () => {};
game.meta.selectedWeapon = 'cleaver'; game.meta.selectedMap = 'ABYSS';
game.meta.weaponMastery = { cleaver: 0 };
game.huntCombo = 0; game.meta.codex = { kills: {} };
const target = { type: 'blob', x: 100, y: 100, hp: 500, max: 500, hit: 0, vx: 0, vy: 0, dead: false, elite: false };
game.hitEnemy(target, 100, 0, 0);
ok('命中积累专精值', game.masteryOf('cleaver') > 0, game.masteryOf('cleaver'));

game.meta.weaponMastery.cleaver = 25;
ok('25 点 = Lv1', game.masteryLevel('cleaver') === 1, game.masteryLevel('cleaver'));
ok('Lv1 伤害 +10%', Math.abs(game.masteryMul('cleaver') - 1.10) < 1e-9, game.masteryMul('cleaver'));
game.attacks = [];
game.player.combo = 0;
game.attack();
ok('Lv1 实际攻击伤害 25 -> 28', game.attacks[game.attacks.length - 1].damage === 28, game.attacks[game.attacks.length - 1].damage);

game.meta.weaponMastery.cleaver = 75;
game.player.attackCd = 0;
game.attack();
ok('Lv3 冷却 -15%', game.player.attackCd < 0.26 * 0.9, game.player.attackCd);

game.meta.weaponMastery.cleaver = 100;
game.huntCombo = 10;
game.attacks = [];
game.attack();
ok('Lv4 连杀 10 触发终极', game.huntCombo === 0 && game.attacks.some(a => a.type === 'circle'), game.attacks.map(a => a.type).join(','));

/* Lv2 element */
game.meta.selectedWeapon = 'kitchenShears'; game.meta.weaponMastery.kitchenShears = 50;
const el2 = { type: 'blob', x: 100, y: 100, hp: 500, max: 500, hit: 0, vx: 0, vy: 0, dead: false, elite: false };
game.hitEnemy(el2, 40, 0, 0);
ok('Lv2 厨剪附加流血', (el2.bleed || 0) > 0 && (el2.bleedDamage || 0) >= 3, el2.bleed + '/' + el2.bleedDamage);

/* map affinity */
game.meta.selectedMap = 'ABYSS'; game.meta.selectedWeapon = 'abyssBlade';
game.meta.weapons.abyssBlade = true; game.meta.weaponMastery.abyssBlade = 0;
game.attacks = [];
game.attack();
ok('地图适配 +15% 伤害 (34 -> 39)', game.attacks[game.attacks.length - 1].damage === 39, game.attacks[game.attacks.length - 1].damage);

/* ================= T2 evolution ================= */
section('T2 武器进化');
game.newGame();
game.meta.weapons.cleaver = true;
game.meta.cores = 2; game.meta.gold = 5000;
game.buyEvolution('cleaver');
ok('核心不足时拒绝进化', !game.meta.weaponEvolved.cleaver);
game.meta.cores = 3;
game.buyEvolution('cleaver');
ok('进化扣 800G 与 3 核心', game.meta.weaponEvolved.cleaver === true && game.meta.gold === 4200 && game.meta.cores === 0, game.meta.gold + '/' + game.meta.cores);
game.launchHunt(); game.spawnEnemy = () => {};
game.meta.selectedWeapon = 'cleaver'; game.meta.weaponMastery = { cleaver: 0 };
game.player.combo = 0; game.attacks = [];
game.attack();
ok('进化后斩击范围扩大', game.attacks[game.attacks.length - 1].range > 90, game.attacks[game.attacks.length - 1].range);
game.meta.weapons.kitchenShears = true; game.meta.weaponEvolved.kitchenShears = false;
game.meta.cores = 3; game.meta.gold = 5000;
game.playerShots = [];
game.meta.selectedWeapon = 'kitchenShears'; game.meta.weaponMastery.kitchenShears = 0;
game.attack();
ok('未进化厨剪不额外投掷', game.playerShots.length === 0, game.playerShots.length);
game.buyEvolution('kitchenShears');
game.playerShots = [];
game.attack();
ok('进化厨剪额外投出回旋剪', game.playerShots.length === 1, game.playerShots.length);

/* elite cores */
game.meta.cores = 0;
const elite = { type: 'blob', x: 100, y: 100, hp: 1, max: 1, hit: 0, vx: 0, vy: 0, dead: false, elite: true };
game.killEnemy(elite);
ok('精英击杀掉落核心', game.meta.cores === 1, game.meta.cores);

/* ================= T3 economy ================= */
section('T3 租金/工资/负债');
game.newGame();
game.meta.day = 10; game.meta.staff = { cook: true }; game.daily = { modifier: { cost: 0 } };
const cost = vm.runInContext('v161OperatingCost(game)', sandbox);
ok('每日房租按天数/周目计算', game.daily.rent > 0, game.daily.rent);
const rentAt10 = game.daily.rent;
game.meta.day = 20;
vm.runInContext('v161OperatingCost(game)', sandbox);
ok('房租随天数增长', game.daily.rent > rentAt10, rentAt10 + ' -> ' + game.daily.rent);
ok('员工工资计入日常成本', game.daily.wages === 25, game.daily.wages);
ok('运营成本包含房租与工资', cost > 75 + 25, cost);

game.meta.gold = -100; game.meta.reputation = 100; game.phase = 'REPORT';
game.applyDebt();
ok('负债按 5% 计息', game.meta.gold === -105, game.meta.gold);
ok('负债扣 2 点声望', game.meta.reputation === 98, game.meta.reputation);

game.newGame();
game.meta.day = 30; game.meta.gold = 0; game.meta.staff = {};
game.daily.gross = 0; game.daily.tips = 0; game.daily.huntGold = 0; game.daily.missionGold = 0;
game.daily.served = 0; game.daily.wrong = 0; game.daily.bestStreak = 0;
game.phase = 'BISTRO'; game.active = true;
game.finishDay();
ok('结算允许出现负金币', game.meta.gold < 0, game.meta.gold);

/* ================= T4 UI ================= */
section('T4 UI 信息');
game.newGame();
game.meta.weaponMastery = { cleaver: 60 };
getEl('weaponCards').children = [];
game.renderPrep();
const wc = getEl('weaponCards').children;
ok('武器卡渲染 6 张', wc.length === 6, wc.length);
ok('武器卡显示熟练度', wc.some(c => (c.children || []).some(x => (x.innerHTML || '').includes('熟练 Lv.2'))));
getEl('marketItems').children = [];
game.meta.weapons.kitchenShears = true;
game.renderMarket();
ok('黑市出现武器进化商品', getEl('marketItems').children.some(c => c.innerHTML.includes('进化')));

realLog('\n================ RESULT: ' + pass + ' passed, ' + fail + ' failed ================');
if (fail > 0) process.exitCode = 1;
