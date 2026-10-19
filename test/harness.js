/* =========================================================
 * test/harness.js — 无浏览器冒烟测试
 * 用桩（stub）模拟 DOM / Canvas / 输入，按序加载全部脚本，
 * 实例化游戏并模拟数分钟战斗（含 Boss、升级、死亡、重开），
 * 任何引用错误 / 异常都会在这里抛出。
 * 运行：node test/harness.js
 * ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- Canvas 2D 上下文桩：吞掉所有绘制调用 ---------- */
function makeCtx() {
  const grad = { addColorStop() {} };
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => grad;
      }
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop in t) return t[prop];
      return () => {};
    },
    set(t, prop, v) { t[prop] = v; return true; }
  });
}

/* ---------- DOM 元素桩 ---------- */
function makeEl(id) {
  return {
    id,
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    textContent: '',
    innerHTML: '',
    width: 480,
    height: 480,
    setAttribute() {},
    getAttribute() { return '0'; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 800 }; },
    getContext() { return makeCtx(); },
    closest() { return null; }
  };
}

const elements = {};
const documentStub = {
  hidden: false,
  readyState: 'loading',
  getElementById(id) { if (!elements[id]) elements[id] = makeEl(id); return elements[id]; },
  createElement(tag) { const el = makeEl(tag); return el; },
  addEventListener() {}
};

/* ---------- 沙箱 ---------- */
const sandbox = {
  console,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 1,       // 不自动跑帧，由测试手动驱动
  document: documentStub,
  localStorage: {
    _v: null,
    getItem() { return this._v; },
    setItem(v) { this._v = v; },
    removeItem() { this._v = null; }
  },
  addEventListener() {},
  devicePixelRatio: 1,
  setTimeout: () => 0,
  clearTimeout: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ---------- 按 index.html 的顺序加载脚本 ---------- */
const jsDir = path.join(__dirname, '..', 'js');
const files = ['utils.js', 'config.js', 'input.js', 'background.js', 'sound.js', 'entities.js', 'game.js'];
for (const f of files) {
  const code = fs.readFileSync(path.join(jsDir, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: 'js/' + f });
}

const GW = sandbox.GW;
if (!GW || !GW.Game) throw new Error('GW.Game 未定义');

/* ---------- 实例化 ---------- */
const canvas = elements['game-canvas'] || (elements['game-canvas'] = makeEl('game-canvas'));
const game = new GW.Game(canvas);
console.log('[1] 构造 OK，状态 =', game.state);

/* ---------- 模拟 60 秒普通战斗（自动开火 + 随机移动） ---------- */
game.start();
const dt = 1 / 60;
function simulate(seconds, label) {
  for (let i = 0; i < seconds * 60; i++) {
    game.update(dt);
    game.render();
  }
  console.log('   ' + label + ' -> state=' + game.state +
    ' score=' + game.score + ' wave=' + game.wave +
    ' enemies=' + game.enemies.length + ' bullets=' + game.bullets.length +
    ' particles=' + game.particles.length);
}

simulate(60, '60s 战斗');

/* ---------- 升级流程（先重开一局） ---------- */
game.start();
game.gainXp(5000);                       // 连续升级
console.log('[2] 升级流程：state =', game.state, ' pendingLevelUps =', game.pendingLevelUps);
let guard = 0;
while (game.state === 'levelup' && guard++ < 50) {
  game.render();                          // 升级界面渲染
  game.chooseUpgrade(0);
}
console.log('   升级后 player: level=' + game.player.level +
  ' hp=' + game.player.hp + '/' + game.player.maxHp +
  ' bullets=' + game.player.weapon.count +
  ' wingmen=' + game.player.wingmen.length +
  ' shield=' + game.player.shield +
  ' pierce=' + game.player.weapon.pierce);
simulate(10, '升级后战斗');

/* ---------- Boss 波 ---------- */
game.startWave(5);
console.log('[3] Boss 波：boss =', game.boss && game.boss.name, ' hp =', game.boss && game.boss.hp);
game.render();
simulate(30, 'Boss 战 30s');

/* ---------- 强制击杀 Boss，验证死亡奖励 ---------- */
if (game.boss && !game.boss.dead) {
  game.boss.hp = 1;
  game.bullets.push(new GW.entities.Bullet(
    game.boss.x, game.boss.y, 0, -100,
    { friendly: true, damage: 999 }
  ));
  simulate(4, 'Boss 死亡演出');
}
console.log('   bossActive =', game.bossActive, ' items =', game.items.length);

/* ---------- 玩家死亡 → 结算 → 重开 ---------- */
game.player.invuln = 0;
game.player.shield = 0;
for (let i = 0; i < 10 && !game.player.dead; i++) game.player.hurt(game, 99);
simulate(3, '死亡演出');
console.log('[4] 结算：state =', game.state, ' score =', game.score, ' best =', game.best);

game.start();
console.log('[5] 重开：state =', game.state, ' score =', game.score, ' wave =', game.wave);
simulate(10, '重开 10s');

/* ---------- 暂停 / 恢复 ---------- */
game.pause();
console.log('[6] 暂停：state =', game.state);
game.update(dt);
game.render();
game.resume();
simulate(5, '恢复 5s');

console.log('\n✅ 冒烟测试通过：无控制台错误，全状态机流转正常。');
