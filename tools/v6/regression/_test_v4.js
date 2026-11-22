/* V4 tests: per-map monster skins, crit, kill-chain, execute, heal, bestiary. */
const fs = require('fs');
const vm = require('vm');
const realLog = console.log;
const TARGET = process.argv[2] || 'abyss-kitchen-v4.html';
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
  return { _map: m, getItem(k) { return m.has(k) ? m.get(k) : null; }, setItem(k, v) { m.set(k, String(v)); }, removeItem(k) { m.delete(k); }, key(i) { const a = [...m.keys()]; return a[i] === undefined ? null : a[i]; }, get length() { return m.size; } };
}
let timerSeq = 0; const timers = new Map();
const setTimeoutStub = (fn, ms) => { const id = ++timerSeq; timers.set(id, { fn, ms }); return id; };
const colorLog = [];
let drawCalls = 0;
const gradient = { addColorStop() {} };
const ctx2d = new Proxy({}, {
  get(t, p) { if (p in t) return t[p]; if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient; return () => { drawCalls++; }; },
  set(t, p, v) { t[p] = v; if (p === 'fillStyle' || p === 'strokeStyle') colorLog.push(String(v)); return true; }
});
function makeEl(id) {
  return { id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', dataset: {}, children: [],
    style: { setProperty() {}, removeProperty() {} },
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } return this._s.has(c); }, contains(c) { return this._s.has(c); } },
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
  setTimeout: setTimeoutStub, clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval() {}
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
let loadError = null;
try { vm.runInContext('globalThis.window = globalThis;\n' + script, sandbox); }
catch (e) { loadError = e; }
const game = sandbox.game;

section('T0 加载与新系统');
ok('V4 脚本无加载异常', !loadError, loadError && (loadError.message + '\n' + (loadError.stack || '').split('\n').slice(0, 3).join('\n')));
ok('绘制方法齐全', ['drawEnemy', 'v4Eye', 'v4Tentacle', 'v4Skeleton', 'v4Magma', 'v4Wisp', 'v4Slime', 'v4Blob'].every(m => typeof game[m] === 'function'));
ok('战斗方法齐全', ['hitEnemy', 'comboMul', 'critChance', 'codexKills', 'codexBonus', 'openCodex', 'renderCodex', 'closeCodex'].every(m => typeof game[m] === 'function'));
let skinOk = false;
try { skinOk = vm.runInContext("Object.keys(V4_SKINS).length===3 && Object.keys(V4_SKINS.ABYSS).length===7 && Object.keys(V4_CODEX_NOTES).length===7", sandbox); } catch (e) {}
ok('3 地图 × 7 怪物皮肤表完整', skinOk);
ok('图鉴界面已注入', !!getEl('codex') && !!getEl('codexCards'));
ok('HUD 连杀节点存在', !!getEl('comboText'));

if (!game || loadError) { realLog('\nRESULT: ' + pass + ' passed, ' + fail + ' failed'); process.exitCode = 1; return; }

/* ================= T1 monster rendering ================= */
section('T1 地图怪物外观（21 种组合）');
game.newGame();
const types = vm.runInContext('Object.keys(ENEMY)', sandbox);
let renderErr = null;
for (const mapId of ['ABYSS', 'VOLCANO', 'ICE']) {
  game.world = { id: mapId, w: 1960, h: 1320 };
  for (const t of types) {
    colorLog.length = 0; drawCalls = 0;
    const en = { type: t, x: 100, y: 100, wob: 1.2, hit: 0, hp: 50, max: 100, elite: false, dead: false, vx: 0, vy: 0 };
    try { game.drawEnemy(en); } catch (e) { renderErr = mapId + '/' + t + ': ' + e.message; }
    if (renderErr) break;
    ok(`绘制 ${mapId}/${t}`, drawCalls > 3 && colorLog.length > 0);
  }
  if (renderErr) break;
}
ok('21 种组合全部渲染无异常', !renderErr, renderErr);

