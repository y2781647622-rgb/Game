/* V6 tests: affixes, guild finance, touch stick / auto-aim. */
const fs = require('fs');
const vm = require('vm');
const realLog = console.log;
const TARGET = process.argv[2] || 'abyss-kitchen-v6.html';
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
    getBoundingClientRect() { return { left: 0, top: 0, width: 124, height: 124 }; }, getContext() { return ctx2d; }, width: 1180, height: 760, onclick: null };
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

section('T0 加载与 V6 系统');
ok('V6 脚本无加载异常', !loadError, loadError && (loadError.message + '\n' + (loadError.stack || '').split('\n').slice(0, 3).join('\n')));
ok('V6 方法齐全', ['ensureV6Meta', 'affixOf', 'affixValue', 'critChance', 'critMul', 'rerollAffix', 'takeLoan', 'repayLoan', 'investFutures', 'settleFinance', 'updateStick', 'applyTouchAim', 'initTouch'].every(m => typeof game[m] === 'function'));
let affixCount = 0;
try { affixCount = vm.runInContext('V6_AFFIXES.length', sandbox); } catch (e) {}
ok('词条池 7 种', affixCount === 7, affixCount);
ok('触摸控件已注入', !!getEl('touchControls') && !!getEl('joystick') && !!getEl('btnAttack'));

if (!game || loadError) { realLog('\nRESULT: ' + pass + ' passed, ' + fail + ' failed'); process.exitCode = 1; return; }

/* ================= T1 affixes ================= */
section('T1 武器词条');
game.newGame();
game.meta.selectedWeapon = 'cleaver';
game.meta.cores = 2; game.meta.gold = 1000;
const origRandom = vm.runInContext('Math.random', sandbox);
sandbox.__origRandom = origRandom;
vm.runInContext('Math.random=()=>0', sandbox);
game.rerollAffix();
const a = game.affixOf('cleaver');
ok('重铸扣 1 核心 + 200G', game.meta.cores === 1 && game.meta.gold === 800, game.meta.cores + '/' + game.meta.gold);
ok('重铸生成词条', !!a && a.id === 'crit' && a.value === 3, JSON.stringify(a));
ok('锐利词条提升暴击率', Math.abs(game.critChance() - 0.13) < 1e-9, game.critChance());
game.meta.weaponAffix.cleaver = { id: 'critDmg', value: 40, tier: 3 };
ok('致命词条提升暴击倍率', Math.abs(game.critMul() - 2.2) < 1e-9, game.critMul());
game.meta.weaponAffix.cleaver = { id: 'range', value: 18, tier: 3 };
game.launchHunt(); game.spawnEnemy = () => {};
game.meta.selectedWeapon = 'cleaver'; game.meta.weaponMastery = { cleaver: 0 };
game.player.combo = 0; game.attacks = [];
game.attack();
ok('延展词条扩大攻击范围', game.attacks[game.attacks.length - 1].range === 90, game.attacks[game.attacks.length - 1].range);
game.meta.weaponAffix.cleaver = { id: 'speed', value: 12, tier: 3 };
game.player.combo = 0; game.player.attackCd = 0; game.attack();
ok('迅捷词条降低冷却', game.player.attackCd < 0.26 * 0.92, game.player.attackCd);
game.meta.weaponAffix.cleaver = { id: 'leech', value: 3, tier: 3 };
game.player.hp = 50;
const leechTarget = { type: 'blob', x: 100, y: 100, hp: 1, max: 1, hit: 0, vx: 0, vy: 0, dead: false, elite: false };
game.killEnemy(leechTarget);
ok('汲取词条提高击杀回复', game.player.hp > 51.5, game.player.hp);
game.meta.weaponAffix.cleaver = { id: 'elite', value: 20, tier: 3 };
game.daily.huntGold = 0;
const eliteTarget = { type: 'blob', x: 100, y: 100, hp: 1, max: 1, hit: 0, vx: 0, vy: 0, dead: false, elite: true };
game.killEnemy(eliteTarget);
ok('猎杀词条给精英额外金币', game.daily.huntGold >= 12, game.daily.huntGold);
vm.runInContext('Math.random=__origRandom', sandbox);

