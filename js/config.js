/* =========================================================
 * config.js — 游戏数值配置
 * 敌机 / Boss / 升级项都在这里调整，改数值即可改玩法
 * ========================================================= */
(function () {
  'use strict';
  window.GW = window.GW || {};

  GW.Config = {

    /* 逻辑分辨率（画布内部坐标系，渲染时等比缩放到窗口） */
    W: 480,
    H: 800,

    /* ---------- 玩家 ---------- */
    PLAYER: {
      radius: 13,
      speed: 330,          // 键盘移动速度 px/s
      hp: 3,               // 初始生命
      maxHp: 5,            // 生命上限（可被「装甲强化」提升）
      fireInterval: 0.24,  // 基础射击间隔（秒）
      bulletDamage: 10,    // 基础子弹伤害
      bulletSpeed: 580,
      invulnTime: 1.6,     // 受击后无敌时间
      maxBullets: 5,       // 弹道上限
      maxShield: 3,        // 护盾层数上限
      maxWingmen: 2        // 僚机数量上限
    },

    /* ---------- 普通敌机 ---------- */
    ENEMIES: {
      scout: {
        name: '侦察机',
        hp: 22, speed: 145, radius: 15,
        xp: 3, score: 100, drop: 0.26,
        fire: { cdMin: 1.6, cdMax: 3.2, pattern: 'aimed',  speed: 235, count: 1 },
        body: '#ff5a6e', accent: '#ffd9de'
      },
      fighter: {
        name: '战斗机',
        hp: 48, speed: 95, radius: 18,
        xp: 5, score: 160, drop: 0.34,
        fire: { cdMin: 2.0, cdMax: 3.4, pattern: 'burst',  speed: 250, count: 2 },
        body: '#c86bff', accent: '#efd6ff'
      },
      heavy: {
        name: '重型机',
        hp: 130, speed: 62, radius: 24,
        xp: 9, score: 320, drop: 0.50,
        fire: { cdMin: 2.2, cdMax: 3.2, pattern: 'spread', speed: 190, count: 3 },
        body: '#4fd66b', accent: '#d2f7dc'
      }
    },

    /* ---------- Boss（每 5 轮换一只） ---------- */
    BOSSES: [
      {
        name: '深渊毁灭者',
        hp: 900, radius: 52,
        body: '#8a5cff', accent: '#e3d4ff', core: '#ff4dd2',
        attacks: {
          1: ['ring', 'aimed'],
          2: ['ring', 'aimed', 'shotgun'],
          3: ['spiral', 'shotgun', 'summon']
        },
        cadence: [1.7, 1.35, 1.05]   // 各阶段攻击间隔（秒）
      },
      {
        name: '苍穹蜂后',
        hp: 850, radius: 48,
        body: '#2fbf9f', accent: '#c9f5e8', core: '#ffd24d',
        attacks: {
          1: ['rain', 'summon'],
          2: ['rain', 'aimed', 'summon'],
          3: ['spiral', 'shotgun', 'summon']
        },
        cadence: [1.6, 1.25, 1.00]
      },
      {
        name: '烈阳核舰',
        hp: 980, radius: 54,
        body: '#ff8a3d', accent: '#ffe1c2', core: '#fff3b0',
        attacks: {
          1: ['ring', 'rain'],
          2: ['spiral', 'aimed', 'rain'],
          3: ['spiral', 'shotgun', 'ring']
        },
        cadence: [1.8, 1.40, 1.10]
      }
    ],

    /* ---------- 升级池（升级时三选一） ---------- */
    UPGRADES: [
      { id: 'firerate',    name: '急速射击', icon: '⚡',  desc: '射速 +15%',                max: 8, rarity: 'common',
        apply: function (p) { p.weapon.interval *= 0.87; } },
      { id: 'multishot',   name: '多重射击', icon: '🔱',  desc: '弹道 +1',                  max: 4, rarity: 'rare',
        apply: function (p) { p.weapon.count = Math.min(p.weapon.max, p.weapon.count + 1); } },
      { id: 'damage',      name: '强化弹头', icon: '💥',  desc: '子弹伤害 +25%',            max: 8, rarity: 'common',
        apply: function (p) { p.weapon.damage *= 1.25; } },
      { id: 'shield',      name: '能量护盾', icon: '🛡️', desc: '获得 1 层护盾',            max: 3, rarity: 'rare',
        apply: function (p) { p.shield = Math.min(p.shieldMax, p.shield + 1); } },
      { id: 'armor',       name: '装甲强化', icon: '❤️',  desc: '生命上限 +1 并回复 1 点',  max: 3, rarity: 'rare',
        apply: function (p) { p.maxHp++; p.hp = Math.min(p.maxHp, p.hp + 1); } },
      { id: 'engine',      name: '超速引擎', icon: '🚀',  desc: '移动速度 +12%',            max: 5, rarity: 'common',
        apply: function (p) { p.speed *= 1.12; } },
      { id: 'bulletspeed', name: '疾风弹药', icon: '💨',  desc: '子弹速度 +20%',            max: 5, rarity: 'common',
        apply: function (p) { p.weapon.bulletSpeed *= 1.2; } },
      { id: 'wingman',     name: '僚机支援', icon: '✈️',  desc: '增加 1 架僚机（自动开火）', max: 2, rarity: 'epic',
        apply: function (p) { p.wingmen.push({ side: p.wingmen.length === 0 ? -1 : 1, timer: 0 }); } },
      { id: 'magnet',      name: '拾取磁场', icon: '🧲',  desc: '道具拾取范围 +50%',        max: 3, rarity: 'common',
        apply: function (p) { p.magnetRadius *= 1.5; } },
      { id: 'regen',       name: '纳米修复', icon: '♻️',  desc: '每 6 秒回复 1 点生命',     max: 3, rarity: 'rare',
        apply: function (p) { p.regen += 1; } },
      { id: 'pierce',      name: '穿透弹',   icon: '🎯',  desc: '子弹可额外穿透 1 个敌人',  max: 2, rarity: 'epic',
        apply: function (p) { p.weapon.pierce += 1; } }
    ]
  };
})();
