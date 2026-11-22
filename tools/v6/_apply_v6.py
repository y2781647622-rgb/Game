# -*- coding: utf-8 -*-
"""V6: weapon affixes, guild loan / futures, and mobile touch controls (on V5)."""
from pathlib import Path

SRC = Path('abyss-kitchen-v5.html')
OUT = Path('abyss-kitchen-v6.html')
text = SRC.read_text(encoding='utf-8')


def rep(name, old, new, expected=1):
    global text
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'[FAIL] {name}: expected {expected}, got {count}\n  old={old[:140]!r}')
    text = text.replace(old, new)
    print(f'[OK] {name} ({count})')


# 暴击倍率改为可被词条影响
rep('暴击倍率改为读取 critMul()',
    'let dmg=Math.round(damage*(crit?1.8:1)*this.comboMul()*(1+codex));',
    'let dmg=Math.round(damage*(crit?this.critMul():1)*this.comboMul()*(1+codex));')

# ---- V6.1 经济配平（模拟驱动） ----
rep('房租改为温和增长',
    'const rent=20+game.meta.day*4+(cycle-1)*15;',
    'const rent=10+game.meta.day*2+(cycle-1)*12;')
rep('周目成本系数 .12 -> .10',
    '*(1+.12*(cycle-1))*(1-.12*ledger));',
    '*(1+.10*(cycle-1))*(1-.12*ledger));')
rep('负债利息封顶 200G',
    'const interest=Math.max(1,Math.floor(debt*.05));',
    'const interest=Math.min(200,Math.max(1,Math.floor(debt*.05)));')
rep('专精积累速率下调（满级约 7 天）',
    'Math.min(12,Math.max(1,damage*.06))',
    'Math.min(8,Math.max(0.3,damage*.035))')

# CSS
V6_CSS = r"""
/* ==================== V6 · 移动端触摸控制 ==================== */
#touchControls{position:fixed;inset:0;z-index:88;pointer-events:none;display:none}
#touchControls.active{display:block}
#joystick{position:absolute;left:22px;bottom:22px;width:124px;height:124px;border-radius:50%;
  border:2px solid rgba(255,216,91,.45);background:rgba(0,0,0,.34);pointer-events:auto;touch-action:none}
#stick{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;
  background:rgba(255,216,91,.62);box-shadow:0 0 18px rgba(255,216,91,.45)}
#touchBtns{position:absolute;right:18px;bottom:26px;display:flex;gap:14px;pointer-events:auto}
#touchBtns button{width:74px;height:74px;border-radius:50%;font-size:28px;color:#ffd85b;
  background:rgba(36,18,14,.86);border:2px solid rgba(255,216,91,.5);box-shadow:0 6px 18px rgba(0,0,0,.5)}
#touchBtns button:active{background:rgba(255,216,91,.28)}
#touchHint{position:absolute;left:50%;top:14px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;
  background:rgba(0,0,0,.62);color:#ffd85b;font-size:12px;display:none;pointer-events:none;white-space:nowrap}
@media(pointer:coarse){#touchHint{display:block}}
"""
rep('插入触摸控制样式', '</style>', V6_CSS + '</style>')

# DOM
V6_DOM = r"""<div id="touchControls">
  <div id="touchHint">左摇杆移动 · 右侧攻击 / 闪避（自动瞄准最近敌人）</div>
  <div id="joystick"><div id="stick"></div></div>
  <div id="touchBtns"><button id="btnAttack" type="button">⚔️</button><button id="btnDash" type="button">💨</button></div>
</div>
"""
rep('插入触摸控制 DOM', '<div id="diveBar"', V6_DOM + '<div id="diveBar"')

