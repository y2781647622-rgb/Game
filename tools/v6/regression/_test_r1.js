/* Round-1 regression tests for Abyss Kitchen.
   Loads the real inline script in a vm with a minimal DOM/Canvas/localStorage stub,
   then asserts the four P0 fixes plus a 7-day smoke loop. No external deps. */
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(process.argv[2] || 'abyss-kitchen-r1-fixed.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];

const realLog = console.log;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; realLog('  PASS  ' + name); }
  else { fail++; realLog('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function section(t) { realLog('\n=== ' + t + ' ==='); }

/* ---------- controllable localStorage ---------- */
function makeStorage() {
  const m = new Map();
  return {
    _map: m, throwRead: false, throwWrite: false, throwRemove: false,
    getItem(k) { if (this.throwRead) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (this.throwWrite) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem(k) { if (this.throwRemove) throw new Error('SecurityError'); m.delete(k); },
    key(i) { const a = [...m.keys()]; return a[i] === undefined ? null : a[i]; },
    get length() { return m.size; }
  };
}

/* ---------- controllable timers ---------- */
let timerSeq = 0;
const timers = new Map();
function setTimeoutStub(fn, ms) { const id = ++timerSeq; timers.set(id, { fn, ms }); return id; }
function clearTimeoutStub(id) { timers.delete(id); }
function flushTimers() {
  for (const [id, e] of [...timers.entries()]) { timers.delete(id); try { e.fn(); } catch (err) { realLog('  [timer error] ' + err.message); } }
}

/* ---------- canvas 2d stub (records colour writes) ---------- */
const colorLog = [];
const gradient = { addColorStop() {} };
const ctx2d = new Proxy({}, {
  get(t, p) {
    if (p in t) return t[p];
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
    if (p === 'measureText') return () => ({ width: 0 });
    return () => undefined;
  },
  set(t, p, v) {
    t[p] = v;
    if (p === 'fillStyle' || p === 'strokeStyle') colorLog.push(String(v));
    return true;
  }
});

/* ---------- DOM stub ---------- */
function makeEl(id) {
  return {
    id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', dataset: {}, children: [],
    style: { setProperty() {}, removeProperty() {} },
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) {
        if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
        else { f ? this._s.add(c) : this._s.delete(c); }
        return this._s.has(c);
      },
      contains(c) { return this._s.has(c); }
    },
    appendChild(c) { (this.children || (this.children = [])).push(c); return c; },
    removeChild(c) { if (this.children) this.children = this.children.filter(x => x !== c); return c; },
    remove() {},
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1180, height: 760, right: 1180, bottom: 760 }; },
    getContext() { return ctx2d; },
    width: 1180, height: 760, onclick: null
  };
}
const els = new Map();
function getEl(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); }
const documentStub = {
  getElementById: getEl,
  createElement(tag) { const e = makeEl('#' + tag); e.tagName = String(tag).toUpperCase(); return e; },
  documentElement: makeEl('html'),
  body: makeEl('body'),
  addEventListener() {}, removeEventListener() {},
  fullscreenElement: null, webkitFullscreenElement: null,
  exitFullscreen() {}, webkitExitFullscreen() {}
};

