/* ═══════════════════════════════════════════════
   nutrition.js — 食物库 + 热量/营养素估算
   数据来源：中国食物成分表常用条目（每 100g 可食部）
   精确到「够用」即可：目标是把摄入量估到 ±15% 以内，
   而不是做临床营养计算。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const N = {};

  /* 每条： kcal / 蛋白 p / 脂肪 f / 碳水 c / 纤维 fib（每100g）*/
  const FOODS = [
    /* ── 主食 ── */
    { n: '米饭',        k: 116, p: 2.6, f: 0.3, c: 25.9, fib: 0.3, unit: '碗', gram: 200, tag: '主食' },
    { n: '白粥',        k: 46,  p: 1.1, f: 0.2, c: 9.9,  fib: 0.1, unit: '碗', gram: 250, tag: '主食' },
    { n: '馒头',        k: 223, p: 7.0, f: 1.1, c: 47.0, fib: 1.3, unit: '个', gram: 100, tag: '主食' },
    { n: '包子',        k: 227, p: 7.5, f: 6.0, c: 36.0, fib: 1.2, unit: '个', gram: 100, tag: '主食' },
    { n: '面条',        k: 137, p: 4.5, f: 1.6, c: 26.0, fib: 0.8, unit: '碗', gram: 250, tag: '主食' },
    { n: '饺子',        k: 240, p: 9.0, f: 8.0, c: 33.0, fib: 1.5, unit: '个', gram: 20,  tag: '主食' },
    { n: '面包',        k: 312, p: 8.3, f: 5.1, c: 58.6, fib: 2.5, unit: '片', gram: 35,  tag: '主食' },
    { n: '全麦面包',    k: 246, p: 9.0, f: 3.2, c: 45.0, fib: 6.0, unit: '片', gram: 35,  tag: '主食' },
    { n: '燕麦',        k: 367, p: 15.0,f: 6.7, c: 61.0, fib: 10.6,unit: '份', gram: 40,  tag: '主食' },
    { n: '玉米',        k: 112, p: 4.0, f: 1.2, c: 22.8, fib: 2.9, unit: '根', gram: 200, tag: '主食' },
    { n: '红薯',        k: 99,  p: 1.1, f: 0.2, c: 24.7, fib: 1.6, unit: '个', gram: 150, tag: '主食' },
    { n: '土豆',        k: 81,  p: 2.6, f: 0.2, c: 17.8, fib: 1.1, unit: '个', gram: 150, tag: '主食' },
    { n: '意大利面',    k: 158, p: 5.8, f: 0.9, c: 31.0, fib: 1.8, unit: '份', gram: 200, tag: '主食' },

    /* ── 蛋白质 ── */
    { n: '鸡蛋',        k: 144, p: 13.3,f: 8.8, c: 2.8,  fib: 0,   unit: '个', gram: 55,  tag: '蛋白' },
    { n: '水煮蛋',      k: 144, p: 13.3,f: 8.8, c: 2.8,  fib: 0,   unit: '个', gram: 55,  tag: '蛋白' },
    { n: '煎蛋',        k: 200, p: 13.0,f: 15.0,c: 1.5,  fib: 0,   unit: '个', gram: 60,  tag: '蛋白' },
    { n: '鸡胸肉',      k: 133, p: 19.4,f: 5.0, c: 2.5,  fib: 0,   unit: '份', gram: 150, tag: '蛋白' },
    { n: '鸡腿肉',      k: 181, p: 16.0,f: 13.0,c: 0,    fib: 0,   unit: '份', gram: 150, tag: '蛋白' },
    { n: '牛肉',        k: 125, p: 19.9,f: 4.2, c: 2.0,  fib: 0,   unit: '份', gram: 150, tag: '蛋白' },
    { n: '猪肉',        k: 331, p: 15.3,f: 30.8,c: 0,    fib: 0,   unit: '份', gram: 100, tag: '蛋白' },
    { n: '瘦猪肉',      k: 143, p: 20.3,f: 6.2, c: 1.5,  fib: 0,   unit: '份', gram: 100, tag: '蛋白' },
    { n: '羊肉',        k: 203, p: 19.0,f: 14.1,c: 0,    fib: 0,   unit: '份', gram: 100, tag: '蛋白' },
    { n: '鱼',          k: 104, p: 17.6,f: 3.1, c: 0,    fib: 0,   unit: '份', gram: 150, tag: '蛋白' },
    { n: '三文鱼',      k: 139, p: 17.2,f: 7.8, c: 0,    fib: 0,   unit: '份', gram: 120, tag: '蛋白' },
    { n: '虾',          k: 93,  p: 18.6,f: 0.8, c: 2.8,  fib: 0,   unit: '份', gram: 100, tag: '蛋白' },
    { n: '豆腐',        k: 82,  p: 8.1, f: 3.7, c: 4.2,  fib: 0.4, unit: '份', gram: 150, tag: '蛋白' },
    { n: '豆浆',        k: 31,  p: 3.0, f: 1.6, c: 1.2,  fib: 1.1, unit: '杯', gram: 250, tag: '蛋白' },
    { n: '牛奶',        k: 54,  p: 3.0, f: 3.2, c: 3.4,  fib: 0,   unit: '杯', gram: 250, tag: '蛋白' },
    { n: '脱脂牛奶',    k: 33,  p: 3.4, f: 0.3, c: 4.9,  fib: 0,   unit: '杯', gram: 250, tag: '蛋白' },
    { n: '酸奶',        k: 72,  p: 2.5, f: 2.7, c: 9.3,  fib: 0,   unit: '杯', gram: 150, tag: '蛋白' },
    { n: '蛋白粉',      k: 380, p: 80.0,f: 3.0, c: 8.0,  fib: 1.0, unit: '勺', gram: 30,  tag: '蛋白' },
    { n: '火腿肠',      k: 212, p: 14.0,f: 10.4,c: 15.6, fib: 0,   unit: '根', gram: 45,  tag: '蛋白' },
    { n: '腊肉',        k: 498, p: 11.8,f: 48.8,c: 2.9,  fib: 0,   unit: '份', gram: 50,  tag: '蛋白' },

    /* ── 蔬菜 ── */
    { n: '青菜',        k: 15,  p: 1.5, f: 0.3, c: 2.7,  fib: 1.1, unit: '份', gram: 200, tag: '蔬菜' },
    { n: '白菜',        k: 17,  p: 1.5, f: 0.1, c: 3.2,  fib: 0.8, unit: '份', gram: 200, tag: '蔬菜' },
    { n: '西兰花',      k: 36,  p: 4.1, f: 0.6, c: 4.3,  fib: 1.6, unit: '份', gram: 150, tag: '蔬菜' },
    { n: '菠菜',        k: 28,  p: 2.6, f: 0.3, c: 4.5,  fib: 1.7, unit: '份', gram: 150, tag: '蔬菜' },
    { n: '西红柿',      k: 20,  p: 0.9, f: 0.2, c: 4.0,  fib: 0.5, unit: '个', gram: 150, tag: '蔬菜' },
    { n: '黄瓜',        k: 16,  p: 0.8, f: 0.2, c: 2.9,  fib: 0.5, unit: '根', gram: 200, tag: '蔬菜' },
    { n: '胡萝卜',      k: 39,  p: 1.0, f: 0.2, c: 8.8,  fib: 1.1, unit: '根', gram: 150, tag: '蔬菜' },
    { n: '茄子',        k: 23,  p: 1.1, f: 0.2, c: 4.9,  fib: 1.3, unit: '份', gram: 150, tag: '蔬菜' },
    { n: '青椒',        k: 22,  p: 1.4, f: 0.3, c: 5.4,  fib: 1.4, unit: '份', gram: 100, tag: '蔬菜' },
    { n: '蘑菇',        k: 24,  p: 2.7, f: 0.1, c: 4.1,  fib: 2.1, unit: '份', gram: 100, tag: '蔬菜' },
    { n: '海带',        k: 13,  p: 1.2, f: 0.1, c: 2.1,  fib: 0.5, unit: '份', gram: 100, tag: '蔬菜' },

    /* ── 水果 ── */
    { n: '苹果',        k: 54,  p: 0.2, f: 0.2, c: 13.5, fib: 1.2, unit: '个', gram: 200, tag: '水果' },
    { n: '香蕉',        k: 93,  p: 1.4, f: 0.2, c: 22.0, fib: 1.2, unit: '根', gram: 120, tag: '水果' },
    { n: '橙子',        k: 48,  p: 0.8, f: 0.2, c: 11.1, fib: 0.6, unit: '个', gram: 200, tag: '水果' },
    { n: '西瓜',        k: 31,  p: 0.5, f: 0.3, c: 7.9,  fib: 0.2, unit: '份', gram: 300, tag: '水果' },
    { n: '葡萄',        k: 45,  p: 0.5, f: 0.2, c: 10.3, fib: 0.4, unit: '份', gram: 150, tag: '水果' },
    { n: '草莓',        k: 32,  p: 1.0, f: 0.2, c: 7.1,  fib: 1.1, unit: '份', gram: 150, tag: '水果' },
    { n: '梨',          k: 51,  p: 0.4, f: 0.2, c: 13.3, fib: 3.1, unit: '个', gram: 200, tag: '水果' },
    { n: '蓝莓',        k: 57,  p: 0.7, f: 0.3, c: 14.5, fib: 2.4, unit: '份', gram: 100, tag: '水果' },
    { n: '猕猴桃',      k: 61,  p: 0.8, f: 0.6, c: 14.5, fib: 2.6, unit: '个', gram: 100, tag: '水果' },

    /* ── 零食 / 饮料 / 油脂 ── */
    { n: '薯片',        k: 548, p: 6.0, f: 35.0,c: 52.0, fib: 3.0, unit: '袋', gram: 70,  tag: '零食' },
    { n: '巧克力',      k: 589, p: 4.3, f: 40.1,c: 53.4, fib: 1.5, unit: '块', gram: 40,  tag: '零食' },
    { n: '饼干',        k: 435, p: 9.0, f: 12.7,c: 71.7, fib: 1.1, unit: '份', gram: 50,  tag: '零食' },
    { n: '蛋糕',        k: 347, p: 5.0, f: 13.0,c: 52.0, fib: 0.8, unit: '块', gram: 100, tag: '零食' },
    { n: '冰淇淋',      k: 127, p: 2.4, f: 5.3, c: 17.3, fib: 0,   unit: '个', gram: 100, tag: '零食' },
    { n: '坚果',        k: 600, p: 20.0,f: 50.0,c: 20.0, fib: 8.0, unit: '份', gram: 30,  tag: '零食' },
    { n: '可乐',        k: 43,  p: 0,   f: 0,   c: 10.8, fib: 0,   unit: '罐', gram: 330, tag: '饮料' },
    { n: '奶茶',        k: 90,  p: 1.0, f: 3.5, c: 13.0, fib: 0,   unit: '杯', gram: 500, tag: '饮料' },
    { n: '果汁',        k: 45,  p: 0.2, f: 0.1, c: 11.0, fib: 0.2, unit: '杯', gram: 300, tag: '饮料' },
    { n: '啤酒',        k: 32,  p: 0.4, f: 0,   c: 3.1,  fib: 0,   unit: '瓶', gram: 500, tag: '饮料' },
    { n: '咖啡',        k: 2,   p: 0.2, f: 0,   c: 0.3,  fib: 0,   unit: '杯', gram: 250, tag: '饮料' },
    { n: '拿铁',        k: 55,  p: 3.0, f: 3.0, c: 4.5,  fib: 0,   unit: '杯', gram: 350, tag: '饮料' },
    { n: '食用油',      k: 899, p: 0,   f: 99.9,c: 0,    fib: 0,   unit: '勺', gram: 10,  tag: '油脂' },
    { n: '花生油',      k: 899, p: 0,   f: 99.9,c: 0,    fib: 0,   unit: '勺', gram: 10,  tag: '油脂' },
    { n: '黄油',        k: 888, p: 1.4, f: 98.0,c: 0,    fib: 0,   unit: '勺', gram: 10,  tag: '油脂' },

    /* ── 常见外食 / 中式菜（估算值） ── */
    { n: '食堂套餐',    k: 550, p: 22.0,f: 18.0,c: 72.0, fib: 4.0, unit: '份', gram: 500, tag: '外食' },
    { n: '盖浇饭',      k: 650, p: 20.0,f: 20.0,c: 95.0, fib: 3.0, unit: '份', gram: 500, tag: '外食' },
    { n: '炒饭',        k: 186, p: 5.0, f: 6.0, c: 28.0, fib: 0.8, unit: '份', gram: 350, tag: '外食' },
    { n: '炒面',        k: 192, p: 6.0, f: 7.0, c: 26.0, fib: 1.2, unit: '份', gram: 350, tag: '外食' },
    { n: '麻辣烫',      k: 120, p: 6.0, f: 6.0, c: 11.0, fib: 2.0, unit: '份', gram: 600, tag: '外食' },
    { n: '火锅',        k: 180, p: 9.0, f: 12.0,c: 8.0,  fib: 2.0, unit: '份', gram: 500, tag: '外食' },
    { n: '汉堡',        k: 250, p: 12.0,f: 12.0,c: 24.0, fib: 1.5, unit: '个', gram: 180, tag: '外食' },
    { n: '炸鸡',        k: 279, p: 18.0,f: 18.0,c: 12.0, fib: 0.5, unit: '份', gram: 150, tag: '外食' },
    { n: '披萨',        k: 268, p: 11.0,f: 10.0,c: 33.0, fib: 2.0, unit: '块', gram: 120, tag: '外食' },
    { n: '拉面',        k: 145, p: 6.5, f: 4.5, c: 20.0, fib: 1.0, unit: '碗', gram: 500, tag: '外食' },
    { n: '麻辣香锅',    k: 210, p: 10.0,f: 15.0,c: 9.0,  fib: 2.5, unit: '份', gram: 400, tag: '外食' },
    { n: '沙拉',        k: 60,  p: 2.5, f: 3.5, c: 4.5,  fib: 2.0, unit: '份', gram: 250, tag: '外食' },
    { n: '鸡蛋灌饼',    k: 245, p: 8.0, f: 11.0,c: 28.0, fib: 1.5, unit: '个', gram: 180, tag: '外食' },
    { n: '豆浆油条',    k: 388, p: 8.0, f: 18.0,c: 49.0, fib: 1.5, unit: '份', gram: 200, tag: '外食' },
    { n: '关东煮',      k: 95,  p: 6.0, f: 4.0, c: 8.0,  fib: 1.0, unit: '份', gram: 200, tag: '外食' },
    { n: '螺蛳粉',      k: 160, p: 5.0, f: 6.5, c: 21.0, fib: 1.5, unit: '碗', gram: 500, tag: '外食' }
  ];

  /* 别名 → 主名 */
  const ALIAS = {
    '白米饭': '米饭', '大米饭': '米饭', '稀饭': '白粥', '粥': '白粥', '小米粥': '白粥',
    '鸡胸': '鸡胸肉', '鸡胸脯': '鸡胸肉', '鸡腿': '鸡腿肉', '牛排': '牛肉',
    '猪瘦肉': '瘦猪肉', '虾仁': '虾', '虾子': '虾', '鱼片': '鱼', '海鱼': '鱼',
    '青江菜': '青菜', '小白菜': '白菜', '包菜': '白菜', '卷心菜': '白菜',
    '花椰菜': '西兰花', '番茄': '西红柿', '圣女果': '西红柿',
    '橘子': '橙子', '桔子': '橙子', '奇异果': '猕猴桃',
    '酸奶': '酸奶', '优酪乳': '酸奶', '芝士': '黄油',
    '薯条': '薯片', '雪碧': '可乐', '芬达': '可乐', '汽水': '可乐',
    '珍珠奶茶': '奶茶', '拿铁咖啡': '拿铁', '美式': '咖啡', '美式咖啡': '咖啡',
    '面': '面条', '挂面': '面条', '拉条': '面条', '泡面': '面条', '方便面': '面条',
    '米线': '面条', '米粉': '面条', '馄饨': '饺子', '云吞': '饺子',
    '地瓜': '红薯', '番薯': '红薯', '马铃薯': '土豆',
    '煎鸡蛋': '煎蛋', '荷包蛋': '煎蛋', '水煮鸡蛋': '水煮蛋',
    '植物蛋白粉': '蛋白粉', '乳清蛋白': '蛋白粉'
  };

  N.FOODS = FOODS;

  /* 建立检索索引 */
  const INDEX = FOODS.map(f => ({ ...f, lower: f.n.toLowerCase() }));
  Object.keys(ALIAS).forEach(a => {
    const target = FOODS.find(f => f.n === ALIAS[a]);
    if (target) INDEX.push({ ...target, lower: a.toLowerCase(), alias: a });
  });

  N.search = function (q, limit = 12) {
    q = (q || '').trim().toLowerCase();
    if (!q) return FOODS.slice(0, limit);
    const exact = [], starts = [], contains = [];
    INDEX.forEach(f => {
      if (f.n === q || f.alias === q) exact.push(f);
      else if (f.lower.startsWith(q) || f.n.startsWith(q)) starts.push(f);
      else if (f.lower.includes(q) || f.n.includes(q)) contains.push(f);
    });
    const out = [], seen = new Set();
    [...exact, ...starts, ...contains].forEach(f => {
      if (seen.has(f.n)) return;
      seen.add(f.n); out.push(f);
    });
    return out.slice(0, limit);
  };

  N.find = function (name) {
    if (!name) return null;
    const q = name.trim().toLowerCase();
    return INDEX.find(f => f.n === name || f.alias === name)
        || INDEX.find(f => f.lower === q)
        || INDEX.find(f => f.n.includes(name) || (f.alias || '').includes(name))
        || null;
  };

  /**
   * 计算一条食物记录的营养
   * @param {object} item { name, grams, unit, count }
   */
  N.calc = function (item) {
    const food = N.find(item.name);
    let grams = Number(item.grams) || 0;
    if (!grams && food && item.count) grams = food.gram * Number(item.count);
    if (!grams) grams = food ? food.gram : 100;

    if (!food) {
      // 未知食物：按通用估算 150 kcal/100g
      return { kcal: grams * 1.5, p: grams * 0.05, f: grams * 0.05, c: grams * 0.18, fib: grams * 0.01, grams, unknown: true, name: item.name };
    }
    const r = grams / 100;
    return {
      name: food.n, food, grams,
      kcal: food.k * r, p: food.p * r, f: food.f * r, c: food.c * r, fib: food.fib * r,
      unknown: false
    };
  };

  /** 一天汇总 */
  N.dayTotals = function (meals) {
    const t = { kcal: 0, p: 0, f: 0, c: 0, fib: 0, items: 0, unknown: 0 };
    (meals || []).forEach(m => {
      (m.items || []).forEach(it => {
        const r = N.calc(it);
        t.kcal += r.kcal; t.p += r.p; t.f += r.f; t.c += r.c; t.fib += r.fib;
        t.items++;
        if (r.unknown) t.unknown++;
      });
    });
    return { kcal: Math.round(t.kcal), p: U.round(t.p, 1), f: U.round(t.f, 1), c: U.round(t.c, 1), fib: U.round(t.fib, 1), items: t.items, unknown: t.unknown };
  };

  /* 三大营养素供能比（%） */
  N.macroRatio = function (tot) {
    const pk = tot.p * 4, fk = tot.f * 9, ck = tot.c * 4;
    const sum = pk + fk + ck;
    if (!sum) return { p: 0, f: 0, c: 0 };
    return { p: Math.round(pk / sum * 100), f: Math.round(fk / sum * 100), c: Math.round(ck / sum * 100) };
  };

  /**
   * 生成健康评估（本地规则，不依赖 AI）
   * 需要 settings.body 里有目标值；没有就给事实不给评价。
   */
  N.assess = function (tot, sleepRec, body, sleepTarget) {
    const out = { facts: [], issues: [], good: [], level: 'unknown', score: null };

    /* ── 热量 ── */
    if (body && body.dailyKcal) {
      const target = Number(body.dailyKcal);
      const diff = tot.kcal - target;
      const pct = Math.round(diff / target * 100);
      out.facts.push(`热量 ${tot.kcal} kcal / 目标 ${target} kcal（${diff >= 0 ? '超出' : '缺口'} ${Math.abs(diff)} kcal，${pct > 0 ? '+' : ''}${pct}%）`);
      if (diff > target * 0.2) out.issues.push(`热量超出目标 ${pct}%，减脂期建议控制在目标 ±10% 以内`);
      else if (diff < -target * 0.3) out.issues.push(`热量缺口过大（${-pct}%），长期会掉肌肉、代谢下降，建议不低于目标 80%`);
      else out.good.push('热量控制良好，在合理区间内');
    } else {
      out.facts.push(`热量 ${tot.kcal} kcal（未设目标，无法评价）`);
    }

    /* ── 蛋白质 ── */
    if (body && body.proteinTarget) {
      const pt = Number(body.proteinTarget);
      out.facts.push(`蛋白质 ${tot.p} g / 目标 ${pt} g`);
      const ratio = tot.p / pt;
      if (ratio < 0.7) out.issues.push(`蛋白质只到目标的 ${Math.round(ratio * 100)}%，减脂期蛋白质不足会掉肌肉，建议补鸡蛋/鸡胸/牛奶/蛋白粉`);
      else if (ratio >= 1) out.good.push('蛋白质达标，有利于减脂期保肌肉');
      else out.good.push('蛋白质接近达标，再补一点更好');
    } else if (body && body.weight) {
      // 无目标时按体重推荐 1.6g/kg
      const rec = Math.round(body.weight * 1.6);
      out.facts.push(`蛋白质 ${tot.p} g（按体重 ${body.weight}kg 建议 ≥${rec} g）`);
      if (tot.p < rec * 0.7) out.issues.push(`蛋白质偏低，减脂期建议每天 ${rec} g 左右`);
    } else {
      out.facts.push(`蛋白质 ${tot.p} g`);
    }

    /* ── 脂肪比例 ── */
    const mr = N.macroRatio(tot);
    out.facts.push(`供能比：蛋白 ${mr.p}% / 脂肪 ${mr.f}% / 碳水 ${mr.c}%`);
    if (tot.kcal > 300) {
      if (mr.f > 40) out.issues.push(`脂肪供能比 ${mr.f}% 偏高（建议 20~30%），注意油炸和肥肉`);
      else if (mr.f < 15) out.issues.push(`脂肪供能比仅 ${mr.f}%，过低会影响激素水平，可适当加坚果/深海鱼`);
      else out.good.push('脂肪比例合理');
      if (mr.c > 65) out.issues.push(`碳水供能比 ${mr.c}% 偏高，减脂期建议降到 50~60%，多用粗粮替换精米面`);
      if (mr.p < 15 && tot.kcal > 1200) out.issues.push(`蛋白供能比 ${mr.p}% 偏低`);
    }

    /* ── 纤维 ── */
    if (tot.items) {
      out.facts.push(`膳食纤维 ${tot.fib} g`);
      const veg = (tot.fib || 0);
      if (veg < 15) out.issues.push(`膳食纤维 ${veg} g 偏少（建议 25~30g），多吃蔬菜和粗粮`);
      else out.good.push('膳食纤维充足');
    }

    /* ── 睡眠 ── */
    if (sleepRec && sleepRec.hours != null) {
      const target = sleepTarget || 7.5;
      out.facts.push(`睡眠 ${sleepRec.hours} 小时${sleepRec.bedtime ? `（${sleepRec.bedtime} 入睡）` : ''}`);
      if (sleepRec.hours < 6) out.issues.push(`睡眠仅 ${sleepRec.hours} 小时，明显不足。睡不够会升高皮质醇、增加食欲，直接拖慢减脂`);
      else if (sleepRec.hours < target - 0.5) out.issues.push(`睡眠 ${sleepRec.hours} 小时，略低于目标 ${target} 小时`);
      else out.good.push('睡眠时长达标');

      if (sleepRec.bedtime) {
        const bh = parseInt(sleepRec.bedtime.split(':')[0], 10) + (parseInt(sleepRec.bedtime.split(':')[1], 10) || 0) / 60;
        const late = bh >= 1 && bh < 6 ? bh + 24 : bh;
        if (late >= 0.5 + 24 - 0.01 || (bh >= 0 && bh <= 4)) out.issues.push(`入睡时间 ${sleepRec.bedtime} 偏晚，长期熬夜影响恢复和激素分泌，建议 23:30 前`);
      }
    } else {
      out.facts.push('睡眠：未记录');
      out.issues.push('昨晚作息未记录，无法评估');
    }

    /* ── 综合评级 ── */
    if (out.issues.length === 0 && (body && body.dailyKcal)) out.level = 'good';
    else if (out.issues.length <= 1) out.level = 'ok';
    else if (out.issues.length <= 3) out.level = 'warn';
    else out.level = 'bad';
    if (!body || !body.dailyKcal) out.level = 'unknown';

    out.macro = mr;
    return out;
  };

  /** 生成给 AI 的体检报告文本 */
  N.toPrompt = function (date, meals, totals, sleepRec, body, weights) {
    const L = [];
    L.push(`# 饮食作息日报 · ${date}`);
    L.push('');
    L.push('## 三餐记录');
    const byType = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐/零食' };
    ['breakfast', 'lunch', 'dinner', 'snack'].forEach(t => {
      const list = (meals || []).filter(m => m.type === t);
      if (!list.length) { L.push(`- ${byType[t]}：未记录`); return; }
      list.forEach(m => {
        const items = (m.items || []).map(it => {
          const r = N.calc(it);
          return `${it.name}${r.grams ? ` ${Math.round(r.grams)}g` : ''}（${Math.round(r.kcal)}kcal）`;
        });
        L.push(`- ${byType[t]}${m.time ? ' ' + m.time : ''}：${items.join('、') || '（空）'}`);
      });
    });

    L.push('');
    L.push('## 营养汇总');
    L.push(`- 总热量：${totals.kcal} kcal`);
    L.push(`- 蛋白质：${totals.p} g`);
    L.push(`- 脂肪：${totals.f} g`);
    L.push(`- 碳水：${totals.c} g`);
    L.push(`- 膳食纤维：${totals.fib} g`);
    const mr = N.macroRatio(totals);
    L.push(`- 供能比：蛋白 ${mr.p}% / 脂肪 ${mr.f}% / 碳水 ${mr.c}%`);

    L.push('');
    L.push('## 作息');
    if (sleepRec) {
      L.push(`- 入睡：${sleepRec.bedtime || '未记录'}`);
      L.push(`- 起床：${sleepRec.wake || '未记录'}`);
      L.push(`- 睡眠时长：${sleepRec.hours != null ? sleepRec.hours + ' 小时' : '未记录'}`);
      if (sleepRec.nap) L.push(`- 午睡：${sleepRec.nap} 分钟`);
      if (sleepRec.quality) L.push(`- 主观质量：${sleepRec.quality}`);
    } else {
      L.push('- 未记录');
    }

    L.push('');
    L.push('## 个人数据与目标');
    if (body) {
      L.push(`- 当前体重：${body.weight || '未设置'} kg`);
      L.push(`- 目标体重：${body.targetWeight || '未设置'} kg`);
      L.push(`- 每日热量目标：${body.dailyKcal || '未设置'} kcal`);
      L.push(`- 每日蛋白目标：${body.proteinTarget || '未设置'} g`);
      L.push(`- 目标睡眠：${body.sleepTarget || 7.5} 小时`);
      L.push(`- 阶段：减脂`);
    }
    if (weights && weights.length >= 2) {
      const recent = weights.slice(-7);
      const first = recent[0], last = recent[recent.length - 1];
      const delta = U.round(last.kg - first.kg, 1);
      L.push(`- 近期体重变化：${first.date} ${first.kg}kg → ${last.date} ${last.kg}kg（${delta >= 0 ? '+' : ''}${delta}kg）`);
    }

    L.push('');
    L.push('## 请你做的事');
    L.push('1. 评价今天的饮食结构和作息是否健康，指出具体问题');
    L.push('2. 估算热量和三大营养素是否合理（我体重偏重，正在减脂）');
    L.push('3. 指出哪一类营养素摄入不足或过量，给具体补充建议');
    L.push('4. 给明天可执行的 3 条改进建议（要具体到吃什么、几点睡）');

    return L.join('\n');
  };

  global.Nutrition = N;
})(window);