/* ================= T2 finance ================= */
section('T2 公会金融');
game.newGame();
const g0 = game.meta.gold;
game.takeLoan();
ok('贷款 +3000G 并记账', game.meta.gold === g0 + 3000 && game.meta.loan === 3000, game.meta.gold + '/' + game.meta.loan);
game.meta.gold = 5000;
game.repayLoan();
ok('还清贷款扣款并清零', game.meta.gold === 2000 && game.meta.loan === 0, game.meta.gold + '/' + game.meta.loan);
game.meta.gold = 1000; game.meta.futures = null;
game.investFutures();
ok('买入期货扣 800G', game.meta.gold === 200 && !!game.meta.futures, game.meta.gold);
game.meta.day = game.meta.futures.dueDay;
game.daily = { modifier: { cost: 0 } };
vm.runInContext('Math.random=()=>0', sandbox);
game.settleFinance();
ok('期货到期返还 1100G', game.meta.gold === 1300 && game.meta.futures === null, game.meta.gold);
game.meta.loan = 3000; game.meta.gold = 1000; game.daily = { modifier: { cost: 0 } };
game.settleFinance();
ok('贷款每日利息 90G', game.meta.gold === 910 && game.daily.loanInterest === 90, game.meta.gold + '/' + game.daily.loanInterest);
vm.runInContext('Math.random=__origRandom', sandbox);

/* ================= T3 touch ================= */
section('T3 触摸控制');
game.newGame();
game.keys = {};
game.updateStick(1, 0);
ok('摇杆向右设置 d 键', game.keys.d === true && game.keys.a !== true, JSON.stringify(game.keys));
game.updateStick(0, -1);
ok('摇杆向上切换为 w 键', game.keys.w === true && game.keys.d !== true, JSON.stringify(game.keys));
game.updateStick(0, 0);
ok('松开摇杆清空方向', !game.keys.w && !game.keys.a && !game.keys.d && !game.keys.s, JSON.stringify(game.keys));

game.launchHunt(); game.spawnEnemy = () => {};
game.touchAimEnabled = true;
game.player.x = 500; game.player.y = 500;
game.camera.x = 0; game.camera.y = 0;
game.enemies = [
  { type: 'blob', x: 700, y: 500, dead: false },
  { type: 'eye', x: 540, y: 520, dead: false }
];
game.mouse = { x: 0, y: 0, down: false };
game.applyTouchAim();
ok('自动瞄准最近敌人', Math.abs(game.mouse.x - 540) < 1 && Math.abs(game.mouse.y - 520) < 1, game.mouse.x + '/' + game.mouse.y);

/* ================= T4 UI ================= */
section('T4 UI');
game.newGame();
game.meta.selectedWeapon = 'cleaver';
game.meta.weaponAffix = { cleaver: { id: 'crit', value: 7, tier: 2 } };
game.meta.cores = 3;
getEl('weaponCards').children = [];
game.renderPrep();
ok('武器卡显示附魔', (getEl('weaponCards').children || []).some(c => (c.children || []).some(x => (x.innerHTML || '').includes('附魔'))));
getEl('marketItems').children = [];
game.renderMarket();
const mhtml = (getEl('marketItems').children || []).map(c => c.innerHTML).join('|');
ok('黑市出现附魔重铸', mhtml.includes('附魔重铸'));
ok('黑市出现公会贷款', mhtml.includes('公会贷款'));
ok('黑市出现香料期货', mhtml.includes('香料期货'));

realLog('\n================ RESULT: ' + pass + ' passed, ' + fail + ' failed ================');
if (fail > 0) process.exitCode = 1;
