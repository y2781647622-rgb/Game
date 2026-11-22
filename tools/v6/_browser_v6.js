/* Real-browser check for V6: affix/finance UI + touch controls under touch emulation. */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const CHROME = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'google-chrome');
const TARGET = path.resolve(process.argv[2] || path.join(__dirname, '../../index.html'));
const TEMP_DIRECTORY = fs.realpathSync(os.tmpdir());
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJson(port, endpoint) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path: endpoint, timeout: 1000 }, r => {
      let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } });
    }).on('timeout', function () { this.destroy(new Error('CDP 请求超时')); }).on('error', rej);
  });
}
(async () => {
  let chrome = null;
  let ws = null;
  let profile = null;
  try {
    fs.accessSync(TARGET, fs.constants.R_OK);
    const output = process.argv[3] ? path.resolve(process.argv[3]) : fs.mkdtempSync(path.join(TEMP_DIRECTORY, 'abyss-v6-screenshots-'));
    fs.mkdirSync(output, { recursive: true });
    profile = fs.mkdtempSync(path.join(TEMP_DIRECTORY, 'abyss-v6-chrome-'));
    let launchError;
    chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--window-size=1280,800','--autoplay-policy=no-user-gesture-required',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, pathToFileURL(TARGET).href], { stdio: 'ignore', windowsHide: true });
    chrome.on('error', error => { launchError = error; });
    let targets = null;
    for (let i = 0; i < 50; i++) {
      await sleep(250);
      if (launchError) throw launchError;
      if (chrome.exitCode !== null) throw new Error(`Chrome 提前退出（${chrome.exitCode}）`);
      try {
        const [port] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n');
        const pages = await getJson(Number(port), '/json');
        if (pages.some(page => page.type === 'page')) { targets = pages; break; }
      } catch (e) {}
    }
    if (!targets) throw new Error('CDP 未就绪');
    const page = targets.find(t => t.type === 'page' && t.url === pathToFileURL(TARGET).href) || targets.find(t => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    const pending = new Map(); let seq = 0; const errors = [];
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push((d.exception && d.exception.description) || d.text); }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description || '').join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await sleep(1800);
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    };
    const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name), Buffer.from(s.data, 'base64')); };

    await ev(`[...document.querySelectorAll('button')].find(x=>x.getAttribute('onclick')==='game.newGame()').click()`);
    await sleep(600);
    await ev(`game.meta.weaponAffix={cleaver:{id:'crit',value:8,tier:3}};game.meta.cores=4;game.meta.gold=99999;game.meta.loan=3000;game.meta.futures={amount:800,dueDay:game.meta.day+3};game.renderPrep();document.getElementById('dialogue').classList.add('hidden');const pp=document.querySelector('#prep .panel');if(pp)pp.scrollTop=520;`);
    await sleep(400);
    const prep = await ev(`(()=>{const c=[...document.querySelectorAll('#weaponCards .card')];return{txt:c.map(x=>x.textContent).join('|'),n:c.length}})()`);
    await shot('v6-prep.png');

    await ev(`game.openMarket();const mp=document.querySelector('#market .panel');if(mp)mp.scrollTop=mp.scrollHeight;`);
    await sleep(500);
    const market = await ev(`document.getElementById('marketItems').textContent`);
    await shot('v6-market.png');

    await ev(`game.phase='BISTRO';game.active=true;game.meta.day=12;game.daily.gross=300;game.daily.tips=30;game.daily.huntGold=10;game.daily.missionGold=0;game.daily.served=4;game.daily.wrong=0;game.daily.serveTarget=4;game.daily.bestStreak=4;game.finishDay();`);
    await sleep(700);
    const report = await ev(`(()=>{const t=document.getElementById('reportText').textContent;return{interest:t.includes('贷款利息'),futures:t.includes('期货'),gold:game.meta.gold}})()`);
    await shot('v6-report.png');

    // touch emulation + reload
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.reload');
    await sleep(2200);
    await send('Runtime.enable'); await send('Log.enable');
    const touchActive = await ev(`document.getElementById('touchControls').classList.contains('active')`);
    await ev(`[...document.querySelectorAll('button')].find(x=>x.getAttribute('onclick')==='game.newGame()').click()`);
    await sleep(500);
    await ev(`[...document.querySelectorAll('button')].find(x=>x.getAttribute('onclick')==='game.launchHunt()').click()`);
    await sleep(800);
    const touchState = await ev(`({active:document.getElementById('touchControls').classList.contains('active'),aim:game.touchAimEnabled===true,phase:game.phase})`);
    await shot('v6-touch.png');

    console.log(JSON.stringify({ prep: { hasAffix: prep.txt.includes('附魔'), cards: prep.n }, market: { affix: market.includes('附魔重铸'), loan: market.includes('公会贷款'), futures: market.includes('香料期货') }, report, touchActive, touchState, errors }, null, 2));
    const fatal = errors.filter(e => !/favicon/i.test(e));
    if (!prep.txt.includes('附魔') || !market.includes('附魔重铸') || !market.includes('公会贷款') || !market.includes('香料期货') || !report.interest || !touchState.active || !touchState.aim || touchState.phase !== 'HUNT' || fatal.length) {
      console.error('\nV6 BROWSER CHECK FAILED'); process.exitCode = 1;
    } else console.log(`\nV6 BROWSER CHECK OK\n截图目录：${output}`);
  } catch (e) { console.error('CHECK ERROR:', e.message); process.exitCode = 1; }
  finally {
    if (ws) ws.close();
    if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      if (chrome.kill()) await exited;
    }
    if (profile && path.dirname(profile) === TEMP_DIRECTORY && path.basename(profile).startsWith('abyss-v6-chrome-')) {
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
      catch (e) { console.warn(`临时浏览器目录清理失败：${e.message}`); }
    }
  }
})();
