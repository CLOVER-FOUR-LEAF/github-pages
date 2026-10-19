/* =========================================================
 * sound.js — WebAudio 合成音效（无外部音频文件）
 * 射击 / 命中 / 爆炸 / 拾取 / 升级 / Boss 警告
 * ========================================================= */
(function () {
  'use strict';
  window.GW = window.GW || {};

  var Sound = {
    ctx: null,
    enabled: true,
    _lastShoot: 0,

    /* 必须在用户手势中调用（浏览器自动播放策略） */
    ensure: function () {
      if (!this.ctx) {
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
    },

    /* 基础音调：振荡器 + 指数衰减包络 */
    tone: function (freq, dur, type, vol, slideTo) {
      if (!this.enabled || !this.ctx) return;
      try {
        var t0 = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
        }
        gain.gain.setValueAtTime(vol || 0.04, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      } catch (e) { /* 音频不可用时静默降级 */ }
    },

    shoot: function () {
      var now = (window.performance && performance.now()) || Date.now();
      if (now - this._lastShoot < 45) return;   // 节流，避免刺耳
      this._lastShoot = now;
      this.tone(760, 0.07, 'square', 0.020, 320);
    },

    hit: function () { this.tone(300, 0.05, 'square', 0.030, 180); },

    explode: function (big) {
      this.tone(big ? 130 : 180, big ? 0.40 : 0.22, 'sawtooth', big ? 0.075 : 0.040, 40);
    },

    pickup: function () { this.tone(620, 0.08, 'sine', 0.045, 940); },

    levelup: function () {
      var self = this;
      [523, 659, 784, 1046].forEach(function (f, i) {
        setTimeout(function () { self.tone(f, 0.12, 'triangle', 0.045); }, i * 70);
      });
    },

    hurt: function () { this.tone(220, 0.25, 'sawtooth', 0.065, 70); },

    bossWarn: function () { this.tone(98, 0.7, 'sawtooth', 0.065, 60); }
  };

  GW.Sound = Sound;
})();
