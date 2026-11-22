/* Round-2 tests: touch scrolling restored + Abyss Eye pacing.
   Loads the real HTML in a vm with the same minimal stub as _test_r1.js. */
const fs = require('fs');
const vm = require('vm');
const realLog = console.log;
const TARGET = process.argv[2] || 'abyss-kitchen-r2-fixed.html';
const html = fs.readFileSync(TARGET, 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const css = html.split('<style>')[1].split('</style>')[0];

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; realLog('  PASS  ' + name); }
  else { fail++; realLog('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function section(t) { realLog('\n=== ' + t + ' ==='); }

/* ---------- storage / timers / canvas / dom stubs ---------- */
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

section('T0 加载');
ok('R2 脚本无加载异常', !loadError, loadError && loadError.message);

/* ================= T1 touch scrolling ================= */
section('T1 触摸滑动（物品挑选）');
ok('body 不再有 touch-action:none', !/body\s*\{[^}]*touch-action\s*:\s*none/.test(css));
const taNone = (css.match(/touch-action\s*:\s*none/g) || []).length;
ok('touch-action:none 只留给画布与摇杆', taNone >= 1 && taNone <= 2 && /#canvas\s*\{[^}]*touch-action\s*:\s*none/.test(css), taNone);
ok('.panel 恢复纵向滑动', /\.panel\s*\{[^}]*touch-action\s*:\s*pan-y/.test(css));
ok('.panel 启用 iOS 惯性滚动', /\.panel\s*\{[^}]*webkit-overflow-scrolling\s*:\s*touch/.test(css));
ok('.panel 有可见滚动条样式', css.includes('.panel::-webkit-scrollbar'));
ok('#ingGrid 允许横向滑动', /#ingGrid\s*\{[^}]*touch-action\s*:\s*pan-x/.test(css));
ok('#ingGrid 有横向滚动条样式', css.includes('#ingGrid::-webkit-scrollbar'));
ok('窄屏营业面板可纵向滚动', /#kitchen\s*\{[^}]*overflow-y\s*:\s*auto/.test(css));
ok('窄屏卡片内部可纵向滚动', /#kitchen\s+\.kbox\s*\{[^}]*overflow-y\s*:\s*auto/.test(css));
ok('可滚动列表设置 overscroll 隔离', css.includes('overscroll-behavior:contain'));
ok('原有 overflow-x:auto 仍在', /#ingGrid\s*\{[^}]*overflow-x\s*:\s*auto/.test(css));

/* ================= T2 eye tuning ================= */
section('T2 深渊之眼数值');
let eye = null;
try { eye = vm.runInContext('ENEMY.eye', sandbox); } catch (e) {}
ok('深渊之眼已定义', !!eye);
ok('接触伤害 11 -> 8', eye && eye.damage === 8, eye && eye.damage);
ok('生命值保持 54（未误改）', eye && eye.hp === 54, eye && eye.hp);
const eyeAttackCount = (script.match(/e\.type==='eye'&&d<360/g) || []).length;
ok('两处 eye 攻击分支都已更新', eyeAttackCount === 2, eyeAttackCount);
ok('旧射程 430 已移除', !script.includes("e.type==='eye'&&d<430"));
ok('新增 0.7s 瞄准前摇', script.includes('e.aiming=true;e.timer=.7'));
ok('开火间隔改为 2.6-3.6s', script.includes('rnd(2.6,3.6)'));
ok('旧间隔 1.5-2.3s 已移除', !script.includes('rnd(1.5,2.3)'));
ok('弹速 250 -> 185', script.includes('vx:Math.cos(a)*185') && !script.includes('vx:Math.cos(a)*250'));
ok('后退阈值 180 -> 110', script.includes('if(d<110)'));
ok('后退力度 7 -> 4.5', script.includes('speedMult*dt*4.5'));

/* ================= T3 eye behaviour ================= */
section('T3 深渊之眼开火节奏（模拟）');
let behavErr = null;
try {
  game.newGame(); game.launchHunt();
  game.spawnEnemy = () => {};                 // 阻止自动补怪干扰计数
  const px = game.player.x, py = game.player.y;
  const mkEye = (dx) => ({ type: 'eye', x: px + dx, y: py, vx: 0, vy: 0, hp: 54, max: 54, hit: 0, atk: 0, state: 0, timer: 0, wob: 0, dead: false, elite: false });

  game.enemies = [mkEye(300)]; game.enemyShots = [];
  game.updateEnemies(0.016);
  ok('进入射程先进入前摇，不立刻开火', game.enemyShots.length === 0, game.enemyShots.length);
  for (let i = 0; i < 30; i++) game.updateEnemies(0.016);       // +0.48s
  ok('前摇未结束仍不开火', game.enemyShots.length === 0, game.enemyShots.length);

  for (let i = 0; i < 25; i++) game.updateEnemies(0.016);       // 累计 ~1.28s
  ok('前摇结束后只发射 1 发', game.enemyShots.length === 1, game.enemyShots.length);
  const shot = game.enemyShots[0] || { vx: 0, vy: 0 };
  ok('弹速降为 185', Math.abs(Math.hypot(shot.vx, shot.vy) - 185) < 0.6, Math.hypot(shot.vx, shot.vy));
  ok('弹体伤害为 8', shot.damage === 8, shot.damage);

  const before = game.enemyShots.length;
  for (let i = 0; i < 120; i++) game.updateEnemies(0.016);      // +1.92s
  ok('冷却期内不再追加射击', game.enemyShots.length === before, game.enemyShots.length);

  // 近距离瞄准期间不后退
  const close = mkEye(60); game.enemies = [close]; game.enemyShots = [];
  game.updateEnemies(0.016);
  ok('瞄准期间不后退，近身窗口成立', Math.abs(close.vx) + Math.abs(close.vy) < 5, close.vx + ',' + close.vy);

  // 射程外不主动开火
  const far = mkEye(420); game.enemies = [far]; game.enemyShots = [];
  for (let i = 0; i < 100; i++) game.updateEnemies(0.016);
  ok('射程外不射击', game.enemyShots.length === 0, game.enemyShots.length);
} catch (e) { behavErr = e; ok('深渊之眼行为测试无异常', false, e.message); }

realLog('\n================ RESULT: ' + pass + ' passed, ' + fail + ' failed ================');
if (fail > 0) process.exitCode = 1;
