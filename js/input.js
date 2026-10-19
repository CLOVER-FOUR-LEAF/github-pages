/* =========================================================
 * input.js — 键鼠触摸统一输入
 * 键盘 WASD/方向键、鼠标跟随+按键开火、触摸相对拖拽
 * ========================================================= */
(function () {
  'use strict';
  window.GW = window.GW || {};

  var Input = {
    keys: {},
    mouse: { x: GW.Config.W / 2, y: GW.Config.H - 130, down: false, active: false },
    touch: { active: false, id: null, sx: 0, sy: 0, px: 0, py: 0, ox: 0, oy: 0 },
    _game: null,
    _canvas: null,

    init: function (canvas, game) {
      this._canvas = canvas;
      this._game = game;
      var self = this;

      /* ---------- 键盘 ---------- */
      window.addEventListener('keydown', function (e) {
        self.keys[e.code] = true;
        // 阻止方向键 / 空格滚动页面
        if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
      });
      window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
      window.addEventListener('blur', function () {
        self.keys = {};
        self.mouse.down = false;
      });

      /* ---------- 鼠标 ---------- */
      canvas.addEventListener('mousemove', function (e) {
        var p = self._toLocal(e.clientX, e.clientY);
        self.mouse.x = p.x;
        self.mouse.y = p.y;
        self.mouse.active = true;
        self.touch.active = false;
      });
      canvas.addEventListener('mousedown', function () { self.mouse.down = true; });
      window.addEventListener('mouseup', function () { self.mouse.down = false; });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      /* ---------- 触摸（相对锚点拖拽，飞机不瞬移） ---------- */
      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        var p = self._toLocal(t.clientX, t.clientY);
        self.touch.active = true;
        self.touch.id = t.identifier;
        self.touch.sx = p.x;
        self.touch.sy = p.y;
        self.touch.px = p.x;
        self.touch.py = p.y;
        self.mouse.active = false;
        var pl = self._game && self._game.player;
        if (pl) {
          self.touch.ox = pl.x - p.x;
          self.touch.oy = pl.y - p.y;
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
          var t = e.changedTouches[i];
          if (t.identifier === self.touch.id) {
            var p = self._toLocal(t.clientX, t.clientY);
            self.touch.px = p.x;
            self.touch.py = p.y;
          }
        }
      }, { passive: false });

      var endTouch = function (e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === self.touch.id) {
            self.touch.active = false;
            self.touch.id = null;
          }
        }
      };
      canvas.addEventListener('touchend', endTouch);
      canvas.addEventListener('touchcancel', endTouch);
    },

    /* 屏幕坐标 → 画布逻辑坐标（480x800） */
    _toLocal: function (cx, cy) {
      var r = this._canvas.getBoundingClientRect();
      return {
        x: (cx - r.left) / r.width * GW.Config.W,
        y: (cy - r.top) / r.height * GW.Config.H
      };
    },

    isDown: function (code) { return !!this.keys[code]; },

    /* 归一化移动向量（斜向不加速） */
    moveVector: function () {
      var x = 0, y = 0;
      if (this.isDown('ArrowLeft') || this.isDown('KeyA')) x -= 1;
      if (this.isDown('ArrowRight') || this.isDown('KeyD')) x += 1;
      if (this.isDown('ArrowUp') || this.isDown('KeyW')) y -= 1;
      if (this.isDown('ArrowDown') || this.isDown('KeyS')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x: x, y: y };
    },

    /* 手动开火输入（自动开火关闭时使用） */
    firing: function () {
      return this.isDown('Space') || this.isDown('KeyJ') ||
             (this.mouse.active && this.mouse.down);
    }
  };

  GW.Input = Input;
})();
