/* =========================================================
 * game.js — 主控：状态机 / 波次导演 / 碰撞 / HUD / 界面
 * 状态：menu → playing ⇄ paused / levelup → gameover
 * ========================================================= */
(function () {
  'use strict';
  window.GW = window.GW || {};

  var U = GW.utils;
  var CFG = GW.Config;
  var E = GW.entities;

  var BEST_KEY = 'plane-war-best';

  function $(id) { return document.getElementById(id); }
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  /* HUD 心形生命 */
  function drawHeart(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 10, size / 10);
    ctx.beginPath();
    ctx.moveTo(0, 3.5);
    ctx.bezierCurveTo(-5.5, -1.5, -3, -6.5, 0, -3.5);
    ctx.bezierCurveTo(3, -6.5, 5.5, -1.5, 0, 3.5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  /* =========================================================
   * Game
   * ========================================================= */
  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.state = 'menu';       // menu | playing | paused | levelup | gameover
    this.autoFire = true;      // 自动开火（F 切换）
    this.soundOn = true;

    this.stars = new GW.Starfield();
    this.reset();
    this.bindUI();
    this.resize();

    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
    window.addEventListener('orientationchange', function () { self.resize(); });

    GW.Input.init(canvas, this);

    // 标签页隐藏时自动暂停
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && self.state === 'playing') self.pause();
    });

    // 主循环
    var last = performance.now();
    (function loop(ts) {
      requestAnimationFrame(loop);
      var dt = Math.min((ts - last) / 1000, 0.05);   // 钳制 dt，防切后台跳变
      last = ts;
      self.update(dt);
      self.render();
    })(last);
  }

  /* ---------- 重置一局 ---------- */
  Game.prototype.reset = function () {
    this.player = new E.Player(this);
    this.bullets = [];
    this.enemies = [];
    this.items = [];
    this.particles = [];
    this.texts = [];
    this.scheduled = [];
    this.spawnQueue = [];
    this.score = 0;
    this.wave = 0;
    this.time = 0;
    this.boss = null;
    this.bossActive = false;
    this.bossIndex = 0;
    this.pendingLevelUps = 0;
    this.shake = 0;
    this.intermission = 1.2;
    this.waveActive = false;
    this.difficulty = 1;
    this.fireRateMul = 1;
    this.deathTimer = 0;
    this.best = this.loadBest();
  };

  /* ---------- 状态切换 ---------- */
  Game.prototype.start = function () {
    GW.Sound.ensure();
    GW.Sound.enabled = this.soundOn;
    this.reset();
    this.hideOverlays();
    this.state = 'playing';
  };

  Game.prototype.pause = function () {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    show(this.el.pause);
  };

  Game.prototype.resume = function () {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    hide(this.el.pause);
  };

  Game.prototype.gameOver = function () {
    this.state = 'gameover';
    if (this.score > this.best) {
      this.best = this.score;
      this.saveBest();
    }
    this.el.finalScore.textContent = this.score;
    this.el.finalBest.textContent = this.best;
    this.el.finalWave.textContent = Math.max(0, this.wave);
    this.el.finalLevel.textContent = this.player.level;
    this.el.bestMenu.textContent = this.best;
    show(this.el.gameover);
  };

  Game.prototype.hideOverlays = function () {
    hide(this.el.menu);
    hide(this.el.pause);
    hide(this.el.levelup);
    hide(this.el.gameover);
  };

  /* ---------- 工具 ---------- */
  Game.prototype.after = function (delay, fn) {
    this.scheduled.push({ t: delay, fn: fn });
  };

  Game.prototype.addFloatText = function (x, y, text, color, life, size) {
    this.texts.push(new E.FloatText(x, y, text, color, life, size));
  };

  Game.prototype.loadBest = function () {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; }
    catch (e) { return 0; }
  };

  Game.prototype.saveBest = function () {
    try { localStorage.setItem(BEST_KEY, String(this.best)); }
    catch (e) { /* 隐私模式下静默降级 */ }
  };

  /* =========================================================
   * 帧更新
   * ========================================================= */
  Game.prototype.update = function (dt) {
    var st = this.state;

    // 星空始终滚动（菜单也有动态背景，速度较慢）
    this.stars.update(dt, st === 'playing' ? 1 : 0.4);

    if (st === 'menu' || st === 'paused' || st === 'gameover') return;

    if (st === 'levelup') {
      // 升级界面：世界冻结，仅粒子飘散
      this.updateParticles(dt);
      return;
    }

    /* ---- playing ---- */
    this.time += dt;
    // 难度随存活时间与波次递增
    this.difficulty = Math.min(4, 1 + this.time / 42 * 0.14 + this.wave * 0.035);
    this.fireRateMul = Math.min(1.7, 1 + (this.difficulty - 1) * 0.18);

    this.updateScheduled(dt);
    if (!this.player.dead) this.player.update(dt);
    this.updateWaveDirector(dt);
    this.updateEnemies(dt);
    if (this.boss) this.boss.update(dt);
    this.updateBullets(dt);
    this.updateItems(dt);
    this.updateParticles(dt);
    this.collide();

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);

    // 死亡演出结束后结算
    if (this.player.dead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.gameOver();
    }
  };

  Game.prototype.updateScheduled = function (dt) {
    var arr = this.scheduled;
    for (var i = arr.length - 1; i >= 0; i--) {
      arr[i].t -= dt;
      if (arr[i].t <= 0) {
        var fn = arr[i].fn;
        arr.splice(i, 1);
        fn();
      }
    }
  };

  Game.prototype.updateBullets = function (dt) {
    var arr = this.bullets;
    for (var i = arr.length - 1; i >= 0; i--) {
      arr[i].update(dt);
      if (arr[i].dead) arr.splice(i, 1);
    }
  };

  Game.prototype.updateEnemies = function (dt) {
    var arr = this.enemies;
    for (var i = arr.length - 1; i >= 0; i--) {
      arr[i].update(dt, this);
      if (arr[i].dead) arr.splice(i, 1);
    }
  };

  Game.prototype.updateItems = function (dt) {
    var arr = this.items;
    for (var i = arr.length - 1; i >= 0; i--) {
      arr[i].update(dt, this);
      if (arr[i].dead) arr.splice(i, 1);
    }
  };

  Game.prototype.updateParticles = function (dt) {
    var arr = this.particles;
    for (var i = arr.length - 1; i >= 0; i--) {
      arr[i].update(dt);
      if (arr[i].dead) arr.splice(i, 1);
    }
    if (arr.length > 500) arr.splice(0, arr.length - 500);   // 粒子上限，保性能

    var t = this.texts;
    for (var j = t.length - 1; j >= 0; j--) {
      t[j].update(dt);
      if (t[j].dead) t.splice(j, 1);
    }
  };

  /* =========================================================
   * 波次导演：无尽模式，每 5 波一个 Boss
   * ========================================================= */
  Game.prototype.updateWaveDirector = function (dt) {
    // 出队
    var i, s;
    for (i = this.spawnQueue.length - 1; i >= 0; i--) {
      s = this.spawnQueue[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.spawnEnemy(s);
        this.spawnQueue.splice(i, 1);
      }
    }

    if (this.bossActive) {
      if (this.boss && this.boss.dead) {
        this.boss = null;
        this.bossActive = false;
        this.intermission = 2.4;
      }
      return;
    }

    if (!this.waveActive) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.startWave(this.wave + 1);
      return;
    }

    // 本波清空 → 结算并进入间歇
    if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      var bonus = 50 + this.wave * 10;
      this.score += bonus;
      this.addFloatText(CFG.W / 2, CFG.H / 2 - 40,
        '第 ' + this.wave + ' 波完成！ +' + bonus, '#7df9ff', 1.5, 18);
      this.intermission = 2.0;
    }
  };

  Game.prototype.startWave = function (n) {
    this.wave = n;
    this.waveActive = true;

    if (n % 5 === 0) {
      // Boss 波：轮换三种 Boss
      this.bossActive = true;
      var cfg = CFG.BOSSES[this.bossIndex % CFG.BOSSES.length];
      this.bossIndex++;
      this.boss = new E.Boss(this, cfg, n);
      this.addFloatText(CFG.W / 2, CFG.H / 2 - 60,
        '警告：' + cfg.name + ' 出现！', '#ff5a6e', 2.2, 22);
      GW.Sound.bossWarn();
      return;
    }

    this.spawnQueue = this.planWave(n);
    this.addFloatText(CFG.W / 2, 70, '第 ' + n + ' 波', '#7df9ff', 1.2, 18);
  };

  /* 编队计划：横排 / V字 / 侧翼突袭 / 网格，按波次切换 */
  Game.prototype.planWave = function (n) {
    var plan = [];
    var W = CFG.W;
    function add(t, type, pattern, x, y, opts) {
      plan.push({ t: t, type: type, pattern: pattern, x: x, y: y, opts: opts || {} });
    }

    var scoutCount = Math.min(10, 4 + Math.floor(n * 0.7));
    var fighterCount = n >= 3 ? Math.min(6, Math.floor((n - 1) * 0.5)) : 0;
    var heavyCount = n >= 4 ? Math.min(3, Math.floor((n - 2) * 0.3)) : 0;

    var mode = n % 4;
    var t = 0.4;
    var i, half;

    if (mode === 1) {
      // 横排侦察机 + 后续战斗机
      for (i = 0; i < scoutCount; i++) {
        add(t + i * 0.16, 'scout', 'sine',
          60 + (W - 120) * (i / Math.max(1, scoutCount - 1)), -40,
          { amp: U.rand(25, 50) });
      }
      t += scoutCount * 0.16 + 0.6;
      for (i = 0; i < fighterCount; i++) {
        add(t + i * 0.4, 'fighter', 'sine', U.rand(80, W - 80), -60,
          { amp: U.rand(40, 70), freq: U.rand(1.0, 1.6) });
      }
    } else if (mode === 2) {
      // V 字编队 + 重型压阵
      half = Math.floor(scoutCount / 2);
      for (i = -half; i <= half; i++) {
        add(t + Math.abs(i) * 0.12, 'scout', 'sine',
          W / 2 + i * 52, -40 - Math.abs(i) * 34, { amp: 30 });
      }
      t += half * 0.12 + 0.8;
      for (i = 0; i < heavyCount; i++) {
        add(t + i * 0.8, 'heavy', 'straight', U.rand(90, W - 90), -70);
      }
    } else if (mode === 3) {
      // 侧翼突袭
      var fromLeft = Math.random() < 0.5;
      for (i = 0; i < scoutCount; i++) {
        add(t + i * 0.22, 'scout', 'sweep',
          fromLeft ? -40 : W + 40, 70 + (i % 3) * 70,
          {
            targetX: fromLeft ? U.rand(W * 0.35, W - 70) : U.rand(70, W * 0.65),
            enterT: 1.0 + Math.random() * 0.5,
            amp: U.rand(20, 45)
          });
      }
      t += scoutCount * 0.22 + 0.5;
      for (i = 0; i < fighterCount; i++) {
        add(t + i * 0.5, 'fighter', 'sweep',
          fromLeft ? W + 40 : -40, U.rand(90, 300),
          {
            targetX: fromLeft ? U.rand(70, W * 0.4) : U.rand(W * 0.6, W - 70),
            enterT: 1.2
          });
      }
    } else {
      // 网格 + 重型 + 战斗机
      var cols = Math.min(6, 3 + Math.floor(n / 4));
      var rows = Math.min(3, 1 + Math.floor(n / 6));
      var r, c;
      for (r = 0; r < rows; r++) {
        for (c = 0; c < cols; c++) {
          add(t + r * 0.5 + c * 0.06, 'scout', 'sine',
            50 + (W - 100) * (c / Math.max(1, cols - 1)), -40 - r * 46,
            { amp: U.rand(15, 35) });
        }
      }
      t += rows * 0.5 + cols * 0.06 + 0.4;
      for (i = 0; i < heavyCount; i++) {
        add(t + i * 1.0, 'heavy', 'straight',
          90 + i * ((W - 180) / Math.max(1, heavyCount)), -70);
      }
      for (i = 0; i < fighterCount; i++) {
        add(t + 0.5 + i * 0.45, 'fighter', 'sine', U.rand(80, W - 80), -60,
          { amp: 50, freq: 1.3 });
      }
    }
    return plan;
  };

  /* 出队时按当前难度缩放属性 */
  Game.prototype.spawnEnemy = function (s) {
    var e = new E.Enemy(s.type, s.x, s.y, s.pattern, s.opts);
    var hpMul = 1 + (this.difficulty - 1) * 0.55;
    var spMul = Math.min(1.8, 1 + (this.difficulty - 1) * 0.28);
    e.hpMax = Math.round(e.def.hp * hpMul);
    e.hp = e.hpMax;
    e.speed = e.def.speed * spMul;
    e.score = Math.round(e.def.score * (1 + (this.difficulty - 1) * 0.25));
    this.enemies.push(e);
  };

  /* =========================================================
   * 碰撞检测
   * ========================================================= */
  Game.prototype.collide = function () {
    var i, j, b, e, it;
    var p = this.player;

    /* ---- 玩家子弹 vs 敌机 / Boss ---- */
    for (i = this.bullets.length - 1; i >= 0; i--) {
      b = this.bullets[i];
      if (b.dead || !b.friendly) continue;

      for (j = 0; j < this.enemies.length; j++) {
        e = this.enemies[j];
        if (e.dead) continue;
        if (U.dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) * (b.r + e.r)) {
          e.hp -= b.damage;
          e.flash = 0.09;
          this.particles.push(new E.Particle(b.x, b.y, 0, 0, 0.12, 'flash', '#ffffff', 7));
          if (b.pierce > 0 && b.hitSet.indexOf(e) === -1) {
            b.hitSet.push(e);          // 穿透：不消失，但不再打同一目标
          } else {
            b.dead = true;
          }
          if (e.hp <= 0) this.killEnemy(e);
          if (b.dead) break;
        }
      }
      if (b.dead) continue;

      var bo = this.boss;
      if (bo && !bo.dead && bo.dying <= 0 && bo.invuln <= 0 && !bo.entering) {
        if (U.dist2(b.x, b.y, bo.x, bo.y) < (b.r + bo.r * 0.85) * (b.r + bo.r * 0.85)) {
          bo.hp -= b.damage;
          bo.flash = 0.08;
          this.particles.push(new E.Particle(b.x, b.y, 0, 0, 0.12, 'flash', '#ffffff', 8));
          if (b.pierce <= 0) b.dead = true;
          if (bo.hp <= 0) {
            bo.hp = 0;
            bo.dying = 1.5;            // 进入死亡演出
          }
        }
      }
    }

    /* ---- 敌弹 / 敌机 / Boss  vs 玩家 ---- */
    if (!p.dead && p.invuln <= 0) {
      for (i = this.bullets.length - 1; i >= 0; i--) {
        b = this.bullets[i];
        if (b.dead || b.friendly) continue;
        if (U.dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) * (b.r + p.r)) {
          b.dead = true;
          p.hurt(this, 1);
          if (p.dead) break;
        }
      }
      if (!p.dead) {
        for (j = 0; j < this.enemies.length; j++) {
          e = this.enemies[j];
          if (e.dead) continue;
          if (U.dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) {
            e.hp -= 30;
            e.flash = 0.1;
            if (e.hp <= 0) this.killEnemy(e);
            p.hurt(this, 1);
            if (p.dead) break;
          }
        }
      }
      if (!p.dead && this.boss && !this.boss.dead && this.boss.dying <= 0) {
        var bo2 = this.boss;
        if (U.dist2(bo2.x, bo2.y, p.x, p.y) < (bo2.r * 0.8 + p.r) * (bo2.r * 0.8 + p.r)) {
          p.hurt(this, 1);
        }
      }
    }

    /* ---- 道具拾取 ---- */
    for (i = this.items.length - 1; i >= 0; i--) {
      it = this.items[i];
      if (it.dead) continue;
      if (U.dist2(it.x, it.y, p.x, p.y) < (it.r + p.r + 6) * (it.r + p.r + 6)) {
        this.pickItem(it);
        it.dead = true;
      }
    }
  };

  Game.prototype.killEnemy = function (e) {
    if (e.dead) return;
    e.dead = true;
    this.score += e.score;
    this.addFloatText(e.x, e.y, '+' + e.score, '#ffd9a0', 0.8, 13);
    this.gainXp(e.xp);
    E.explode(this, e.x, e.y, e.def.body, e.r * 1.6, e.type === 'heavy' ? 22 : 13);
    GW.Sound.explode(e.type === 'heavy');

    // 掉落 roll
    if (Math.random() < e.def.drop) {
      var roll = Math.random();
      var type = roll < 0.82 ? 'xp' : (roll < 0.93 ? 'heal' : 'shield');
      this.items.push(new E.Item(type, e.x, e.y));
    }
  };

  Game.prototype.pickItem = function (it) {
    if (it.type === 'xp') {
      this.gainXp(5);
      this.addFloatText(it.x, it.y - 10, '+5 EXP', '#38bdf8', 0.8, 13);
    } else if (it.type === 'heal') {
      if (this.player.hp < this.player.maxHp) {
        this.player.hp++;
        this.addFloatText(it.x, it.y - 10, '+1 HP', '#4ade80', 0.9, 14);
      } else {
        this.score += 100;
        this.addFloatText(it.x, it.y - 10, '+100', '#ffd9a0', 0.9, 14);
      }
    } else if (it.type === 'shield') {
      if (this.player.shield < this.player.shieldMax) {
        this.player.shield++;
        this.addFloatText(it.x, it.y - 10, '+1 护盾', '#a78bfa', 0.9, 14);
      } else {
        this.score += 150;
        this.addFloatText(it.x, it.y - 10, '+150', '#ffd9a0', 0.9, 14);
      }
    }
    GW.Sound.pickup();
  };

  /* =========================================================
   * 经验 / 升级
   * ========================================================= */
  Game.prototype.xpNeed = function (level) {
    return Math.round(16 * Math.pow(1.24, level - 1));
  };

  Game.prototype.gainXp = function (n) {
    var p = this.player;
    p.xp += n;
    while (p.xp >= this.xpNeed(p.level)) {
      p.xp -= this.xpNeed(p.level);
      p.level++;
      this.pendingLevelUps++;
    }
    if (this.pendingLevelUps > 0 && this.state === 'playing') this.openLevelUp();
  };

  Game.prototype.openLevelUp = function () {
    this.state = 'levelup';
    this.renderUpgradeChoices();
    show(this.el.levelup);
  };

  /* 从升级池随机抽 3 个未满级的选项 */
  Game.prototype.renderUpgradeChoices = function () {
    var self = this;
    var p = this.player;
    var pool = CFG.UPGRADES.filter(function (u) {
      return (p.upgrades[u.id] || 0) < u.max;
    });

    var picks = [];
    while (picks.length < 3 && pool.length > 0) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    this.currentChoices = picks;

    var html = '';
    picks.forEach(function (u, i) {
      var lv = p.upgrades[u.id] || 0;
      var pips = '';
      for (var k = 0; k < u.max; k++) {
        pips += '<span class="pip' + (k < lv ? ' on' : '') + '"></span>';
      }
      html += '<button type="button" class="card r-' + u.rarity + '" data-i="' + i + '">' +
                '<span class="card-key">' + (i + 1) + '</span>' +
                '<span class="card-icon">' + u.icon + '</span>' +
                '<span>' +
                  '<span class="card-name">' + u.name + '</span>' +
                  '<span class="card-desc">' + u.desc + '</span>' +
                  '<span class="card-pips">' + pips + '</span>' +
                '</span>' +
              '</button>';
    });
    this.el.cards.innerHTML = html;
  };

  Game.prototype.chooseUpgrade = function (i) {
    if (this.state !== 'levelup') return;
    var u = this.currentChoices && this.currentChoices[i];
    if (!u) return;
    u.apply(this.player);
    this.player.upgrades[u.id] = (this.player.upgrades[u.id] || 0) + 1;
    GW.Sound.levelup();
    this.pendingLevelUps--;
    if (this.pendingLevelUps > 0) {
      this.renderUpgradeChoices();
    } else {
      hide(this.el.levelup);
      this.state = 'playing';
    }
  };

  /* =========================================================
   * 玩家死亡 / Boss 击杀
   * ========================================================= */
  Game.prototype.onPlayerDeath = function () {
    this.deathTimer = 1.1;
    E.explode(this, this.player.x, this.player.y, '#7df9ff', 46, 30);
    GW.Sound.explode(true);
    this.shake = 16;
  };

  Game.prototype.onBossDefeated = function () {
    this.addFloatText(CFG.W / 2, CFG.H / 2 - 80, 'BOSS 击破！', '#ffd24d', 2.0, 26);
    // 清屏奖励：剩余小兵一并消灭
    for (var i = 0; i < this.enemies.length; i++) this.killEnemy(this.enemies[i]);
  };

  /* Boss 阶段转换时的清屏（子弹化作粒子） */
  Game.prototype.clearEnemyBullets = function () {
    for (var i = 0; i < this.bullets.length; i++) {
      var b = this.bullets[i];
      if (!b.friendly) {
        b.dead = true;
        this.particles.push(new E.Particle(b.x, b.y, 0, 0, 0.25, 'flash', '#8be9fd', 8));
      }
    }
  };

  /* =========================================================
   * 渲染
   * ========================================================= */
  Game.prototype.render = function () {
    var ctx = this.ctx;

    ctx.save();
    this.stars.draw(ctx);

    // 震屏（仅世界层）
    if (this.shake > 0) {
      ctx.translate(U.rand(-1, 1) * this.shake, U.rand(-1, 1) * this.shake);
    }

    if (this.state === 'menu') {
      // 菜单：静态展示一架战机
      ctx.save();
      ctx.translate(CFG.W / 2, CFG.H - 190);
      E.drawShipBody(ctx);
      ctx.restore();
    } else {
      for (var i = 0; i < this.items.length; i++) this.items[i].draw(ctx);
      for (var j = 0; j < this.bullets.length; j++) this.bullets[j].draw(ctx);
      for (var k = 0; k < this.enemies.length; k++) this.enemies[k].draw(ctx);
      if (this.boss) this.boss.draw(ctx);
      if (this.player && !this.player.dead) this.player.draw(ctx);
      for (var m = 0; m < this.particles.length; m++) this.particles[m].draw(ctx);
      for (var n = 0; n < this.texts.length; n++) this.texts[n].draw(ctx);
    }
    ctx.restore();

    if (this.state !== 'menu') this.drawHUD(ctx);
  };

  /* HUD：分数 / 最高分 / 波次 / 生命 / 护盾 / 等级经验条 / Boss 血条 */
  Game.prototype.drawHUD = function (ctx) {
    var p = this.player;
    var font = '"Segoe UI", "Microsoft YaHei", sans-serif';

    ctx.save();
    ctx.textAlign = 'left';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';

    // 分数（左上）
    ctx.font = 'bold 20px ' + font;
    ctx.fillStyle = '#ffd24d';
    ctx.strokeText('分数 ' + this.score, 14, 30);
    ctx.fillText('分数 ' + this.score, 14, 30);

    ctx.font = '12px ' + font;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('最高 ' + this.best, 14, 48);

    // 波次（右上）
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px ' + font;
    ctx.fillStyle = '#7df9ff';
    ctx.fillText('第 ' + Math.max(1, this.wave) + ' 波', CFG.W - 14, 28);
    ctx.font = '11px ' + font;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('难度 ' + this.difficulty.toFixed(1) + 'x', CFG.W - 14, 44);

    // 生命（心形）
    for (var i = 0; i < p.maxHp; i++) {
      drawHeart(ctx, 22 + i * 22, 66, 8, i < p.hp ? '#ff5a6e' : 'rgba(255,255,255,0.18)');
    }
    // 护盾（圆点）
    for (var s = 0; s < p.shield; s++) {
      ctx.fillStyle = '#6ee7ff';
      ctx.beginPath(); ctx.arc(24 + s * 20, 88, 7, 0, U.TAU); ctx.fill();
    }

    // 等级 + 经验条（左下）
    var bx = 14, by = CFG.H - 34;
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px ' + font;
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText('Lv ' + p.level, bx, by + 4);
    var barX = bx + 46, barW = 150, barH = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    U.roundRect(ctx, barX, by - 4, barW, barH, 4);
    ctx.fill();
    var ratio = U.clamp(p.xp / this.xpNeed(p.level), 0, 1);
    ctx.fillStyle = '#38bdf8';
    U.roundRect(ctx, barX, by - 4, Math.max(2, barW * ratio), barH, 4);
    ctx.fill();

    // Boss 血条（顶部居中）
    var bo = this.boss;
    if (bo && !bo.dead) {
      var bw = 300, bh = 12, bxx = (CFG.W - bw) / 2, byy = 54;
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px ' + font;
      ctx.fillStyle = '#ffd9de';
      ctx.fillText(bo.name, CFG.W / 2, byy - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      U.roundRect(ctx, bxx - 2, byy - 2, bw + 4, bh + 4, 7);
      ctx.fill();
      var hr = U.clamp(bo.hp / bo.hpMax, 0, 1);
      var grad = ctx.createLinearGradient(bxx, 0, bxx + bw, 0);
      grad.addColorStop(0, bo.phase >= 3 ? '#ff4d4d' : '#ff5a6e');
      grad.addColorStop(1, bo.phase >= 3 ? '#ff9a5c' : '#ff9ab0');
      ctx.fillStyle = grad;
      U.roundRect(ctx, bxx, byy, Math.max(2, bw * hr), bh, 6);
      ctx.fill();
      // 阶段刻度线
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(bxx + bw * 0.33, byy - 1, 1.5, bh + 2);
      ctx.fillRect(bxx + bw * 0.66, byy - 1, 1.5, bh + 2);
    }

    ctx.restore();
  };

  /* ---------- 画布尺寸 / 高分屏适配 ---------- */
  Game.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // 之后所有绘制都使用 480x800 逻辑坐标
    this.ctx.setTransform(w / CFG.W, 0, 0, h / CFG.H, 0, 0);
  };

  /* =========================================================
   * 界面绑定
   * ========================================================= */
  Game.prototype.bindUI = function () {
    var self = this;
    this.el = {
      menu: $('menu'),
      pause: $('pause'),
      levelup: $('levelup'),
      gameover: $('gameover'),
      cards: $('upgrade-cards'),
      bestMenu: $('best-menu'),
      finalScore: $('final-score'),
      finalBest: $('final-best'),
      finalWave: $('final-wave'),
      finalLevel: $('final-level'),
      btnStart: $('btn-start'),
      btnResume: $('btn-resume'),
      btnRestartP: $('btn-restart-p'),
      btnRestart: $('btn-restart'),
      btnPause: $('btn-pause'),
      btnAuto: $('btn-autofire'),
      btnSound: $('btn-sound')
    };
    this.el.bestMenu.textContent = this.best;

    this.el.btnStart.addEventListener('click', function () { self.start(); });
    this.el.btnResume.addEventListener('click', function () { self.resume(); });
    this.el.btnRestartP.addEventListener('click', function () { self.start(); });
    this.el.btnRestart.addEventListener('click', function () { self.start(); });
    this.el.btnPause.addEventListener('click', function () {
      if (self.state === 'playing') self.pause();
      else if (self.state === 'paused') self.resume();
    });
    this.el.btnAuto.addEventListener('click', function () { self.toggleAutoFire(); });
    this.el.btnSound.addEventListener('click', function () { self.toggleSound(); });

    // 升级卡片点击（事件委托）
    this.el.cards.addEventListener('click', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.card') : null;
      if (card) self.chooseUpgrade(parseInt(card.getAttribute('data-i'), 10));
    });

    // 全局快捷键
    window.addEventListener('keydown', function (e) {
      switch (e.code) {
        case 'KeyP':
        case 'Escape':
          if (self.state === 'playing') self.pause();
          else if (self.state === 'paused') self.resume();
          break;
        case 'Enter':
        case 'Space':
          if (self.state === 'menu' || self.state === 'gameover') self.start();
          else if (self.state === 'paused') self.resume();
          break;
        case 'Digit1':
          if (self.state === 'levelup') self.chooseUpgrade(0);
          break;
        case 'Digit2':
          if (self.state === 'levelup') self.chooseUpgrade(1);
          break;
        case 'Digit3':
          if (self.state === 'levelup') self.chooseUpgrade(2);
          break;
        case 'KeyF':
          self.toggleAutoFire();
          break;
        case 'KeyM':
          self.toggleSound();
          break;
      }
    });
  };

  Game.prototype.toggleAutoFire = function () {
    this.autoFire = !this.autoFire;
    this.el.btnAuto.textContent = this.autoFire ? '🔥 自动开火：开' : '🔥 自动开火：关';
  };

  Game.prototype.toggleSound = function () {
    this.soundOn = !this.soundOn;
    GW.Sound.enabled = this.soundOn;
    this.el.btnSound.textContent = this.soundOn ? '🔊 音效：开' : '🔇 音效：关';
    if (this.soundOn) GW.Sound.ensure();
  };

  GW.Game = Game;
})();
