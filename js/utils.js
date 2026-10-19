/* =========================================================
 * utils.js — 通用数学 / 工具函数
 * 命名空间：window.GW（全局共享，无模块化，file:// 可直接运行）
 * ========================================================= */
(function () {
  'use strict';
  window.GW = window.GW || {};

  var TAU = Math.PI * 2;

  GW.utils = {
    TAU: TAU,

    clamp: function (v, min, max) { return v < min ? min : (v > max ? max : v); },

    lerp: function (a, b, t) { return a + (b - a) * t; },

    rand: function (min, max) { return min + Math.random() * (max - min); },

    randInt: function (min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },

    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },

    /* 两点距离平方（避免开方，碰撞检测用） */
    dist2: function (ax, ay, bx, by) {
      var dx = ax - bx, dy = ay - by;
      return dx * dx + dy * dy;
    },

    angleTo: function (ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },

    easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },

    /* 圆角矩形路径（兼容不支持 ctx.roundRect 的旧浏览器） */
    roundRect: function (ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  };
})();