/* ---------- sandbox ---------- */
const warns = [];
const rafs = [];
let clock = 0;
const storage = makeStorage();
const sandbox = {
  console: {
    log: (...a) => realLog(...a),
    warn: (...a) => { warns.push(a.map(x => String(x)).join(' ')); },
    error: (...a) => realLog('  [console.error]', ...a),
    info() {}
  },
  performance: { now: () => { clock += 16; return clock; } },
  localStorage: storage,
  document: documentStub,
  innerWidth: 1180, innerHeight: 760,
  visualViewport: { width: 1180, height: 760, addEventListener() {} },
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame(fn) { rafs.push(fn); return rafs.length; },
  cancelAnimationFrame() {},
  setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub,
  setInterval: () => 0, clearInterval() {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let loadError = null;
try {
  vm.runInContext('globalThis.window = globalThis;\n' + script, sandbox, { filename: 'abyss-kitchen-r1.js' });
} catch (e) { loadError = e; }

const game = sandbox.game;

/* ================= TEST 0 : load ================= */
section('T0 脚本完整加载');
ok('脚本无加载异常', !loadError, loadError && (loadError.message + '\n' + (loadError.stack || '').split('\n').slice(0, 4).join('\n')));
ok('game 对象已建立', !!game && typeof game === 'object');
ok('启动循环已注册 requestAnimationFrame', rafs.length >= 1);
let weaponIds = [];
try { weaponIds = vm.runInContext('Object.keys(WEAPONS)', sandbox); } catch (e) {}
const requiredWeapons = ['cleaver', 'kitchenShears', 'saltFork', 'abyssBlade', 'magmaCannon', 'frostChakram'];
ok('6 种武器均已注册', requiredWeapons.every(w => weaponIds.includes(w)), weaponIds.join(','));
const requiredMethods = ['handlePlayerDown', 'drawWeapon', 'scheduleFinishDay', 'scheduleSpawnCustomer', 'later', 'cancelPendingTimers', 'save', 'continueGame', 'newGame', 'startDay', 'toTitle'];
ok('R1 新方法全部挂载', requiredMethods.every(m => typeof game[m] === 'function'), requiredMethods.filter(m => typeof game[m] !== 'function').join(','));

if (!game || loadError) { realLog('\nRESULT: ' + pass + ' passed, ' + fail + ' failed'); process.exitCode = 1; return; }

/* ================= TEST 1 : forced evacuation ================= */
section('T1 零击杀倒下强制撤离');
const MAIN_KEY = 'deepAbyssKitchenV161';
game.newGame();
ok('newGame 建立 meta', !!game.meta);
ok('newGame 写入统一存档键', storage._map.has(MAIN_KEY));
ok('newGame 清除全部旧存档键', [...storage._map.keys()].every(k => k === MAIN_KEY), [...storage._map.keys()].join(','));

game.phase = 'HUNT'; game.active = true; game.daily.mapKills = 0;
game.player.hp = 0; game.metaFresh = 80;
game.handlePlayerDown();
ok('零击杀倒下进入 SCAVENGE', game.phase === 'SCAVENGE', game.phase);
ok('新鲜度只扣一次 (80 -> 58)', Math.abs(game.metaFresh - 58) < 0.01, String(game.metaFresh));
const freshAfter = game.metaFresh;
game.handlePlayerDown();
ok('重复倒下不再重复扣减', game.metaFresh === freshAfter);

game.newGame(); game.phase = 'HUNT'; game.active = true; game.daily.mapKills = 0;
game.evacuate();
ok('手动撤离零击杀仍被拦截', game.phase === 'HUNT');
game.daily.mapKills = 1; game.evacuate();
ok('手动撤离有击杀可进入 SCAVENGE', game.phase === 'SCAVENGE');

// integration: real updateHunt death path
let integErr = null;
try {
  game.newGame(); game.launchHunt();
  ok('launchHunt 进入 HUNT', game.phase === 'HUNT');
  game.daily.mapKills = 0; game.player.hp = 0;
  game.updateHunt(0.016);
  ok('updateHunt 死亡自动强制撤离', game.phase === 'SCAVENGE', game.phase);
} catch (e) { integErr = e; ok('updateHunt 死亡路径无异常', false, e.message); }

/* ================= TEST 2 : save checkpoints ================= */
section('T2 存档检查点 / 防刷新复制');
game.newGame();
const snap = storage.getItem(MAIN_KEY);
ok('startDay 已写入当天开始快照', !!snap);

game.meta.inventory.herb += 50;
game.meta.gold += 9999;
game.unlockRecipes();
game.meta.garden[0] = { seedId: 'herbSeed', crop: 'herb', plantedDay: 1, readyDay: 9 };
game.plotAction(0);
ok('中途解锁菜谱 / 种植不写盘', storage.getItem(MAIN_KEY) === snap);

let finErr = null;
try {
  game.phase = 'BISTRO'; game.active = true; game.finishDay();
  ok('finishDay 进入 REPORT', game.phase === 'REPORT', game.phase);
  ok('日结算不写盘', storage.getItem(MAIN_KEY) === snap);
} catch (e) { finErr = e; ok('finishDay 无异常', false, e.message); }

game.nextDay();
const snap2 = storage.getItem(MAIN_KEY);
ok('进入下一天写入新检查点', snap2 !== snap);
ok('新检查点 day 递增到 2', snap2 && JSON.parse(snap2).day === 2, snap2 && JSON.parse(snap2).day);

// legacy migration
storage._map.clear();
const inv = game.blankInventory(); inv.herb = 3;
storage.setItem('deepAbyssKitchenV16', JSON.stringify({ day: 5, gold: 777, inventory: inv, recipes: ['steak_basic'], seen: { meat_basic: true }, weapons: { cleaver: true }, selectedWeapon: 'cleaver', preservation: 1 }));
game.meta = null;
game.continueGame();
ok('旧 V16 存档可迁移', !!game.meta && game.meta.day === 5 && game.meta.gold === 777, game.meta && (game.meta.day + '/' + game.meta.gold));
ok('迁移后写入统一主键', storage._map.has(MAIN_KEY));
ok('迁移后旧键已清理', [...storage._map.keys()].every(k => k === MAIN_KEY), [...storage._map.keys()].join(','));

// corrupted save must NOT be silently wiped
storage._map.clear();
storage.setItem(MAIN_KEY, '{broken json');
game.meta = null;
let threw = false;
try { game.continueGame(); } catch (e) { threw = true; }
ok('损坏存档不抛异常', !threw);
ok('损坏存档原文件被保留', storage.getItem(MAIN_KEY) === '{broken json');
ok('损坏存档不自动开始新游戏', game.meta === null);
ok('损坏存档给出提示', warns.some(w => w.includes('存档损坏')) || els.has('toast'));

// storage disabled
storage.throwWrite = true;
let t1 = false; try { game.save(); game.refreshContinue(); } catch (e) { t1 = true; }
ok('写入被禁用时不抛异常', !t1);
storage.throwWrite = false;
storage.throwRead = true;
let t2 = false; try { game.refreshContinue(); game.continueGame(); } catch (e) { t2 = true; }
ok('读取被禁用时不抛异常', !t2);
storage.throwRead = false;

/* ================= TEST 3 : weapon rendering ================= */
section('T3 六种武器绘制分支');
game.newGame();
game.player = { x: 100, y: 100, angle: 0, invuln: 0, hp: 100, vx: 0, vy: 0 };
const warnBase = warns.length;
for (const id of requiredWeapons) {
  game.meta.selectedWeapon = id;
  colorLog.length = 0;
  let e = false; try { game.drawPlayer(); } catch (err) { e = true; }
  ok('drawPlayer 不抛异常: ' + id, !e);
  ok('drawWeapon 产生绘制指令: ' + id, colorLog.length > 0);
}
ok('6 种已知武器零告警', warns.length === warnBase, warns.slice(warnBase).join(' | '));

function colorsFor(id) { game.meta.selectedWeapon = id; colorLog.length = 0; game.drawPlayer(); return [...colorLog]; }
const chakram = colorsFor('frostChakram');
ok('厨剪绘制不同于回旋刃', JSON.stringify(colorsFor('kitchenShears')) !== JSON.stringify(chakram));
ok('厨叉绘制不同于回旋刃', JSON.stringify(colorsFor('saltFork')) !== JSON.stringify(chakram));
ok('厨剪使用专属配色 #ffb3c7', colorsFor('kitchenShears').includes('#ffb3c7'));
ok('厨叉使用专属配色 #ffe6a2', colorsFor('saltFork').includes('#ffe6a2'));
const warnBase2 = warns.length;
game.meta.selectedWeapon = 'weaponDoesNotExist';
game.drawPlayer();
ok('未知武器显式告警而非静默回旋刃', warns.length > warnBase2);

/* ================= TEST 4 : delayed callbacks ================= */
section('T4 延迟回调与阶段守卫');
game.newGame();
const origFinish = game.finishDay, origSpawn = game.spawnCustomer;
let finishCalls = 0, spawnCalls = 0;
game.finishDay = () => { finishCalls++; };
game.spawnCustomer = () => { spawnCalls++; };

game.phase = 'BISTRO'; game.scheduleFinishDay(); flushTimers();
ok('营业阶段延迟结算正常触发', finishCalls === 1, String(finishCalls));

finishCalls = 0;
game.phase = 'BISTRO'; game.scheduleFinishDay();
game.phase = 'TITLE';                    // 模拟返回菜单
flushTimers();
ok('返回菜单后延迟结算被拦截', finishCalls === 0, String(finishCalls));

finishCalls = 0;
game.phase = 'BISTRO'; game.scheduleFinishDay();
game.toTitle();                          // 真实返回标题路径
flushTimers();
ok('toTitle 取消待执行的结算回调', finishCalls === 0, String(finishCalls));

game.phase = 'BISTRO'; game.scheduleSpawnCustomer();
game.startDay();                         // 跨天递增 session
flushTimers();
ok('跨天后旧生成顾客回调被取消', spawnCalls === 0, String(spawnCalls));

game.finishDay = origFinish;
game.spawnCustomer = origSpawn;
game.phase = 'TITLE'; game.finishDay();
ok('非营业阶段无法进入结算', game.phase === 'TITLE', game.phase);
game.phase = 'REPORT'; game.finishDay();
ok('重复结算被守卫拦截', game.phase === 'REPORT');

/* ================= TEST 5 : 7-day smoke ================= */
section('T5 连续 7 天流程冒烟');
let dayReached = 0, loopErr = null;
try {
  game.newGame();
  for (let i = 0; i < 7; i++) {
    game.phase = 'BISTRO'; game.active = true;
    game.daily.served = 3; game.daily.serveTarget = 3;
    game.finishDay();
    if (game.phase !== 'REPORT') throw new Error('第 ' + (i + 1) + ' 天未进入 REPORT');
    game.nextDay();
    dayReached = game.meta.day;
  }
} catch (e) { loopErr = e; }
ok('连续 7 天日循环无异常', !loopErr, loopErr && loopErr.message);
ok('7 次循环后到达 DAY 8', dayReached === 8, String(dayReached));

realLog('\n================ RESULT: ' + pass + ' passed, ' + fail + ' failed ================');
if (fail > 0) process.exitCode = 1;