let eliteErr = null;
try { game.drawEnemy({ type: 'eye', x: 100, y: 100, wob: 1, hit: 0, hp: 40, max: 100, elite: true }); } catch (e) { eliteErr = e.message; }
ok('精英怪绘制无异常', !eliteErr, eliteErr);
let hitErr = null;
try { game.drawEnemy({ type: 'blob', x: 100, y: 100, wob: 1, hit: 0.08, hp: 20, max: 100, elite: false }); } catch (e) { hitErr = e.message; }
ok('受击形变绘制无异常', !hitErr, hitErr);

/* ================= T2 crit / combo / execute ================= */
section('T2 暴击 / 连杀 / 处决');
game.newGame(); game.launchHunt();
game.spawnEnemy = () => {};
const origRandom = vm.runInContext('Math.random', sandbox);
vm.runInContext('Math.random=()=>0', sandbox);
game.meta.codex = { kills: {} }; game.huntCombo = 0;
const critTarget = { type: 'blob', x: 100, y: 100, hp: 1000, max: 1000, hit: 0, vx: 0, vy: 0, dead: false, elite: false };
game.hitEnemy(critTarget, 100, 0, 0);
ok('暴击伤害 1.8 倍 (100 -> 180)', critTarget.hp === 820, critTarget.hp);
const execTarget = { type: 'blob', x: 100, y: 100, hp: 15, max: 100, hit: 0, vx: 0, vy: 0, dead: false, elite: false };
game.hitEnemy(execTarget, 100, 0, 0);
ok('低血量触发处决', execTarget.dead === true && execTarget._execute === true, execTarget.dead + '/' + execTarget._execute);
sandbox.__origRandom = origRandom;
vm.runInContext('Math.random=__origRandom', sandbox);

game.newGame(); game.launchHunt(); game.spawnEnemy = () => {};
game.huntCombo = 0; game.meta.codex = { kills: {} }; game.player.hp = 50;
for (let i = 0; i < 5; i++) {
  const en = { type: 'blob', x: 100, y: 100, hp: 1, max: 1, hit: 0, vx: 0, vy: 0, dead: false, elite: false };
  game.killEnemy(en);
}
ok('连续击杀累计到 5 连杀', game.huntCombo === 5, game.huntCombo);
ok('5 连杀伤害 +5%', Math.abs(game.comboMul() - 1.05) < 1e-9, game.comboMul());
ok('击杀回复生命 (50 -> 57.5)', Math.abs(game.player.hp - 57.5) < 0.01, game.player.hp);
ok('图鉴记录击杀数', game.codexKills('blob') === 5, game.codexKills('blob'));
game.huntComboTimer = 0.05;
game.updateHunt(0.1);
ok('超过 2.5 秒连杀归零', game.huntCombo === 0, game.huntCombo);

game.meta.codex.kills.blob = 25;
ok('25 杀解锁 +2% 同类伤害', Math.abs(game.codexBonus('blob') - 0.02) < 1e-9, game.codexBonus('blob'));
game.meta.codex.kills.blob = 500;
ok('图鉴伤害上限 +20%', Math.abs(game.codexBonus('blob') - 0.20) < 1e-9, game.codexBonus('blob'));

/* ================= T3 bestiary UI ================= */
section('T3 怪物图鉴界面');
game.newGame();
game.meta.codex.kills = { blob: 30, eye: 7 };
game.openCodex();
ok('图鉴打开', game.phase === 'CODEX', game.phase);
ok('图鉴渲染 7 张卡', getEl('codexCards').children.length === 7, getEl('codexCards').children.length);
ok('图鉴卡片含击杀数', getEl('codexCards').children.some(c => c.innerHTML.includes('击杀 30 只')));
game.closeCodex();
ok('关闭图鉴回到准备页', game.phase === 'PREP' || game.phase === 'TITLE', game.phase);

/* ================= T4 sfx ================= */
section('T4 音效降级安全');
let sfxErr = null;
try { vm.runInContext("V4Sfx.play('hit'); V4Sfx.play('crit'); V4Sfx.play('kill'); V4Sfx.play('execute');", sandbox); } catch (e) { sfxErr = e.message; }
ok('无 AudioContext 时静默降级', !sfxErr, sfxErr);

realLog('\n================ RESULT: ' + pass + ' passed, ' + fail + ' failed ================');
if (fail > 0) process.exitCode = 1;