V6_JS = r"""
/* ==================== V6 · 武器词条 / 公会金融 / 触摸控制 ==================== */
const V6_AFFIXES=[
  {id:'crit',name:'锐利',desc:'暴击率',min:3,max:9,unit:'%'},
  {id:'critDmg',name:'致命',desc:'暴击伤害',min:15,max:40,unit:'%'},
  {id:'range',name:'延展',desc:'攻击范围',min:6,max:18,unit:'%'},
  {id:'speed',name:'迅捷',desc:'攻击速度',min:4,max:12,unit:'%'},
  {id:'element',name:'蚀刻',desc:'元素强度',min:10,max:30,unit:'%'},
  {id:'elite',name:'猎杀',desc:'精英金币',min:10,max:30,unit:'%'},
  {id:'leech',name:'汲取',desc:'击杀回复',min:1,max:3,unit:'点'}
];
const V6_IS_TOUCH=(typeof navigator!=='undefined'&&navigator.maxTouchPoints>0)||('ontouchstart' in window);

const V6_attack=game.attack;
const V6_hitEnemy=game.hitEnemy;
const V6_killEnemy=game.killEnemy;
const V6_renderPrep=game.renderPrep;
const V6_renderMarket=game.renderMarket;
const V6_renderReport=game.renderReport;
const V6_finishDay=game.finishDay;
const V6_newGame=game.newGame;
const V6_continueGame=game.continueGame;
const V6_update=game.update;

Object.assign(game,{
  ensureV6Meta(){
    if(!this.meta)return;
    if(!this.meta.weaponAffix||typeof this.meta.weaponAffix!=='object')this.meta.weaponAffix={};
    if(typeof this.meta.loan!=='number')this.meta.loan=0;
    if(!('futures' in this.meta))this.meta.futures=null;
  },
  affixOf(id){const a=this.meta&&this.meta.weaponAffix&&this.meta.weaponAffix[id||(this.meta&&this.meta.selectedWeapon)];return a||null},
  affixValue(type){const a=this.affixOf();return a&&a.id===type?a.value:0},
  critChance(){
    const base=.10+(this.meta.sharpenerLevel||0)*.02+this.perkCount('forage')*.02;
    return clamp(base+(this.affixValue('crit')||0)/100,0,.60);
  },
  critMul(){return 1.8+(this.affixValue('critDmg')||0)/100},

  /* ---- 词条重铸 ---- */
  rerollAffix(){
    this.ensureV6Meta();
    const w=this.meta.selectedWeapon;
    if((this.meta.cores||0)<1){this.toast('需要 1 个精英核心');return}
    if(this.meta.gold<200){this.toast('金币不足');return}
    this.meta.cores-=1;this.meta.gold-=200;
    const def=V6_AFFIXES[Math.floor(Math.random()*V6_AFFIXES.length)];
    const tier=1+Math.floor(Math.random()*3);
    const value=Math.round(def.min+(def.max-def.min)*((tier-1)/2));
    this.meta.weaponAffix[w]={id:def.id,value,tier};
    this.toast(`附魔：${def.name} · ${def.desc} +${value}${def.unit}`);
    this.renderMarket();this.updateHUD();this.renderPrep();
  },

  /* ---- 公会金融 ---- */
  takeLoan(){
    this.ensureV6Meta();
    if(this.meta.loan>=9000){this.toast('贷款额度已满');return}
    this.meta.loan+=3000;this.meta.gold+=3000;
    this.toast('公会贷款 +3000G（每日利息 3%）');
    this.renderMarket();this.updateHUD();
  },
  repayLoan(){
    this.ensureV6Meta();
    if(!this.meta.loan){this.toast('没有负债');return}
    if(this.meta.gold<this.meta.loan){this.toast('金币不足，无法还清');return}
    const paid=this.meta.loan;
    this.meta.gold-=paid;this.meta.loan=0;
    this.toast(`已还清贷款 ${paid}G`);
    this.renderMarket();this.updateHUD();
  },
  investFutures(){
    this.ensureV6Meta();
    if(this.meta.futures){this.toast('已有一笔期货在途');return}
    if(this.meta.gold<800){this.toast('金币不足');return}
    this.meta.gold-=800;
    this.meta.futures={amount:800,dueDay:this.meta.day+3};
    this.toast('香料期货已买入，3 天后结算');
    this.renderMarket();this.updateHUD();
  },
  settleFinance(){
    if(!this.meta)return;
    this.ensureV6Meta();
    if(this.meta.loan>0){
      const interest=Math.ceil(this.meta.loan*.03);
      this.meta.gold-=interest;
      if(this.daily)this.daily.loanInterest=interest;
    }
    if(this.meta.futures&&this.meta.day>=this.meta.futures.dueDay){
      const win=Math.random()<.75;
      const back=win?1100:0;
      this.meta.gold+=back;
      if(this.daily)this.daily.futuresBack=back;
      this.meta.futures=null;
      this.toast(win?`香料期货获利：+${back}G`:'香料期货暴跌：血本无归');
    }
  },

  /* ---- 战斗接入 ---- */
  attack(){
    const a0=this.attacks.length;
    V6_attack.call(this);
    const rb=1+(this.affixValue('range')||0)/100;
    if(rb!==1){
      for(let i=a0;i<this.attacks.length;i++)this.attacks[i].range=Math.round(this.attacks[i].range*rb);
    }
    const spd=this.affixValue('speed')||0;
    if(spd&&this.player)this.player.attackCd*=1-spd/100;
  },
  hitEnemy(e,damage,kb,a){
    const wasDead=!!(e&&e.dead);
    V6_hitEnemy.call(this,e,damage,kb,a);
    if(!e||wasDead||!this.meta)return;
    const el=this.affixValue('element')||0;
    if(el&&!e.dead){
      if(e.bleed){e.bleed*=1+el/100;e.bleedDamage=Math.round((e.bleedDamage||3)*(1+el/100))}
      if(e.burn){e.burn*=1+el/100;e.burnDamage=Math.round((e.burnDamage||3)*(1+el/100))}
      if(e.slow)e.slow*=1+el/100;
    }
  },
  killEnemy(e){
    const wasDead=!!(e&&e.dead);
    V6_killEnemy.call(this,e);
    if(!e||wasDead||!e.dead||!this.meta)return;
    const leech=this.affixValue('leech')||0;
    if(leech&&this.player)this.player.hp=clamp(this.player.hp+leech,0,this.player.maxHp);
    const eb=this.affixValue('elite')||0;
    if(eb&&e.elite){
      const g=Math.round(10*(1+eb/100));
      if(this.daily)this.daily.huntGold+=g;
      this.float(e.x,e.y-116,`+${g}G`,'#ffd85b');
    }
  },
  finishDay(){
    V6_finishDay.call(this);
    if(this.phase==='REPORT'){this.settleFinance();this.applyDebt();this.renderReport()}
  },

  /* ---- UI ---- */
  renderPrep(){
    V6_renderPrep.call(this);
    const ws=$('weaponCards');if(!ws||!this.meta)return;
    this.ensureV6Meta();
    [...ws.children].forEach((card,i)=>{
      const id=V15_WEAPON_IDS[i];if(!id)return;
      const a=this.meta.weaponAffix[id];if(!a)return;
      const def=V6_AFFIXES.find(x=>x.id===a.id);
      const info=document.createElement('div');
      info.className='tiny';
      info.innerHTML=`<span class="${a.tier===3?'gold':a.tier===2?'green':'purple'}">附魔 · ${def?def.name:a.id} +${a.value}${def?def.unit:''}</span>`;
      card.appendChild(info);
    });
  },
  renderMarket(){
    V6_renderMarket.call(this);
    const root=$('marketItems');if(!root||!this.meta)return;
    this.ensureV6Meta();
    const w=this.meta.selectedWeapon,a=this.meta.weaponAffix[w];
    const ad=document.createElement('div');ad.className='card shopCard';
    ad.innerHTML=`<div><span class="iconBig">🔮</span><h3>附魔重铸 · ${WEAPONS[w]?WEAPONS[w].name:w}</h3><p class="small">${a?`当前：${(V6_AFFIXES.find(x=>x.id===a.id)||{}).name||a.id} +${a.value}`:'尚未附魔'} · 消耗 1 精英核心 + 200G，随机词条。</p></div><button class="primary" onclick="game.rerollAffix()">重铸</button>`;
    root.appendChild(ad);

    const fd=document.createElement('div');fd.className='card shopCard';
    fd.innerHTML=`<div><span class="iconBig">🏦</span><h3>公会贷款</h3><p class="small">立即获得 3000G，每日利息 3%（约 ${Math.ceil((this.meta.loan||0)*.03)}G/天）。当前欠款 ${this.meta.loan||0}G。</p></div><div class="row"><button class="primary" onclick="game.takeLoan()">借款 3000G</button><button class="good" onclick="game.repayLoan()">还清</button></div>`;
    root.appendChild(fd);

    const fu=this.meta.futures;
    const ff=document.createElement('div');ff.className='card shopCard';
    ff.innerHTML=`<div><span class="iconBig">🌶️</span><h3>香料期货</h3><p class="small">投入 800G，3 天后 75% 返还 1100G，25% 血本无归。${fu?`已在途（DAY ${fu.dueDay} 结算）`:''}</p></div><button class="primary" onclick="game.investFutures()">投资 800G</button>`;
    root.appendChild(ff);
  },
  renderReport(){
    V6_renderReport.call(this);
    const el=$('reportText');if(!el||!this.daily)return;
    if(this.daily.loanInterest)el.innerHTML+=`<br/><span class="tiny">贷款利息：-${this.daily.loanInterest}G</span>`;
    if(this.daily.futuresBack!==undefined)el.innerHTML+=`<br/><span class="tiny">期货结算：${this.daily.futuresBack>0?'+':''}${this.daily.futuresBack}G</span>`;
  },

  /* ---- 触摸控制 ---- */
  initTouch(){
    const root=$('touchControls');if(!root)return;
    if(!V6_IS_TOUCH)return;
    root.classList.add('active');
    this.touchAimEnabled=true;
    const base=$('joystick'),stick=$('stick');
    let sid=null,cx=0,cy=0;
    const reset=()=>{sid=null;if(stick)stick.style.transform='';this.updateStick(0,0)};
    if(base){
      base.addEventListener('touchstart',e=>{
        const t=e.changedTouches[0];sid=t.identifier;
        const r=base.getBoundingClientRect();cx=r.left+r.width/2;cy=r.top+r.height/2;
        this.moveStick(t,cx,cy,stick);e.preventDefault();
      },{passive:false});
      base.addEventListener('touchmove',e=>{
        for(const t of e.changedTouches){if(t.identifier===sid){this.moveStick(t,cx,cy,stick);break}}
        e.preventDefault();
      },{passive:false});
      base.addEventListener('touchend',e=>{for(const t of e.changedTouches){if(t.identifier===sid){reset();break}}},{passive:false});
      base.addEventListener('touchcancel',reset,{passive:false});
    }
    const atk=$('btnAttack'),dash=$('btnDash');
    if(atk){
      atk.addEventListener('touchstart',e=>{this.mouse.down=true;e.preventDefault()},{passive:false});
      atk.addEventListener('touchend',e=>{this.mouse.down=false;e.preventDefault()},{passive:false});
      atk.addEventListener('touchcancel',()=>{this.mouse.down=false},{passive:false});
    }
    if(dash){
      dash.addEventListener('touchstart',e=>{this.keys[' ']=true;e.preventDefault()},{passive:false});
    }
  },
  moveStick(t,cx,cy,stick){
    const dx=clamp((t.clientX-cx)/50,-1,1),dy=clamp((t.clientY-cy)/50,-1,1);
    if(stick)stick.style.transform=`translate(${dx*38}px,${dy*38}px)`;
    this.updateStick(dx,dy);
  },
  updateStick(x,y){
    if(!this.keys)this.keys={};
    if(this._stickKeys)Object.keys(this._stickKeys).forEach(k=>{if(this._stickKeys[k])this.keys[k]=false});
    const d=.28;
    this._stickKeys={a:x<-d,d:x>d,w:y<-d,s:y>d};
    Object.keys(this._stickKeys).forEach(k=>{if(this._stickKeys[k])this.keys[k]=true});
  },
  applyTouchAim(){
    if(!this.touchAimEnabled||!this.player||!this.enemies||!this.enemies.length)return;
    let best=null,bd=1e9;
    for(const e of this.enemies){
      if(e.dead)continue;
      const d=dist(e.x,e.y,this.player.x,this.player.y);
      if(d<bd){bd=d;best=e}
    }
    if(best){this.mouse.x=best.x-this.camera.x;this.mouse.y=best.y-this.camera.y}
  },
  update(dt){this.applyTouchAim();V6_update.call(this,dt)},

  newGame(){V6_newGame.call(this);this.ensureV6Meta();this.save()},
  continueGame(){V6_continueGame.call(this);if(this.meta){this.ensureV6Meta();this.save()}}
});

game.initTouch();
/* ==================== /V6 ==================== */
"""

rep('插入 V6 词条/金融/触摸补丁', 'game.init();', V6_JS + '\ngame.init();')

OUT.write_text(text, encoding='utf-8')
print(f'\n[DONE] -> {OUT} ({len(text)} chars, {text.count(chr(10)) + 1} lines)')
