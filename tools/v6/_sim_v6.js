/* 60-day deterministic economy simulation for V6.
   Drives the real game systems (spawn/kill/serve/finishDay/buy) with a fixed RNG
   and reports the three tuning metrics plus sink exhaustion. */
const fs = require('fs');
const vm = require('vm');
const TARGET = process.argv[2] || 'abyss-kitchen-v6.html';
const html = fs.readFileSync(TARGET, 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];

function makeStorage() {
  const m = new Map();
  return { _map: m, getItem(k) { return m.has(k) ? m.get(k) : null; }, setItem(k, v) { m.set(k, String(v)); }, removeItem(k) { m.delete(k); }, key(i) { const a = [...m.keys()]; return a[i] === undefined ? null : a[i]; }, get length() { return m.size; } };
}
let timerSeq = 0; const timers = new Map();
const setTimeoutStub = (fn, ms) => { const id = ++timerSeq; timers.set(id, { fn, ms }); return id; };
const ctx2d = new Proxy({}, { get: () => () => undefined, set: () => true });
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
sandbox.__seed = 20261122;
vm.createContext(sandbox);
vm.runInContext('globalThis.window=globalThis;Math.random=()=>{__seed=(__seed*1103515245+12345)%2147483648;return __seed/2147483648};', sandbox);
let loadError = null;
try { vm.runInContext(script, sandbox); } catch (e) { loadError = e; }
const game = sandbox.game;
if (!game || loadError) { console.error('LOAD FAIL', loadError && loadError.message); process.exit(1); }

const UP_PRICE = {
  preservation: l => 280 + l * 180,
  decorLevel: l => 260 + l * 170,
  ledgerLevel: l => 330 + l * 210,
  sharpenerLevel: l => 410 + l * 240
};
const SECRETS = ['void_risotto', 'ember_eye', 'frost_chowder', 'royal_tentacle', 'final_course'];
const SECRET_COST = { void_risotto: 1500, ember_eye: 1800, frost_chowder: 2200, royal_tentacle: 2600, final_course: 3000 };
const WEAPON_ORDER = [['kitchenShears', 280], ['saltFork', 320], ['abyssBlade', 680], ['magmaCannon', 980], ['frostChakram', 1280]];

function sinkCount() {
  const m = game.meta;
  let n = 0;
  n += Object.entries(m.weapons).filter(([k, v]) => v && k !== 'cleaver').length;
  n += (m.preservation || 0) + (m.decorLevel || 0) + (m.ledgerLevel || 0) + (m.sharpenerLevel || 0);
  n += m.theme ? 1 : 0;
  n += Object.keys(m.staff || {}).length;
  n += m.recipes.filter(id => SECRETS.includes(id)).length;
  return n;
}
const SINK_TOTAL = 5 + 12 + 1 + 2 + 5;

function buyStrategy() {
  const m = game.meta;
  for (const [id, price] of WEAPON_ORDER) {
    if (m.gold >= price && !m.weapons[id]) { game.buy('weapon', id, price); break; }
  }
  for (const id of ['sharpenerLevel', 'preservation', 'decorLevel', 'ledgerLevel']) {
    const lv = m[id] || 0;
    if (lv < 3) { const p = UP_PRICE[id](lv); if (m.gold >= p) { game.buy('upgrade', id, p); return; } }
  }
  if (!m.staff.cook && m.gold >= 3000) { game.buyV3('staff', 'cook', 3000); return; }
  if (!m.theme && m.gold >= 1800) { game.buyV3('theme', 'abyss', 1800); return; }
  for (const id of SECRETS) {
    if (!m.recipes.includes(id) && m.gold >= SECRET_COST[id]) { game.buyV3('secret', id, SECRET_COST[id]); return; }
  }
  if (!m.weaponEvolved.cleaver && m.gold >= 800 && (m.cores || 0) >= 3) { game.buyEvolution('cleaver'); return; }
}

game.newGame();
const rows = [];
let debtDays = 0, masteryDay = 0, sinkDay = 0, peakGold = 0;

