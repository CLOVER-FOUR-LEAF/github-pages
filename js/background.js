/* =========================================================
 * background.js — 星空滚动背景
 * 三层视差星点 + 预渲染星云光斑，性能友好
 * ========================================================= */
(function () {
  'use strict';
  window.GW = window.GW || {};

  /* 离屏画布预渲染柔和星云 */
  function makeNebula(color) {
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return c;
  }

  function Starfield() {
    this._bgGrad = null;

    var conf = [
      { count: 70, speed: 36,  size: 1.0, alpha: 0.45 },  // 远景：慢而暗
      { count: 45, speed: 85,  size: 1.6, alpha: 0.65 },  // 中景
      { count: 26, speed: 165, size: 2.3, alpha: 0.95 }   // 近景：快而亮
    ];

    this.layers = [];
    for (var i = 0; i < conf.length; i++) {
      var stars = [];
      for (var j = 0; j < conf[i].count; j++) {
        stars.push({
          x: Math.random() * GW.Config.W,
          y: Math.random() * GW.Config.H,
          tw: Math.random() * Math.PI * 2   // 闪烁相位
        });
      }
      this.layers.push({ cfg: conf[i], stars: stars });
    }

    this.nebulas = [];
    var colors = ['rgba(124,58,237,0.20)', 'rgba(14,116,233,0.18)', 'rgba(236,72,153,0.14)'];
    for (var k = 0; k < 3; k++) {
      this.nebulas.push({
        img: makeNebula(colors[k]),
        x: Math.random() * GW.Config.W,
        y: Math.random() * GW.Config.H,
        scale: 1.6 + Math.random() * 1.2,
        speed: 8 + k * 6
      });
    }
  }

  Starfield.prototype.update = function (dt, boost) {
    boost = boost || 1;
    var i, j, s, L;
    for (i = 0; i < this.layers.length; i++) {
      L = this.layers[i];
      for (j = 0; j < L.stars.length; j++) {
        s = L.stars[j];
        s.y += L.cfg.speed * boost * dt;
        s.tw += dt * 3;
        if (s.y > GW.Config.H + 4) {
          s.y = -4;
          s.x = Math.random() * GW.Config.W;
        }
      }
    }
    for (i = 0; i < this.nebulas.length; i++) {
      var n = this.nebulas[i];
      n.y += n.speed * boost * dt;
      if (n.y - 128 * n.scale > GW.Config.H) {
        n.y = -128 * n.scale;
        n.x = Math.random() * GW.Config.W;
      }
    }
  };

  Starfield.prototype.draw = function (ctx) {
    var W = GW.Config.W, H = GW.Config.H;
    var i, j, s, L;

    /* 深空底色（渐变只创建一次并缓存） */
    if (!this._bgGrad) {
      this._bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      this._bgGrad.addColorStop(0, '#050818');
      this._bgGrad.addColorStop(0.55, '#0a0f2e');
      this._bgGrad.addColorStop(1, '#050818');
    }
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, W, H);

    /* 星云 */
    for (i = 0; i < this.nebulas.length; i++) {
      var n = this.nebulas[i];
      ctx.globalAlpha = 0.5;
      ctx.drawImage(n.img, n.x - 128 * n.scale, n.y - 128 * n.scale, 256 * n.scale, 256 * n.scale);
    }
    ctx.globalAlpha = 1;

    /* 星点（带闪烁） */
    for (i = 0; i < this.layers.length; i++) {
      L = this.layers[i];
      ctx.fillStyle = '#ffffff';
      for (j = 0; j < L.stars.length; j++) {
        s = L.stars[j];
        ctx.globalAlpha = L.cfg.alpha * (0.65 + 0.35 * Math.sin(s.tw));
        ctx.fillRect(s.x, s.y, L.cfg.size, L.cfg.size);
      }
    }
    ctx.globalAlpha = 1;
  };

  GW.Starfield = Starfield;
})();
