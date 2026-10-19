/* =========================================================
 * entities.js — 游戏实体
 * Bullet 子弹 / Enemy 敌机 / Boss 首领 / Player 玩家
 * Item 道具 / Particle 粒子 / FloatText 飘字
 * 所有造型均为 Canvas 矢量绘制，无外部图片资源
 * ========================================================= */
(function () {
  'use strict';
  window.GW = window.GW || {};

  var U = GW.utils;
  var CFG = GW.Config;

  /* =========================================================
   * 子弹
   * ========================================================= */
  function Bullet(x, y, vx, vy, opt) {
    opt = opt || {};
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = opt.damage || 10;
    this.friendly = !!opt.friendly;                 // true = 玩家子弹
    this.r = opt.r || (this.friendly ? 4 : 5);
    this.color = opt.color || (this.friendly ? '#7df9ff' : '#ff7a59');
    this.life = opt.life || 4;
    this.pierce = opt.pierce || 0;                  // 额外穿透次数
    this.hitSet = this.pierce > 0 ? [] : null;      // 已穿透过的目标
    this.dead = false;
  }

  Bullet.prototype.update = function (dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 ||
        this.x < -30 || this.x > CFG.W + 30 ||
        this.y < -40 || this.y > CFG.H + 40) {
      this.dead = true;
    }
  };

  Bullet.prototype.draw = function (ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.friendly) {
      // 玩家子弹：竖直能量胶囊，沿速度方向旋转
      ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
      ctx.fillStyle = 'rgba(125,249,255,0.32)';
      U.roundRect(ctx, -this.r - 1, -this.r - 7, (this.r + 1) * 2, (this.r + 7) * 2, this.r);
      ctx.fill();
      ctx.fillStyle = this.color;
      U.roundRect(ctx, -this.r * 0.55, -this.r - 3, this.r * 1.1, (this.r + 3) * 2, this.r * 0.6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      U.roundRect(ctx, -this.r * 0.22, -this.r - 2, this.r * 0.44, (this.r + 2) * 1.4, this.r * 0.3);
      ctx.fill();
    } else {
      // 敌方子弹：橙红光球
      ctx.fillStyle = 'rgba(255,122,89,0.28)';
      ctx.beginPath(); ctx.arc(0, 0, this.r + 3.5, 0, U.TAU); ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(0, 0, this.r, 0, U.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(-this.r * 0.25, -this.r * 0.25, this.r * 0.38, 0, U.TAU); ctx.fill();
    }
    ctx.restore();
  };

  /* =========================================================
   * 玩家战机
   * ========================================================= */
  function Player(game) {
    this.game = game;
    this.x = CFG.W / 2;
    this.y = CFG.H - 130;
    this.r = CFG.PLAYER.radius;
    this.speed = CFG.PLAYER.speed;
    this.maxHp = CFG.PLAYER.maxHp;
    this.hp = CFG.PLAYER.hp;
    this.shieldMax = CFG.PLAYER.maxShield;
    this.shield = 0;
    this.level = 1;
    this.xp = 0;
    this.magnetRadius = 78;
    this.regen = 0;
    this._regenTimer = 0;
    this.weapon = {
      interval: CFG.PLAYER.fireInterval,
      damage: CFG.PLAYER.bulletDamage,
      bulletSpeed: CFG.PLAYER.bulletSpeed,
      count: 1,
      max: CFG.PLAYER.maxBullets,
      pierce: 0
    };
    this.wingmen = [];
    this.fireTimer = 0;
    this.invuln = 0;
    this.dead = false;
    this.t = 0;
    this.upgrades = {};   // 升级id -> 已选次数
  }

  Player.prototype.update = function (dt) {
    this.t += dt;
    var input = GW.Input;

    /* ---- 移动：触摸 > 键盘 > 鼠标跟随 ---- */
    if (input.touch.active) {
      this.x = input.touch.px + input.touch.ox;
      this.y = input.touch.py + input.touch.oy;
    } else {
      var v = input.moveVector();
      if (v.x !== 0 || v.y !== 0) {
        this.x += v.x * this.speed * dt;
        this.y += v.y * this.speed * dt;
      } else if (input.mouse.active) {
        var k = Math.min(1, 18 * dt);
        this.x = U.lerp(this.x, input.mouse.x, k);
        this.y = U.lerp(this.y, input.mouse.y, k);
      }
    }
    this.x = U.clamp(this.x, this.r + 4, CFG.W - this.r - 4);
    this.y = U.clamp(this.y, this.r + 4, CFG.H - this.r - 4);

    if (this.invuln > 0) this.invuln -= dt;

    /* ---- 纳米修复：每层每 6 秒回复 1 点 ---- */
    if (this.regen > 0 && this.hp < this.maxHp) {
      this._regenTimer += dt;
      if (this._regenTimer >= 6 / this.regen) {
        this._regenTimer = 0;
        this.hp = Math.min(this.maxHp, this.hp + 1);
        this.game.addFloatText(this.x, this.y - 26, '+1 HP', '#7CFC9A');
      }
    }

    /* ---- 开火（默认自动，可切换手动） ---- */
    var want = this.game.autoFire || input.firing();
    if (want && !this.dead) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.shoot();
        this.fireTimer = this.weapon.interval;
      }
      for (var i = 0; i < this.wingmen.length; i++) {
        var w = this.wingmen[i];
        w.timer -= dt;
        if (w.timer <= 0) {
          this.shootFrom(this.wingmanPos(i));
          w.timer = this.weapon.interval;
        }
      }
    }

    /* ---- 引擎尾焰粒子 ---- */
    if (Math.random() < dt * 40) {
      this.game.particles.push(new Particle(
        this.x + U.rand(-3, 3), this.y + 14,
        U.rand(-14, 14), U.rand(60, 110),
        0.3, 'glow', U.pick(['#57c7ff', '#2b7fd4']), 2.2
      ));
    }
  };

  /* 主炮：count 条弹道扇形展开 */
  Player.prototype.shoot = function () {
    this.shootFrom({ x: this.x, y: this.y - 18 });
  };

  Player.prototype.shootFrom = function (pos) {
    var w = this.weapon;
    var n = w.count;
    var spread = 0.11 * (n - 1);   // 总散射角（弧度）
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (n === 1 ? 0 : (-spread / 2 + spread * i / (n - 1)));
      this.game.bullets.push(new Bullet(
        pos.x, pos.y,
        Math.cos(a) * w.bulletSpeed,
        Math.sin(a) * w.bulletSpeed,
        { damage: w.damage, friendly: true, pierce: w.pierce }
      ));
    }
    this.game.particles.push(new Particle(pos.x, pos.y - 6, 0, -40, 0.08, 'flash', '#bffbff', 6));
    GW.Sound.shoot();
  };

  Player.prototype.wingmanPos = function (i) {
    var off = this.wingmen.length === 1 ? 34 : (i === 0 ? -36 : 36);
    return { x: U.clamp(this.x + off, 10, CFG.W - 10), y: this.y + 6 };
  };

  /* 受击：先扣护盾，再扣生命；死亡由 game 处理 */
  Player.prototype.hurt = function (game, dmg) {
    if (this.invuln > 0 || this.dead) return;
    if (this.shield > 0) {
      this.shield--;
      this.invuln = 1.0;
      game.shake = 6;
      for (var i = 0; i < 8; i++) {
        var a = Math.random() * U.TAU;
        game.particles.push(new Particle(
          this.x + Math.cos(a) * 28, this.y + Math.sin(a) * 28,
          Math.cos(a) * 90, Math.sin(a) * 90,
          0.4, 'spark', '#6ee7ff', 3
        ));
      }
      GW.Sound.hit();
      return;
    }
    this.hp -= dmg;
    this.invuln = CFG.PLAYER.invulnTime;
    game.shake = 10;
    GW.Sound.hurt();
    explode(game, this.x, this.y, '#ff8a8a', 26, 14);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      game.onPlayerDeath();
    }
  };

  Player.prototype.draw = function (ctx) {
    // 受击无敌期间闪烁
    if (this.invuln > 0 && Math.floor(this.t * 14) % 2 === 0) return;

    // 僚机
    for (var i = 0; i < this.wingmen.length; i++) {
      var p = this.wingmanPos(i);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(0.62, 0.62);
      drawShipBody(ctx);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    drawShipBody(ctx);
    ctx.restore();

    // 护盾泡
    if (this.shield > 0) {
      var pulse = 0.6 + 0.4 * Math.sin(this.t * 5);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * pulse;
      ctx.strokeStyle = '#6ee7ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, 30, 0, U.TAU); ctx.stroke();
      ctx.globalAlpha = 0.10 + 0.08 * pulse;
      ctx.fillStyle = '#6ee7ff';
      ctx.beginPath(); ctx.arc(this.x, this.y, 30, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  };

  /* 玩家机体矢量图（蓝白涂装 + 动态尾焰） */
  function drawShipBody(ctx) {
    // 引擎火焰
    var flame = 12 + Math.random() * 8;
    var g = ctx.createLinearGradient(0, 6, 0, 6 + flame);
    g.addColorStop(0, 'rgba(125,249,255,0.9)');
    g.addColorStop(0.5, 'rgba(59,130,246,0.55)');
    g.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-4, 8);
    ctx.lineTo(0, 8 + flame);
    ctx.lineTo(4, 8);
    ctx.closePath();
    ctx.fill();

    // 机翼
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(6, -4);
    ctx.lineTo(20, 10);
    ctx.lineTo(9, 7);
    ctx.lineTo(0, 13);
    ctx.lineTo(-9, 7);
    ctx.lineTo(-20, 10);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill();

    // 机身
    var body = ctx.createLinearGradient(0, -20, 0, 14);
    body.addColorStop(0, '#e0f2fe');
    body.addColorStop(0.5, '#7dd3fc');
    body.addColorStop(1, '#2563eb');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(6, -2);
    ctx.lineTo(4, 10);
    ctx.lineTo(-4, 10);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();

    // 座舱
    ctx.fillStyle = '#0b1e46';
    ctx.beginPath(); ctx.ellipse(0, -6, 3.4, 6.5, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = 'rgba(125,249,255,0.85)';
    ctx.beginPath(); ctx.ellipse(0, -8, 1.6, 2.6, 0, 0, U.TAU); ctx.fill();

    // 翼尖航行灯
    ctx.fillStyle = '#f472b6';
    ctx.beginPath(); ctx.arc(-19, 9, 1.6, 0, U.TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(19, 9, 1.6, 0, U.TAU); ctx.fill();
  }

  /* =========================================================
   * 敌机（三种机型：侦察 / 战斗 / 重型）
   * ========================================================= */
  function Enemy(typeKey, x, y, pattern, opts) {
    opts = opts || {};
    var def = CFG.ENEMIES[typeKey];
    this.type = typeKey;
    this.def = def;
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.hpMax = def.hp;
    this.hp = def.hp;
    this.speed = def.speed;
    this.r = def.radius;
    this.pattern = pattern || 'straight';
    this.t = 0;
    this.phase = Math.random() * U.TAU;
    this.amp = opts.amp != null ? opts.amp : U.rand(30, 60);
    this.freq = opts.freq != null ? opts.freq : U.rand(1.4, 2.4);
    this.targetX = opts.targetX != null ? opts.targetX : x;
    this.startX = x;
    this.enterT = opts.enterT || 1.1;
    this.fireTimer = U.rand(def.fire.cdMin, def.fire.cdMax);
    this.flash = 0;
    this.dead = false;
    this.score = def.score;
    this.xp = def.xp;
  }

  /* 移动模式：直线 / 正弦 / 侧翼突袭 / 俯冲 */
  function movePattern(e, dt) {
    switch (e.pattern) {
      case 'sine':
        e.y += e.speed * dt;
        e.x = e.baseX + e.amp * Math.sin(e.t * e.freq + e.phase);
        break;
      case 'sweep':
        if (e.t < e.enterT) {
          var k = U.easeOutCubic(e.t / e.enterT);
          e.x = U.lerp(e.startX, e.targetX, k);
          e.y += e.speed * 0.45 * dt;
        } else {
          e.x = e.targetX + e.amp * Math.sin((e.t - e.enterT) * e.freq);
          e.y += e.speed * dt;
        }
        break;
      case 'dive':
        e.y += (e.speed + e.t * 60) * dt;
        break;
      default:
        e.y += e.speed * dt;
    }
  }

  Enemy.prototype.update = function (dt, game) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    movePattern(this, dt);

    // 开火（进入屏幕后才射击）
    this.fireTimer -= dt;
    if (this.y > 40 && this.y < CFG.H - 90 && this.fireTimer <= 0) {
      this.fire(game);
      var d = this.def.fire;
      this.fireTimer = U.rand(d.cdMin, d.cdMax) / game.fireRateMul;
    }

    // 出屏移除
    if (this.y > CFG.H + 70 || this.x < -90 || this.x > CFG.W + 90) this.dead = true;
  };

  Enemy.prototype.fire = function (game) {
    var d = this.def.fire;
    var self = this;
    var base = U.angleTo(this.x, this.y, game.player.x, game.player.y);

    if (d.pattern === 'aimed') {
      // 单发瞄准
      spawnEnemyBullet(game, this.x, this.y + this.r, base, d.speed);
    } else if (d.pattern === 'burst') {
      // 连续瞄准点射
      for (let i = 0; i < d.count; i++) {
        game.after(0.14 * i, function () {
          if (game.state !== 'playing') return;
          spawnEnemyBullet(game, self.x, self.y + self.r, base, d.speed);
        });
      }
    } else if (d.pattern === 'spread') {
      // 扇形散射
      for (let j = 0; j < d.count; j++) {
        var a = Math.PI / 2 + (j - (d.count - 1) / 2) * 0.38;
        spawnEnemyBullet(game, this.x, this.y + this.r, a, d.speed);
      }
    }
    game.particles.push(new Particle(this.x, this.y + this.r, 0, 30, 0.1, 'flash', '#ffb199', 5));
  };

  Enemy.prototype.draw = function (ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.type === 'scout') drawScout(ctx, this);
    else if (this.type === 'fighter') drawFighter(ctx, this);
    else drawHeavy(ctx, this);
    ctx.restore();

    // 受击闪白
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.flash * 12);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
      ctx.restore();
    }

    // 重型敌机小血条
    if (this.type === 'heavy' && this.hp < this.hpMax) {
      var w = 36;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(this.x - w / 2, this.y - this.r - 12, w, 4);
      ctx.fillStyle = '#4fd66b';
      ctx.fillRect(this.x - w / 2, this.y - this.r - 12, w * (this.hp / this.hpMax), 4);
    }
  };

  /* 侦察机：红色飞镖 */
  function drawScout(ctx, e) {
    var r = e.r, d = e.def;
    ctx.fillStyle = 'rgba(255,120,120,0.5)';
    ctx.beginPath();
    ctx.moveTo(-3, -r + 2); ctx.lineTo(0, -r - 8); ctx.lineTo(3, -r + 2);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = d.body;
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(r * 0.55, -r * 0.2);
    ctx.lineTo(r * 1.15, -r * 0.75);
    ctx.lineTo(r * 0.3, -r * 0.6);
    ctx.lineTo(0, -r * 0.85);
    ctx.lineTo(-r * 0.3, -r * 0.6);
    ctx.lineTo(-r * 1.15, -r * 0.75);
    ctx.lineTo(-r * 0.55, -r * 0.2);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = d.accent;
    ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * 0.2, r * 0.34, 0, 0, U.TAU); ctx.fill();
  }

  /* 战斗机：紫色双尾梁 */
  function drawFighter(ctx, e) {
    var r = e.r, d = e.def;
    ctx.fillStyle = 'rgba(200,107,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(-5, -r + 2); ctx.lineTo(-5, -r - 9); ctx.lineTo(-2, -r + 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, -r + 2); ctx.lineTo(5, -r - 9); ctx.lineTo(2, -r + 2);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(6, 2);
    ctx.lineTo(r, -r * 0.5);
    ctx.lineTo(r * 0.4, -r * 0.9);
    ctx.lineTo(0, -r * 0.4);
    ctx.lineTo(-r * 0.4, -r * 0.9);
    ctx.lineTo(-r, -r * 0.5);
    ctx.lineTo(-6, 2);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = d.body;
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(4.5, -2);
    ctx.lineTo(3, -r * 0.95);
    ctx.lineTo(-3, -r * 0.95);
    ctx.lineTo(-4.5, -2);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = d.accent;
    ctx.beginPath(); ctx.ellipse(0, r * 0.25, 2.4, 4, 0, 0, U.TAU); ctx.fill();
  }

  /* 重型机：绿色六边形装甲舰 */
  function drawHeavy(ctx, e) {
    var r = e.r, d = e.def;
    var i, a, px, py;

    ctx.fillStyle = 'rgba(80,220,120,0.35)';
    ctx.beginPath();
    ctx.moveTo(-4, -r + 2); ctx.lineTo(0, -r - 7); ctx.lineTo(4, -r + 2);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#166534';
    ctx.beginPath();
    for (i = 0; i < 6; i++) {
      a = Math.PI / 6 + i * Math.PI / 3;
      px = Math.cos(a) * r;
      py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = d.body;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, U.TAU); ctx.fill();

    ctx.fillStyle = '#052e16';
    U.roundRect(ctx, -r * 0.5, r * 0.2, r, r * 0.5, 3);
    ctx.fill();

    ctx.fillStyle = d.accent;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, U.TAU); ctx.fill();
  }

  /* =========================================================
   * Boss：三阶段攻击模式 + 独立血条 + 死亡演出
   * ========================================================= */
  function Boss(game, cfg, wave) {
    this.game = game;
    this.cfg = cfg;
    this.name = cfg.name;
    this.x = CFG.W / 2;
    this.y = -90;
    this.targetY = 130;
    this.r = cfg.radius;
    this.hpMax = Math.round(cfg.hp * (1 + wave * 0.12));
    this.hp = this.hpMax;
    this.t = 0;
    this.phase = 1;
    this.attackTimer = 2.0;
    this.invuln = 0;
    this.flash = 0;
    this.burst = null;      // 持续型弹幕（螺旋等）
    this.dying = 0;         // >0 表示死亡演出中
    this.dead = false;
    this.entering = true;   // 入场动画
    this.score = 2000;
    this.xp = 40;
  }

  Boss.prototype.update = function (dt) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    /* ---- 死亡演出：持续随机爆炸 ---- */
    if (this.dying > 0) {
      this.dying -= dt;
      if (Math.random() < dt * 14) {
        explode(this.game,
          this.x + U.rand(-this.r, this.r),
          this.y + U.rand(-this.r * 0.6, this.r * 0.6),
          U.pick(['#ffd24d', '#ff7a59', '#ffffff']), 20, 10
        );
      }
      if (this.dying <= 0) this.finishDeath();
      return;
    }

    /* ---- 入场 ---- */
    if (this.entering) {
      this.y = U.lerp(this.y, this.targetY, Math.min(1, 1.6 * dt));
      if (this.y > this.targetY - 2) {
        this.y = this.targetY;
        this.entering = false;
      }
      return;
    }

    /* ---- 顶部正弦巡航 ---- */
    this.x = CFG.W / 2 + Math.sin(this.t * 0.55) * 150;
    this.y = this.targetY + Math.sin(this.t * 0.9) * 12;

    /* ---- 阶段切换（66% / 33% 血量） ---- */
    var ratio = this.hp / this.hpMax;
    var np = ratio > 0.66 ? 1 : (ratio > 0.33 ? 2 : 3);
    if (np > this.phase) this.changePhase(np);

    /* ---- 攻击调度 ---- */
    if (this.burst) {
      this.updateBurst(dt);
    } else {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        var pool = this.cfg.attacks[this.phase];
        this.doAttack(U.pick(pool));
        this.attackTimer = this.cfg.cadence[this.phase - 1] * U.rand(0.85, 1.15);
      }
    }
  };

  Boss.prototype.changePhase = function (np) {
    this.phase = np;
    this.invuln = 1.1;
    this.burst = null;
    this.game.clearEnemyBullets();   // 阶段转换时清屏（化作粒子）
    this.game.shake = 8;
    GW.Sound.explode(true);
    this.game.addFloatText(this.x, this.y - 60, '第 ' + np + ' 阶段', '#ffd24d', 1.4, 20);
  };

  /* 攻击库：ring 环形弹 / aimed 瞄准扇 / shotgun 霰弹 /
     rain 天降弹 / spiral 螺旋持续弹 / summon 召唤僚机 */
  Boss.prototype.doAttack = function (atk) {
    var g = this.game;
    var base = U.angleTo(this.x, this.y, g.player.x, g.player.y);
    var i, a, n, count;

    switch (atk) {
      case 'ring':
        n = 16 + this.phase * 4;
        var off = Math.random() * U.TAU;
        for (i = 0; i < n; i++) {
          a = off + i / n * U.TAU;
          g.bullets.push(new Bullet(this.x, this.y, Math.cos(a) * 175, Math.sin(a) * 175,
            { friendly: false, r: 5, color: '#ff9a5c' }));
        }
        GW.Sound.explode(false);
        break;

      case 'aimed':
        n = 3 + this.phase;
        for (i = 0; i < n; i++) {
          a = base + (i - (n - 1) / 2) * 0.32;
          g.bullets.push(new Bullet(this.x, this.y + 20, Math.cos(a) * 255, Math.sin(a) * 255,
            { friendly: false, color: '#ff6b9d' }));
        }
        break;

      case 'shotgun':
        n = 7;
        for (i = 0; i < n; i++) {
          a = base + (i - (n - 1) / 2) * 0.16;
          g.bullets.push(new Bullet(this.x, this.y, Math.cos(a) * 320, Math.sin(a) * 320,
            { friendly: false, r: 4, color: '#ffd24d' }));
        }
        GW.Sound.explode(false);
        break;

      case 'rain':
        count = 8 + this.phase * 3;
        for (i = 0; i < count; i++) {
          g.after(U.rand(0, 0.5), (function () {
            var x = U.rand(30, CFG.W - 30);
            return function () {
              if (g.state !== 'playing') return;
              g.bullets.push(new Bullet(x, -10, U.rand(-20, 20), U.rand(170, 210),
                { friendly: false, color: '#8be9fd' }));
            };
          })());
        }
        break;

      case 'spiral':
        this.burst = { type: 'spiral', t: 0, dur: 2.4, interval: 0.075, angle: Math.random() * U.TAU, speed: 195, arms: 2, _acc: 0 };
        break;

      case 'summon':
        n = 2 + (this.phase >= 3 ? 1 : 0);
        for (i = 0; i < n; i++) {
          var ex = U.clamp(this.x + (i - (n - 1) / 2) * 90, 40, CFG.W - 40);
          g.enemies.push(new Enemy('scout', ex, this.y, 'dive', {}));
        }
        g.addFloatText(this.x, this.y - 50, '增援来袭！', '#8be9fd');
        break;
    }
  };

  Boss.prototype.updateBurst = function (dt) {
    var b = this.burst;
    b.t += dt;
    b._acc += dt;
    while (b._acc >= b.interval) {
      b._acc -= b.interval;
      if (b.type === 'spiral') {
        for (var arm = 0; arm < b.arms; arm++) {
          var a = b.angle + arm / b.arms * U.TAU;
          this.game.bullets.push(new Bullet(this.x, this.y, Math.cos(a) * b.speed, Math.sin(a) * b.speed,
            { friendly: false, r: 4.5, color: '#c4b5fd' }));
        }
        b.angle += 0.32;
      }
    }
    if (b.t >= b.dur) this.burst = null;
  };

  Boss.prototype.finishDeath = function () {
    this.dead = true;
    var g = this.game;
    g.shake = 22;
    explode(g, this.x, this.y, '#ffffff', 60, 40);
    GW.Sound.explode(true);

    // 死亡奖励：大额分数 + 道具雨
    var bonus = this.score + g.wave * 100;
    g.score += bonus;
    g.addFloatText(this.x, this.y, '+' + bonus, '#ffd24d', 1.6, 24);
    for (var i = 0; i < 6; i++) {
      g.items.push(new Item('xp', this.x + U.rand(-50, 50), this.y + U.rand(-30, 30)));
    }
    g.items.push(new Item('heal', this.x - 30, this.y));
    g.items.push(new Item('shield', this.x + 30, this.y));
    g.onBossDefeated();
  };

  Boss.prototype.draw = function (ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    var cfg = this.cfg;
    var flashing = this.flash > 0;
    var white = flashing ? '#ffffff' : null;

    // 引擎光晕
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.t * 8);
    ctx.fillStyle = cfg.core;
    ctx.beginPath(); ctx.arc(0, -this.r * 0.7, this.r * 0.22, 0, U.TAU); ctx.fill();
    ctx.globalAlpha = 1;

    // 下壳
    ctx.fillStyle = white || '#1e1b4b';
    ctx.beginPath();
    ctx.moveTo(0, this.r * 0.9);
    ctx.lineTo(this.r * 0.9, this.r * 0.2);
    ctx.lineTo(this.r * 0.55, -this.r * 0.55);
    ctx.lineTo(-this.r * 0.55, -this.r * 0.55);
    ctx.lineTo(-this.r * 0.9, this.r * 0.2);
    ctx.closePath(); ctx.fill();

    // 侧翼
    ctx.fillStyle = white || cfg.body;
    ctx.beginPath();
    ctx.moveTo(-this.r, -this.r * 0.1);
    ctx.lineTo(-this.r * 0.45, -this.r * 0.5);
    ctx.lineTo(this.r * 0.45, -this.r * 0.5);
    ctx.lineTo(this.r, -this.r * 0.1);
    ctx.lineTo(this.r * 0.6, this.r * 0.35);
    ctx.lineTo(-this.r * 0.6, this.r * 0.35);
    ctx.closePath(); ctx.fill();

    // 能量核心（颜色随阶段变化）
    var pulse = 0.75 + 0.25 * Math.sin(this.t * 6);
    var coreColor = this.phase >= 3 ? '#ff4d4d' : (this.phase === 2 ? '#ffa94d' : cfg.core);
    var g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.r * 0.42 * pulse + 6);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, coreColor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.45, 0, U.TAU); ctx.fill();

    // 双炮塔
    ctx.fillStyle = white || '#0f172a';
    U.roundRect(ctx, -this.r * 0.7, this.r * 0.3, this.r * 0.35, this.r * 0.5, 4);
    ctx.fill();
    U.roundRect(ctx, this.r * 0.35, this.r * 0.3, this.r * 0.35, this.r * 0.5, 4);
    ctx.fill();

    // 装甲高光
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-this.r * 0.45, -this.r * 0.5);
    ctx.lineTo(this.r * 0.45, -this.r * 0.5);
    ctx.stroke();

    ctx.restore();
  };

  /* =========================================================
   * 掉落道具：经验宝石 / 医疗包 / 护盾
   * ========================================================= */
  function Item(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = U.rand(-30, 30);
    this.vy = U.rand(20, 50);
    this.r = 11;
    this.t = Math.random() * U.TAU;
    this.dead = false;
  }

  Item.prototype.update = function (dt, game) {
    this.t += dt;
    var p = game.player;
    var d2 = U.dist2(this.x, this.y, p.x, p.y);
    var mag = p.magnetRadius;

    if (d2 < mag * mag) {
      // 磁吸：加速飞向玩家
      var ang = U.angleTo(this.x, this.y, p.x, p.y);
      var pull = 420;
      this.vx = U.lerp(this.vx, Math.cos(ang) * pull, Math.min(1, 6 * dt));
      this.vy = U.lerp(this.vy, Math.sin(ang) * pull, Math.min(1, 6 * dt));
    } else {
      this.vx = U.lerp(this.vx, 0, Math.min(1, 2 * dt));
      this.vy = U.lerp(this.vy, 40, Math.min(1, 2 * dt));
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y > CFG.H + 30) this.dead = true;
  };

  Item.prototype.draw = function (ctx) {
    var colors = {
      xp:     ['#38bdf8', '#e0f2fe'],
      heal:   ['#4ade80', '#dcfce7'],
      shield: ['#a78bfa', '#ede9fe']
    };
    var c = colors[this.type] || colors.xp;
    var i, a, px, py;

    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.t * 4) * 2);

    // 底部光晕
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = c[0];
    ctx.beginPath(); ctx.arc(0, 2, 12, 0, U.TAU); ctx.fill();
    ctx.globalAlpha = 1;

    if (this.type === 'xp') {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = c[0];
      U.roundRect(ctx, -6, -6, 12, 12, 2.5);
      ctx.fill();
      ctx.fillStyle = c[1];
      U.roundRect(ctx, -3.5, -3.5, 7, 7, 1.5);
      ctx.fill();
    } else if (this.type === 'heal') {
      ctx.fillStyle = c[0];
      U.roundRect(ctx, -8, -8, 16, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -5.5, 4, 11);
      ctx.fillRect(-5.5, -2, 11, 4);
    } else {
      ctx.fillStyle = c[0];
      ctx.beginPath();
      for (i = 0; i < 6; i++) {
        a = -Math.PI / 2 + i * Math.PI / 3;
        px = Math.cos(a) * 9;
        py = Math.sin(a) * 9;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = c[1];
      ctx.beginPath();
      for (i = 0; i < 6; i++) {
        a = -Math.PI / 2 + i * Math.PI / 3;
        px = Math.cos(a) * 5;
        py = Math.sin(a) * 5;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  /* =========================================================
   * 粒子（火花 / 光点 / 冲击环 / 闪光）
   * ========================================================= */
  function Particle(x, y, vx, vy, life, type, color, size) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.type = type || 'glow';
    this.color = color || '#ffffff';
    this.size = size || 3;
    this.dead = false;
    this.drag = type === 'spark' ? 0.92 : 0.98;
  }

  Particle.prototype.update = function (dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    var d = Math.pow(this.drag, dt * 60);
    this.vx *= d;
    this.vy *= d;
  };

  Particle.prototype.draw = function (ctx) {
    var k = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = k;
    if (this.type === 'ring') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2 * k + 0.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size * (1.6 - k), 0, U.TAU); ctx.stroke();
    } else if (this.type === 'flash') {
      ctx.fillStyle = this.color;
      ctx.globalAlpha = k * 0.8;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size * k, 0, U.TAU); ctx.fill();
    } else if (this.type === 'spark') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size * 0.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.vx * 0.03, this.y - this.vy * 0.03);
      ctx.stroke();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size * k, 0, U.TAU); ctx.fill();
    }
    ctx.restore();
  };

  /* =========================================================
   * 飘字（得分 / 提示）
   * ========================================================= */
  function FloatText(x, y, text, color, life, size) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color || '#ffffff';
    this.life = life || 0.9;
    this.maxLife = this.life;
    this.size = size || 14;
    this.dead = false;
  }

  FloatText.prototype.update = function (dt) {
    this.life -= dt;
    this.y -= 34 * dt;
    if (this.life <= 0) this.dead = true;
  };

  FloatText.prototype.draw = function (ctx) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.life / this.maxLife * 1.6);
    ctx.font = 'bold ' + this.size + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  };

  /* =========================================================
   * 模块级辅助函数
   * ========================================================= */
  function spawnEnemyBullet(game, x, y, angle, speed) {
    game.bullets.push(new Bullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
      { friendly: false }));
  }

  /* 爆炸：火花 + 光点 + 冲击环 + 闪光 */
  function explode(game, x, y, color, size, count) {
    count = count || 16;
    var i, a, sp;
    for (i = 0; i < count; i++) {
      a = Math.random() * U.TAU;
      sp = U.rand(40, 90) * (size / 24);
      game.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        U.rand(0.3, 0.7), 'spark', color, U.rand(2, 4)));
    }
    for (i = 0; i < Math.ceil(count / 3); i++) {
      a = Math.random() * U.TAU;
      sp = U.rand(10, 40);
      game.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        U.rand(0.3, 0.8), 'glow', U.pick([color, '#ffd24d', '#ffffff']), U.rand(3, 7)));
    }
    game.particles.push(new Particle(x, y, 0, 0, 0.35, 'ring', color, size * 0.9));
    game.particles.push(new Particle(x, y, 0, 0, 0.18, 'flash', '#ffffff', size * 1.1));
  }

  /* 导出 */
  GW.entities = {
    Bullet: Bullet,
    Enemy: Enemy,
    Boss: Boss,
    Player: Player,
    Item: Item,
    Particle: Particle,
    FloatText: FloatText,
    spawnEnemyBullet: spawnEnemyBullet,
    explode: explode,
    drawShipBody: drawShipBody
  };
})();