for (let i = 0; i < 60; i++) {
  // --- hunt: rotate maps so recipes unlock like a real player ---
  const MAP_ROTATION = ['ABYSS', 'VOLCANO', 'ICE'];
  const ENEMY_BY_MAP = { ABYSS: ['blob', 'tentacle', 'eye'], VOLCANO: ['magma', 'skeleton', 'blob'], ICE: ['wisp', 'slime', 'skeleton'] };
  const mapId = game.meta.day >= 3 ? MAP_ROTATION[game.meta.day % 3] : (game.meta.day === 2 ? 'VOLCANO' : 'ABYSS');
  game.meta.selectedMap = mapId;
  game.daily.mode = 'free';
  game.launchHunt();
  game.spawnEnemy = () => {};
  game.enemies = [];
  const pool = ENEMY_BY_MAP[mapId];
  for (let k = 0; k < 10; k++) {
    const type = pool[k % pool.length];
    const e = { type, x: 100, y: 100, hp: 100, max: 100, hit: 0, vx: 0, vy: 0, dead: false, elite: k === 0 };
    game.enemies.push(e);
    for (let h = 0; h < 3; h++) game.hitEnemy(e, 15, 0, 0);
    e.hp = 1;
    game.killEnemy(e);
  }
  game.evacuate();

  // --- bistro: 4 guests ---
  game.phase = 'BISTRO'; game.active = true;
  const known = vm.runInContext('RECIPES', sandbox).filter(r => game.meta.recipes.includes(r.id));
  const avg = known.reduce((a, r) => a + r.price, 0) / Math.max(1, known.length);
  game.daily.served = 4; game.daily.serveTarget = 4;
  game.daily.gross = Math.round(avg * 4 * 0.92);
  game.daily.tips = Math.round(avg * 4 * 0.12);
  game.daily.wrong = 0; game.daily.bestStreak = 4;
  game.finishDay();

  const income = game.daily.gross + game.daily.tips + game.daily.huntGold + game.daily.missionGold;
  const cost = game.daily.cost;
  const rent = game.daily.rent || 0;
  if (game.meta.gold < 0) debtDays++;
  peakGold = Math.max(peakGold, game.meta.gold);
  if (!masteryDay && game.masteryOf('cleaver') >= 100) masteryDay = game.meta.day;
  if (!sinkDay && sinkCount() >= SINK_TOTAL) sinkDay = game.meta.day;
  rows.push({ day: game.meta.day, gold: Math.round(game.meta.gold), income, cost, rent, rentRatio: income > 0 ? +(rent / income * 100).toFixed(1) : 0, mastery: Math.round(game.masteryOf('cleaver')), sink: sinkCount() });

  buyStrategy();
  game.nextDay();
}

const d3 = rows.find(r => r.day === 3) || rows[2];
const d10 = rows.find(r => r.day === 10) || rows[9];
const d30 = rows.find(r => r.day === 30) || rows[29];
const d60 = rows[rows.length - 1];
const avgRentRatio = +(rows.reduce((a, r) => a + r.rentRatio, 0) / rows.length).toFixed(1);

console.log('=== 60 天经济模拟（固定随机种子）===');
console.log('DAY  GOLD   INCOME  COST  RENT  RENT/INCOME  MASTERY  SINK');
for (const r of rows.filter(r => r.day % 5 === 0 || r.day <= 3)) {
  console.log(String(r.day).padStart(3), String(r.gold).padStart(6), String(r.income).padStart(7), String(r.cost).padStart(5), String(r.rent).padStart(5), String(r.rentRatio + '%').padStart(11), String(r.mastery).padStart(8), String(r.sink + '/25').padStart(6));
}
console.log('\n--- 关键指标 ---');
console.log('第 3 天金币:', d3.gold, '| 已买第二把武器:', d3.gold >= 0 && game.meta.weapons.kitchenShears ? '是' : '否（模拟结束状态）');
console.log('第 10 天房租/收入:', d10.rentRatio + '%', '| 房租', d10.rent + 'G | 成本', d10.cost + 'G | 收入', d10.income + 'G');
console.log('第 30 天金币:', d30.gold, '| sink:', d30.sink + '/25');
console.log('第 60 天金币:', d60.gold, '| sink:', d60.sink + '/25');
console.log('专精满级天数:', masteryDay || '60 天内未满级');
console.log('买空全部 sink 天数:', sinkDay || '60 天内未买空');
console.log('负债天数:', debtDays);
console.log('峰值金币:', peakGold);
console.log('平均房租占收入:', avgRentRatio + '%');

fs.writeFileSync('v6-sim-report.json', JSON.stringify({ rows, summary: { d3, d10, d30, d60, masteryDay, sinkDay, debtDays, peakGold, avgRentRatio } }, null, 2));
console.log('\n[已写入 v6-sim-report.json]');
