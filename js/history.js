/* ═══════════════════════════════════════════════
   history.js — 历史回顾的聚合层（纯计算，不碰 DOM）

   设计原则：
     1. 不另存一份数据，全部从现有集合实时算。
        理由：另存一份必然出现「快照和当前数据不一致」，
        而且用户改了历史记录后回顾页还显示旧值，更难解释。
     2. 纯函数，输入 (unit, anchor)，输出一个对象。
        这样能在 Node 里直接测，不用起浏览器。
     3. 没有数据的项明确返回 null，让视图层显示「没记录」，
        而不是用 0 冒充 —— 0 分和「没记」是两回事。

   三个粒度：
     week  周一 ~ 周日（跟 U.startOfWeek 一致）
     month 自然月；但钱的统计窗口会错位（见 S.monthWindow，收支共用）
     year  自然年
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const H = {};

  /* ───────── 区间 ───────── */

  const UNIT_NAMES = { week: '周', month: '月', year: '年' };

  /**
   * 取某个粒度的区间
   * @param {'week'|'month'|'year'} unit
   * @param {Date|string} anchor 区间内任意一天
   * @returns {{unit,start,end,days,label,sub,key,anchor}}
   */
  H.range = function (unit, anchor) {
    const d = U.parse(anchor || new Date());
    let start, end, label, sub, key;

    if (unit === 'week') {
      start = U.startOfWeek(d);
      end = U.addDays(start, 6);
      /* ISO 周号：用周四定归属年，避免跨年被算成第 1 周 */
      const thu = U.addDays(start, 3);
      const jan1 = new Date(thu.getFullYear(), 0, 1);
      const week = Math.ceil(((thu - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      label = `${start.getMonth() + 1}月${start.getDate()}日 ~ ${end.getMonth() + 1}月${end.getDate()}日`;
      sub = `${thu.getFullYear()} 年第 ${week} 周`;
      key = U.ymd(start);
    } else if (unit === 'year') {
      start = new Date(d.getFullYear(), 0, 1);
      end = new Date(d.getFullYear(), 11, 31);
      label = `${d.getFullYear()} 年`;
      sub = '全年';
      key = String(d.getFullYear());
    } else {
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      label = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
      sub = `${end.getDate()} 天`;
      key = U.ymd(start).slice(0, 7);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return {
      unit,
      start: U.ymd(start),
      end: U.ymd(end),
      days: U.diffDays(start, end) + 1,
      label, sub, key,
      anchor: U.ymd(d)
    };
  };

  /** 上一个 / 下一个区间的锚点 */
  H.shift = function (unit, anchor, delta) {
    const d = U.parse(anchor || new Date());
    /* 翻页后把锚点归到该区间的起点（周一 / 1 号 / 1 月 1 日）：
       一是三个粒度行为一致，二是避免「1月31日往前一个月」落到
       2月31日、闰年 2月29日往前一年 这类不存在的日期。 */
    if (unit === 'week') return U.ymd(U.startOfWeek(U.addDays(d, 7 * delta)));
    if (unit === 'year') return U.ymd(new Date(d.getFullYear() + delta, 0, 1));
    return U.ymd(new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  /** 当前是否已经在「本期」（不能再往后翻） */
  H.isCurrent = function (unit, anchor) {
    const a = H.range(unit, anchor), b = H.range(unit, new Date());
    return a.start === b.start;
  };

  /** 区间内所有日期（YYYY-MM-DD） */
  H.daysIn = function (range) {
    const out = [];
    let d = U.parse(range.start);
    const end = U.parse(range.end);
    while (d <= end) { out.push(U.ymd(d)); d = U.addDays(d, 1); }
    return out;
  };

  const inRange = (dateStr, range) => {
    const s = String(dateStr || '').slice(0, 10);
    return s >= range.start && s <= range.end;
  };

  /* ───────── 统计小工具 ───────── */

  const nums = a => a.filter(x => typeof x === 'number' && isFinite(x));
  const mean = a => { const v = nums(a); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const sum = a => nums(a).reduce((s, x) => s + x, 0);
  const round1 = x => (x == null ? null : Math.round(x * 10) / 10);

  /** 总体标准差（分钟） */
  function stdMinutes(times) {
    const v = nums(times);
    if (v.length < 2) return null;
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    const varSum = v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length;
    return Math.sqrt(varSum);
  }

  /**
   * 把 "23:40" 或 "00:20" 转成「以中午为原点的分钟数」。
   * 直接按 0~1440 算的话，23:40 和 00:20 会差 1400 分钟，
   * 但它俩其实只差 40 分钟 —— 作息规律性必须处理跨零点。
   */
  function bedtimeMinutes(t) {
    if (!t || !/^\d{1,2}:\d{2}$/.test(String(t))) return null;
    const [h, m] = String(t).split(':').map(Number);
    let mins = h * 60 + m;
    if (mins < 12 * 60) mins += 24 * 60;      // 凌晨算作「前一天深夜」
    return mins;
  }

  function formatBedtime(mins) {
    if (mins == null) return null;
    const m = Math.round(mins) % (24 * 60);
    return U.pad(Math.floor(m / 60)) + ':' + U.pad(m % 60);
  }

  /* ───────── 健康度评分 ─────────
     分数都是 0~100，且每一项都基于「有记录的样本」。
     记录天数太少会另算一个「数据完整度」，
     不把它揉进分数里 —— 否则只记 1 天的人也能拿 90 分，没意义。 */

  /** 睡眠评分：时长 50% + 规律性 30% + 质量 20% */
  H.sleepScore = function (st) {
    if (!st || st.days < 1) return null;
    let total = 0, weight = 0;

    if (st.avgHours != null) {
      /* 7~8.5 小时满分，偏离每小时扣 12 分 */
      const dev = st.avgHours < 7 ? 7 - st.avgHours : (st.avgHours > 8.5 ? st.avgHours - 8.5 : 0);
      total += Math.max(0, 100 - dev * 12) * 0.5;
      weight += 0.5;
    }
    if (st.bedtimeStdMin != null) {
      /* 入睡时间标准差：0 分 → 满分，90 分（1.5h）→ 0 分 */
      total += Math.max(0, 100 - (st.bedtimeStdMin / 90) * 100) * 0.3;
      weight += 0.3;
    }
    if (st.avgQuality != null) {
      total += Math.min(100, (st.avgQuality / 5) * 100) * 0.2;
      weight += 0.2;
    }
    return weight ? Math.round(total / weight) : null;
  };

  /**
   * 饮食评分：热量达标 30% + 蛋白充足 25% + 结构均衡 15% + 记录坚持 30%
   * @param {object} st 见 H.dietOf
   * @param {object} cfg { kcalTarget, proteinTarget }
   */
  H.dietScore = function (st, cfg) {
    if (!st || !st.days) return null;
    cfg = cfg || {};
    const kcalTarget = cfg.kcalTarget || 1800;
    const proteinTarget = cfg.proteinTarget || 100;

    let total = 0, weight = 0;

    if (st.avgKcal != null) {
      const dev = Math.abs(st.avgKcal - kcalTarget) / kcalTarget;
      /* 10% 以内满分，之后每 1% 扣 4 分 */
      total += Math.max(0, 100 - Math.max(0, dev - 0.1) * 400) * 0.30;
      weight += 0.30;
    }
    if (st.avgProtein != null) {
      total += Math.min(100, (st.avgProtein / proteinTarget) * 100) * 0.25;
      weight += 0.25;
    }
    if (st.proteinPct != null) {
      /* 蛋白供能比 20~35% 是好区间 */
      const p = st.proteinPct;
      const dev = p < 20 ? 20 - p : (p > 35 ? p - 35 : 0);
      total += Math.max(0, 100 - dev * 5) * 0.15;
      weight += 0.15;
    }
    /* 记录坚持度：用「有记录的天数 / 区间天数」。
       减脂期最怕的不是吃多，是没记 —— 没数据就没法纠偏。 */
    total += st.logRate * 100 * 0.30;
    weight += 0.30;

    return weight ? Math.round(total / weight) : null;
  };

  /** 综合健康度 */
  H.healthScore = function (sleepScore, dietScore) {
    const v = [];
    if (sleepScore != null) v.push(sleepScore);
    if (dietScore != null) v.push(dietScore);
    if (!v.length) return null;
    return Math.round(v.reduce((s, x) => s + x, 0) / v.length);
  };

  /** 分数 → 中文档位（给视图层上色用） */
  H.grade = function (score) {
    if (score == null) return { text: '无数据', tone: 'none' };
    if (score >= 85) return { text: '很好', tone: 'great' };
    if (score >= 70) return { text: '不错', tone: 'good' };
    if (score >= 55) return { text: '一般', tone: 'ok' };
    if (score >= 40) return { text: '偏差', tone: 'warn' };
    return { text: '要改', tone: 'bad' };
  };

  /* ───────── 各板块 ───────── */

  /** 账本：收入和支出用同一个窗口（与 S.monthSummary 口径一致） */
  H.moneyOf = function (range) {
    let txns = [];
    try { txns = S.all('txns') || []; } catch (e) { return null; }

    /* 统计窗口：只有「月」粒度沿用错位规则，收入和支出一起走。
       周和年用自然区间 —— 错位是为了兜住「上月最后一天提前到账」，
       在周粒度上会把区间切得很怪，得不偿失。
       （改过：以前支出按自然区间、收入按错位窗口，两边日期范围不一样，
         用户对账时对不上。） */
    let winStart = range.start, winEnd = range.end, shifted = false;
    if (range.unit === 'month' && typeof S.monthWindow === 'function') {
      const w = S.monthWindow(range.key);
      if (w && w.shifted) { winStart = w.start; winEnd = w.end; shifted = true; }
    }
    const win = { start: winStart, end: winEnd };

    const isIncome = t => t.type === 'income';
    const inc = txns.filter(t => inRange(t.date, win) && isIncome(t));
    const exp = txns.filter(t => inRange(t.date, win) && !isIncome(t));

    const stipend = inc.filter(t => {
      try { return typeof S.isStipendAmount === 'function' && S.isStipendAmount(t.amount); }
      catch (e) { return false; }
    });

    const byCat = {};
    exp.forEach(t => {
      const c = t.category || '其他';
      if (!byCat[c]) byCat[c] = { category: c, amount: 0, count: 0 };
      byCat[c].amount += Math.abs(t.amount || 0);
      byCat[c].count++;
    });
    const byCategory = Object.keys(byCat).map(k => byCat[k]).sort((a, b) => b.amount - a.amount);

    /* 常去的店 / 常往来的人 —— 长期看这个比分类更有信息量 */
    const byPerson = {};
    exp.forEach(t => {
      const n = (t.counterparty || '').trim();
      if (!n) return;
      if (!byPerson[n]) byPerson[n] = { name: n, amount: 0, count: 0 };
      byPerson[n].amount += Math.abs(t.amount || 0);
      byPerson[n].count++;
    });
    const topPeople = Object.keys(byPerson).map(k => byPerson[k])
      .sort((a, b) => b.amount - a.amount).slice(0, 5);

    const income = sum(inc.map(t => Math.abs(t.amount || 0)));
    const expense = sum(exp.map(t => Math.abs(t.amount || 0)));
    const stipendTotal = sum(stipend.map(t => Math.abs(t.amount || 0)));

    return {
      income, expense, balance: income - expense,
      stipend: stipendTotal, extra: income - stipendTotal,
      stipendCount: stipend.length, incomeCount: inc.length, expenseCount: exp.length,
      txnCount: inc.length + exp.length,
      byCategory, topPeople,
      incomeWindow: { start: winStart, end: winEnd, shifted },
      window: { start: winStart, end: winEnd, shifted },
      avgPerDay: range.days ? expense / range.days : null,
      /* 记账坚持度：有流水的天数 / 区间天数 */
      logRate: (() => {
        const days = new Set(txns.filter(t => inRange(t.date, range)).map(t => String(t.date).slice(0, 10)));
        return range.days ? days.size / range.days : 0;
      })()
    };
  };

  /** 作息：时长 / 规律性 / 质量 */
  H.sleepOf = function (range) {
    let recs = [];
    try { recs = (S.all('sleep') || []).filter(s => inRange(s.date, range)); }
    catch (e) { return null; }

    const hours = recs.map(s => (typeof s.hours === 'number' && s.hours > 0) ? s.hours : null).filter(x => x != null);
    const bedMins = recs.map(s => bedtimeMinutes(s.bedtime)).filter(x => x != null);
    const quality = recs.map(s => (typeof s.quality === 'number' && s.quality > 0) ? s.quality : null).filter(x => x != null);

    const avgBed = mean(bedMins);
    const st = {
      days: recs.length,
      logRate: range.days ? recs.length / range.days : 0,
      avgHours: round1(mean(hours)),
      minHours: hours.length ? round1(Math.min.apply(null, hours)) : null,
      maxHours: hours.length ? round1(Math.max.apply(null, hours)) : null,
      bedtimeStdMin: bedMins.length > 1 ? Math.round(stdMinutes(bedMins)) : null,
      avgBedtime: formatBedtime(avgBed),
      avgQuality: round1(mean(quality)),
      /* 晚睡次数：入睡时间晚于 00:30 */
      lateNights: bedMins.filter(m => m >= 24 * 60 + 30).length
    };
    st.score = H.sleepScore(st);
    return st;
  };

  /** 饮食：热量 / 三大营养素 / 记录坚持度 */
  H.dietOf = function (range) {
    let meals = [];
    try { meals = (S.all('meals') || []).filter(m => inRange(m.date, range)); }
    catch (e) { return null; }

    /* 逐天汇总，避免「一天记 3 餐」被当成 3 天 */
    const byDate = {};
    meals.forEach(m => {
      const d = String(m.date).slice(0, 10);
      (byDate[d] = byDate[d] || []).push(m);
    });
    const days = Object.keys(byDate);

    let kcal = [], protein = [], fat = [], carb = [], fiber = [];
    let skipped = 0, unlogged = 0;

    /* 每餐的「吃了 / 没吃 / 未记录」状态，来自 store 的权威判断 */
    const TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
    const allDays = H.daysIn(range);
    allDays.forEach(d => {
      let hasAny = false;
      TYPES.forEach(ty => {
        let status = 'none';
        try { status = S.mealStatus(d, ty); } catch (e) {}
        if (status === 'skipped') { skipped++; hasAny = true; }
        else if (status === 'eaten') hasAny = true;
        else unlogged++;
      });
      if (!hasAny) { /* 整天没记，计入 unlogged 已按餐计 */ }
    });

    try {
      const totals = Nutrition.dayTotals(meals);
      totals && null;
    } catch (e) {}

    /* 逐天算营养，再对「有吃的天」取平均 */
    days.forEach(d => {
      let t = null;
      try { t = Nutrition.dayTotals(byDate[d]); } catch (e) { t = null; }
      if (!t) return;
      /* 全天全是「没吃」的日子不参与均值，否则会拉低热量显得像绝食 */
      const eaten = byDate[d].some(m => !m.skipped);
      if (!eaten) return;
      if (t.kcal) kcal.push(t.kcal);
      if (t.p != null) protein.push(t.p);
      if (t.f != null) fat.push(t.f);
      if (t.c != null) carb.push(t.c);
      if (t.fib != null) fiber.push(t.fib);
    });

    const avgKcal = mean(kcal), avgP = mean(protein), avgF = mean(fat), avgC = mean(carb);
    /* 蛋白供能比 = 蛋白克数*4 / 总热量 */
    let proteinPct = null;
    if (avgP != null && avgKcal) proteinPct = Math.round((avgP * 4 / avgKcal) * 100);

    const st = {
      days: days.length,
      loggedDayCount: kcal.length,
      totalDays: range.days,
      logRate: range.days ? kcal.length / range.days : 0,
      avgKcal: avgKcal == null ? null : Math.round(avgKcal),
      avgProtein: round1(avgP),
      avgFat: round1(avgF),
      avgCarb: round1(avgC),
      avgFiber: round1(mean(fiber)),
      proteinPct,
      skipped,
      unlogged,
      mealCount: meals.length
    };
    st.score = H.dietScore(st, H.targets());
    return st;
  };

  /** 从设置里取评分目标（没配就用默认，但标注是默认值） */
  H.targets = function () {
    let s = null;
    try { s = S.settings; } catch (e) {}
    const body = (s && s.body) || {};
    const kcalTarget = Number(body.dailyKcal) > 0 ? Number(body.dailyKcal) : 1800;
    /* 蛋白目标：优先设置里的；没有就按体重 1.6g/kg（减脂期常用），再退回 100g */
    let proteinTarget = Number(body.proteinTarget) > 0 ? Number(body.proteinTarget) : null;
    if (!proteinTarget) {
      const w = Number(body.weight);
      proteinTarget = w > 0 ? Math.round(w * 1.6) : 100;
    }
    return { kcalTarget, proteinTarget };
  };

  /** 体重：区间首末与变化 */
  H.weightOf = function (range) {
    let ws = [];
    try { ws = (S.all('weights') || []).filter(w => inRange(w.date, range) && isFinite(w.kg)); }
    catch (e) { return null; }
    ws.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!ws.length) {
      /* 区间内没称，但之前称过 —— 至少告诉用户当前值 */
      let latest = null;
      try { latest = S.weightLatest(); } catch (e) {}
      return latest ? { count: 0, current: latest.kg, latestDate: latest.date, start: null, end: null, delta: null, min: null, max: null } : null;
    }
    const kgs = ws.map(w => w.kg);
    return {
      count: ws.length,
      start: round1(ws[0].kg),
      end: round1(ws[ws.length - 1].kg),
      delta: round1(ws[ws.length - 1].kg - ws[0].kg),
      min: round1(Math.min.apply(null, kgs)),
      max: round1(Math.max.apply(null, kgs)),
      current: round1(ws[ws.length - 1].kg),
      latestDate: ws[ws.length - 1].date
    };
  };

  /**
   * 任务：按用户要求，回顾页的日程部分**只看长期任务**。
   * （有截止日的任务过期就过期了，回头看意义不大；
   *   长期任务的推进才是真正需要长期跟踪的。）
   */
  H.longtermOf = function (range) {
    let tasks = [];
    try { tasks = (S.all('tasks') || []).filter(t => t.kind === 'longterm'); }
    catch (e) { return null; }

    const dayOf = t => String(t.doneAt || '').slice(0, 10);

    const existed = tasks.filter(t => {
      const c = String(t.createdAt || '').slice(0, 10);
      return !c || c <= range.end;
    });
    const added = tasks.filter(t => inRange(String(t.createdAt || '').slice(0, 10), range));
    const completed = tasks.filter(t => t.done && inRange(dayOf(t), range));
    const active = existed.filter(t => !t.done);

    const byCat = {};
    existed.forEach(t => {
      const c = t.cat || 'life';
      if (!byCat[c]) byCat[c] = { cat: c, total: 0, done: 0, active: 0 };
      byCat[c].total++;
      if (t.done) byCat[c].done++; else byCat[c].active++;
    });

    return {
      existedCount: existed.length,
      added: added.length,
      completed: completed.length,
      active: active.length,
      byCategory: Object.keys(byCat).map(k => byCat[k]),
      /* 做得最久的几个：一直挂着没动的，值得单独提醒 */
      stale: active
        .filter(t => {
          const c = String(t.createdAt || '').slice(0, 10);
          return c && U.diffDays(c, range.end) >= 30;
        })
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(0, 5)
        .map(t => ({
          id: t.id, title: t.title, cat: t.cat,
          ageDays: U.diffDays(String(t.createdAt).slice(0, 10), range.end),
          priority: t.priority
        })),
      completedList: completed.slice(0, 8).map(t => ({ id: t.id, title: t.title, cat: t.cat, date: dayOf(t) }))
    };
  };

  /** 任务总览（含 deadline / daily），用来给「这个时期做了多少事」一个数 */
  H.tasksOf = function (range) {
    let tasks = [];
    try { tasks = S.all('tasks') || []; } catch (e) { return null; }
    const created = tasks.filter(t => inRange(String(t.createdAt || '').slice(0, 10), range));
    const completed = tasks.filter(t => t.done && inRange(String(t.doneAt || '').slice(0, 10), range));
    const due = tasks.filter(t => t.due && inRange(t.due, range));
    const overdue = tasks.filter(t => t.due && t.due < range.end && !t.done && t.kind === 'deadline');
    return {
      created: created.length,
      completed: completed.length,
      due: due.length,
      overdue: overdue.length
    };
  };

  /** 学习/复习：间隔复习的完成情况 */
  H.reviewsOf = function (range) {
    let revs = [];
    try { revs = S.all('reviews') || []; } catch (e) { return null; }
    const due = revs.filter(r => inRange(r.due, range));
    const done = revs.filter(r => r.lastDone && inRange(String(r.lastDone).slice(0, 10), range));
    if (!due.length && !done.length) return null;
    return { due: due.length, done: done.length };
  };

  /**
   * 汇总一个区间
   * @param {'week'|'month'|'year'} unit
   * @param {Date|string} anchor
   */
  H.summarize = function (unit, anchor) {
    const range = H.range(unit, anchor);
    const sleep = H.sleepOf(range);
    const diet = H.dietOf(range);
    const out = {
      range,
      money: H.moneyOf(range),
      sleep,
      diet,
      weight: H.weightOf(range),
      longterm: H.longtermOf(range),
      tasks: H.tasksOf(range),
      reviews: H.reviewsOf(range),
      targets: H.targets()
    };
    out.healthScore = H.healthScore(sleep && sleep.score, diet && diet.score);
    /* 数据完整度：作息和饮食记录天数的覆盖率。低完整度时分数的可信度也低。 */
    const rates = [sleep && sleep.logRate, diet && diet.logRate].filter(x => typeof x === 'number');
    out.coverage = rates.length ? Math.round(rates.reduce((s, x) => s + x, 0) / rates.length * 100) : 0;

    /* 单位换算成中文，视图直接显示 */
    out.unitName = UNIT_NAMES[range.unit] || range.unit;
    return out;
  };

  /* ───────── 跨区间对比（趋势） ───────── */

  /**
   * 取最近 n 个区间的关键指标，用来画趋势 / 和上期比
   * @returns {Array<{range, expense, income, balance, healthScore, sleepScore, dietScore, weightEnd, kcalAvg}>}
   */
  H.series = function (unit, anchor, n) {
    n = n || 6;
    const out = [];
    let a = anchor;
    for (let i = 0; i < n; i++) {
      const s = H.summarize(unit, a);
      out.unshift({
        key: s.range.key,
        label: s.range.label,
        short: s.range.unit === 'year' ? s.range.key
          : (s.range.unit === 'month' ? (Number(s.range.key.slice(5)) + '月')
            : (Number(s.range.start.slice(5, 7)) + '/' + Number(s.range.start.slice(8, 10)))),
        expense: s.money ? s.money.expense : null,
        income: s.money ? s.money.income : null,
        balance: s.money ? s.money.balance : null,
        healthScore: s.healthScore,
        sleepScore: s.sleep ? s.sleep.score : null,
        dietScore: s.diet ? s.diet.score : null,
        avgHours: s.sleep ? s.sleep.avgHours : null,
        avgKcal: s.diet ? s.diet.avgKcal : null,
        weightEnd: s.weight ? s.weight.end : null
      });
      a = H.shift(unit, a, -1);
    }
    return out;
  };

  /** 和上一个同粒度区间比，返回各指标的差值 */
  H.compare = function (unit, anchor) {
    const cur = H.summarize(unit, anchor);
    const prev = H.summarize(unit, H.shift(unit, anchor, -1));
    const d = (a, b) => (a == null || b == null) ? null : Math.round((a - b) * 10) / 10;
    return {
      cur, prev,
      delta: {
        expense: d(cur.money && cur.money.expense, prev.money && prev.money.expense),
        income: d(cur.money && cur.money.income, prev.money && prev.money.income),
        balance: d(cur.money && cur.money.balance, prev.money && prev.money.balance),
        healthScore: d(cur.healthScore, prev.healthScore),
        sleepScore: d(cur.sleep && cur.sleep.score, prev.sleep && prev.sleep.score),
        dietScore: d(cur.diet && cur.diet.score, prev.diet && prev.diet.score),
        avgHours: d(cur.sleep && cur.sleep.avgHours, prev.sleep && prev.sleep.avgHours),
        avgKcal: d(cur.diet && cur.diet.avgKcal, prev.diet && prev.diet.avgKcal),
        weight: d(cur.weight && cur.weight.end, prev.weight && prev.weight.end)
      }
    };
  };

  global.History = H;
})(window);