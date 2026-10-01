/* ═══════════════════════════════════════════════
   store.js — 数据层（localStorage 持久化 + 发布订阅）
   所有数据留在手机本地，不上传任何服务器。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const KEY = 'lifehub.v1';

  /* ───────── 分类定义 ───────── */
  const CATS = {
    study: { id: 'study', name: '一般通用学习', short: '通用学习', color: 'var(--c-study)', hex: '#3b6ef6', desc: '学校课程 / 作业 / 考试' },
    cv:    { id: 'cv',    name: '计算机视觉 · 具身智能', short: 'CV·具身', color: 'var(--c-cv)', hex: '#8b5cf6', desc: '对齐 Obsidian 蓝图的学习路线' },
    life:  { id: 'life',  name: '其他日常', short: '日常', color: 'var(--c-life)', hex: '#0d9488', desc: '生活琐事 / 杂项' }
  };

  const PRIORITY = {
    3: { id: 3, name: '紧急', color: 'var(--danger)' },
    2: { id: 2, name: '重要', color: 'var(--warn)' },
    1: { id: 1, name: '普通', color: 'var(--text-dim)' },
    0: { id: 0, name: '随意', color: 'var(--text-faint)' }
  };

  /* ───────── 任务类型（决定怎么提醒） ─────────
     这是提醒策略的核心。三种类型走三条完全不同的路：

       deadline  有确切截止日的任务
                 → 只在「截止前一天晚上 18:00」提醒一次
                 → 会排期、会出现在日历里

       daily     用户手动标记为「日常活动」的
                 → 每天 18:00 提醒（用来打卡/坚持）
                 → 不排具体时段

       longterm  既没截止日、也没安排时间的
                 → 不提醒、不排期
                 → 一直待在「长期待办」栏，用户自己调优先级

     判断顺序（kindOf）：先看用户有没有手动指定 kind，
     没指定再按字段推断 —— 有 due 就是 deadline，否则 longterm。 */
  const KINDS = {
    deadline: { id: 'deadline', name: '有截止', short: '截止', desc: '截止前一天晚 6 点提醒' },
    daily:    { id: 'daily',    name: '日常活动', short: '日常', desc: '每天晚 6 点提醒' },
    longterm: { id: 'longterm', name: '长期任务', short: '长期', desc: '不排期，放在长期栏' }
  };

  /** 判断一个任务属于哪一类 */
  function kindOf(t) {
    if (!t) return 'longterm';
    if (t.kind && KINDS[t.kind]) return t.kind;
    /* 没手动指定时的推断 */
    if (t.repeat === 'daily') return 'daily';       // 兼容老的每日重复
    if (t.due && String(t.due).trim()) return 'deadline';
    return 'longterm';
  }

  /* ───────── 默认设置 ───────── */
  function defaultSettings() {
    return {
      /* 身份 / 目标 */
      nickname: '',
      /* 减脂（用户选择先留空，自行设置） */
      body: {
        height: null, weight: null, targetWeight: null,
        dailyKcal: null, proteinTarget: null,
        sleepTarget: 7.5, wakeTarget: '07:00',
        enabled: false
      },
      /* 财务 */
      money: {
        monthlyIncome: null,
        monthlyBudget: null,
        currency: 'CNY',
        savingGoal: null
      },
      /* 课程表：只作为「排期约束」使用（知道何时有课，避免把任务排到课上），
         不是要显示的日程内容。见 DEVLOG.md 第一节。 */
      timetable: {
        termStart: null,      // 第一周周一 YYYY-MM-DD
        weeks: 16,
        courses: [],          // {name, weekday, start:{h,m}, end:{h,m}, weeks:[], location}
        importedAt: null,
        source: ''            // 'ocr' | 'manual' | 'text'
      },
      /* AI */
      ai: {
        enabled: false,
        provider: 'dashscope',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: '',
        model: 'qwen-plus',
        visionModel: 'qwen-vl-max',   // 识别课表图片用，必须是能读图的模型
        temperature: 0.6,
        autoReviewTime: '07:00'
      },

      /* ───── 代填配置（占位值，等用户后续手动替换） ─────
         用途：有些配置项（API Key、体重、收入…）用户一时拿不到或还没想好，
         但整个 App 又需要有个值才能正常演示/使用。
         做法：把「代填」的值集中放在这里，界面上会显示成醒目的
         「待确认」样式，设置页顶部也会汇总提示还有几项没填。
         用户填了真值后，对应项自动从清单里消失。 */
      pending: {
        apiKey: 'sk-替换成你的百炼APIKey',   // 代填，需替换
        weight: null,
        dailyKcal: null,
        monthlyIncome: null
      },

      /* 提醒 */
      remind: {
        eveningHour: 18,        // 晚 6 点检查未完成
        eveningMinute: 0,
        deadlineLeadDays: 1,    // 截止前一天提醒
        lookaheadDays: 30,      // 导出日历覆盖未来天数
        enabled: true
      },
      ui: { theme: 'auto' }
    };
  }

  function defaultDB() {
    return {
      version: 1,
      tasks: [],        // 任务 / 日程 / 待办
      reviews: [],      // 间隔复习条目
      meals: [],        // 饮食记录
      sleep: [],        // 作息记录
      weights: [],      // 体重记录
      txns: [],         // 账本流水
      txnRules: [],     // 账本分类规则
      aiLogs: [],       // AI 评价历史
      settings: defaultSettings(),
      meta: { created: new Date().toISOString(), lastImport: null }
    };
  }

  /* ───────── 持久化 ───────── */
  let db = null;
  let inited = false;      // 见 S.init()：保证重复调用安全
  let saveTimer = null;
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 浅合并默认值，保证升级后新字段存在
        const base = defaultDB();
        db = Object.assign(base, parsed);
        db.settings = deepMerge(defaultSettings(), parsed.settings || {});
        ['tasks', 'reviews', 'meals', 'sleep', 'weights', 'txns', 'txnRules', 'aiLogs'].forEach(k => {
          if (!Array.isArray(db[k])) db[k] = [];
        });
      } else {
        db = defaultDB();
      }
    } catch (e) {
      console.error('[store] 读取失败，重置', e);
      db = defaultDB();
    }
    return db;
  }

  function deepMerge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k in over) {
      const v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
        out[k] = deepMerge(base[k], v);
      } else if (v !== undefined) out[k] = v;
    }
    return out;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      console.error('[store] 保存失败', e);
      U.toast('存储空间不足，保存失败', 'err');
    }
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { persist(); emit(); }, 60);
  }

  function saveNow() { clearTimeout(saveTimer); persist(); emit(); }

  function emit() { listeners.forEach(fn => { try { fn(db); } catch (e) { console.error(e); } }); }

  /* ───────── 公开 API ───────── */
  const S = {
    CATS, PRIORITY, KINDS, kindOf, defaultSettings,

    /**
     * 初始化。幂等：重复调用不会丢掉内存里已有的改动。
     * 这样 App.start() 被调用两次（DOMContentLoaded + 显式调用）也安全。
     * @param {boolean} force 强制从存储重新载入
     */
    init(force) {
      if (!inited || force) { load(); inited = true; }
      return db;
    },
    get db() { return db; },
    get settings() { return db.settings; },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    save, saveNow, emit,

    /* 通用集合操作 */
    all(coll) { return db[coll] || []; },
    find(coll, id) { return (db[coll] || []).find(x => x.id === id); },

    add(coll, item) {
      if (!item.id) item.id = U.uid(coll.slice(0, 2) + '_');
      item.createdAt = item.createdAt || new Date().toISOString();
      db[coll].unshift(item);
      save();
      return item;
    },

    update(coll, id, patch) {
      const it = S.find(coll, id);
      if (!it) return null;
      Object.assign(it, patch, { updatedAt: new Date().toISOString() });
      save();
      return it;
    },

    remove(coll, id) {
      /* 删父任务时把子任务一并删掉，避免留下孤儿。
         注意必须先删子任务再定位父任务下标，否则下标会因数组变动而失效。 */
      if (coll === 'tasks') {
        db.tasks = db.tasks.filter(t => t.parentId !== id);
      }
      const i = (db[coll] || []).findIndex(x => x.id === id);
      if (i < 0) { save(); return false; }
      db[coll].splice(i, 1);
      save();
      return true;
    },

    bulkAdd(coll, items) {
      items.forEach(it => {
        if (!it.id) it.id = U.uid(coll.slice(0, 2) + '_');
        it.createdAt = it.createdAt || new Date().toISOString();
        db[coll].push(it);
      });
      save();
      return items.length;
    },

    /* ───── 任务查询 ───── */

    /** 某天的任务：到期日=该天，或跨该天（有 start/end），或每日重复 */
    tasksOn(dateStr) {
      return db.tasks.filter(t => {
        if (t.repeat === 'daily') return true;
        const s = t.start || t.due, e = t.end || t.due;
        if (!s) return false;
        if (s && e && s !== e) return dateStr >= s.slice(0, 10) && dateStr <= e.slice(0, 10);
        return (t.due || t.start || '').slice(0, 10) === dateStr;
      }).sort(cmpTask);
    },

    /** 今日任务 */
    todayTasks() { return S.tasksOn(U.ymd(U.today())); },

    /* ───── 父子任务 ───── */

    /** 取某任务的子任务 */
    children(id) {
      return db.tasks.filter(t => t.parentId === id).sort(cmpTask);
    },

    /** 取某任务的父任务 */
    parent(task) {
      return task && task.parentId ? S.find('tasks', task.parentId) : null;
    },

    /** 是不是父任务（有子任务） */
    isParent(id) { return db.tasks.some(t => t.parentId === id); },

    /**
     * 父任务进度：完成度由子任务决定
     * @returns {{done:number,total:number,pct:number}}
     */
    progress(id) {
      const kids = S.children(id);
      if (!kids.length) {
        const t = S.find('tasks', id);
        return { done: t && t.done ? 1 : 0, total: 1, pct: t && t.done ? 100 : 0 };
      }
      const done = kids.filter(k => k.done).length;
      return { done, total: kids.length, pct: Math.round(done / kids.length * 100) };
    },

    /**
     * 勾选/取消勾选，自动处理父子联动：
     * - 勾选子任务后，若所有子任务都完成 → 父任务自动完成
     * - 取消任一子任务 → 父任务自动变回未完成
     */
    toggleDone(id, done) {
      const t = S.find('tasks', id);
      if (!t) return null;
      t.done = done === undefined ? !t.done : !!done;
      t.doneAt = t.done ? new Date().toISOString() : null;

      /* 勾选父任务 → 所有子任务跟着完成；反之同理 */
      const kids = S.children(id);
      if (kids.length) {
        kids.forEach(k => {
          k.done = t.done;
          k.doneAt = t.done ? new Date().toISOString() : null;
        });
      }
      /* 向上同步父任务 */
      if (t.parentId) {
        const sibs = S.children(t.parentId);
        const allDone = sibs.length && sibs.every(k => k.done);
        const p = S.find('tasks', t.parentId);
        if (p) {
          p.done = !!allDone;
          p.doneAt = allDone ? new Date().toISOString() : null;
        }
      }
      save();
      return t;
    },

    /** 只取顶层任务（没有 parentId 的），用于列表渲染 */
    topLevel() { return db.tasks.filter(t => !t.parentId); },

    /* ───── 按任务类型查询（配合提醒策略） ───── */

    /** 长期任务：没截止、没时间、没完成 —— 待在长期栏里 */
    longTerm() {
      return db.tasks
        .filter(t => !t.done && !t.parentId && kindOf(t) === 'longterm')
        .sort((a, b) => {
          /* 排序规则：手动顺序优先，其次优先级，最后创建时间。
             为什么手动顺序优先：用户可以拖动或用 ↑↓ 调整，
             如果优先级永远压过手动顺序，拖动就永远没效果——
             那样用户会觉得「拖了没用」。想按优先级排的话有
             「按优先级重排」按钮，会把 order 整体刷成优先级顺序。 */
          const oa = a.order == null ? 9999 : a.order;
          const ob = b.order == null ? 9999 : b.order;
          if (oa !== ob) return oa - ob;
          const pa = a.priority || 0, pb = b.priority || 0;
          if (pa !== pb) return pb - pa;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
    },

    /** 日常活动：每天要做的（用来打卡） */
    dailyTasks() {
      return db.tasks.filter(t => !t.done && kindOf(t) === 'daily').sort(cmpTask);
    },

    /** 有截止日的未完成任务（用于截止提醒） */
    deadlineTasks() {
      return db.tasks.filter(t => !t.done && kindOf(t) === 'deadline');
    },

    /** 调整长期任务的手动排序（↑↓ 按钮用）
     *
     * 先把整个列表的 order 刷成当前显示顺序（这样第一次拖动时，
     * 那些 order 还是 null 的任务会得到确定的序号），再交换相邻两项。
     */
    moveLongTerm(id, delta) {
      const list = S.longTerm();                 // 已按当前显示顺序排好
      const i = list.findIndex(t => t.id === id);
      if (i < 0) return false;
      const j = i + delta;
      if (j < 0 || j >= list.length) return false;

      /* 固化当前顺序 */
      list.forEach((t, idx) => { t.order = idx; });
      /* 交换 */
      const tmp = list[i].order;
      list[i].order = list[j].order;
      list[j].order = tmp;

      S.save();
      return true;
    },

    /** 未完成 + 有截止日的任务（用于提醒） */
    pendingWithDue() {
      return db.tasks.filter(t => !t.done && t.due && !t.repeat);
    },

    /** 未来 N 天内截止的未完成任务 */
    upcoming(days = 7) {
      const today = U.ymd(U.today());
      const limit = U.ymd(U.addDays(U.today(), days));
      return db.tasks.filter(t => !t.done && t.due && t.due.slice(0, 10) >= today && t.due.slice(0, 10) <= limit)
        .sort(cmpTask);
    },

    /** 逾期任务 */
    overdue() {
      const today = U.ymd(U.today());
      return db.tasks.filter(t => !t.done && t.due && t.due.slice(0, 10) < today)
        .sort((a, b) => a.due.localeCompare(b.due));
    },

    byCategory(cat) { return db.tasks.filter(t => t.cat === cat); },

    /** 分类完成率统计 */
    catStats(fromStr, toStr) {
      const out = {};
      Object.keys(CATS).forEach(c => out[c] = { total: 0, done: 0 });
      db.tasks.forEach(t => {
        const d = (t.due || t.start || '').slice(0, 10);
        if (!d) return;
        if (fromStr && d < fromStr) return;
        if (toStr && d > toStr) return;
        const c = CATS[t.cat] ? t.cat : 'life';
        out[c].total++;
        if (t.done) out[c].done++;
      });
      return out;
    },

    /* ───── 学习复习 ───── */
    dueReviews(dateStr) {
      const d = dateStr || U.ymd(U.today());
      return db.reviews.filter(r => !r.retired && r.nextDate && r.nextDate <= d)
        .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    },

    /* ───── 饮食 ───── */
    mealsOn(dateStr) { return db.meals.filter(m => m.date === dateStr); },
    sleepOn(dateStr) { return db.sleep.find(s => s.date === dateStr) || null; },
    weightLatest() { return db.weights.length ? db.weights[db.weights.length - 1] : null; },

    /* ───── 账本 ───── */
    txnsInMonth(ym) { return db.txns.filter(t => (t.date || '').slice(0, 7) === ym); },

    monthSummary(ym) {
      const list = S.txnsInMonth(ym);
      const income = U.sum(list.filter(t => t.type === 'income'), t => t.amount);
      const expense = U.sum(list.filter(t => t.type === 'expense'), t => t.amount);
      const income2 = S.settings.money.monthlyIncome;
      const base = (income2 != null && income2 !== '') ? Number(income2) : income;
      return {
        income: base, realIncome: income, expense,
        balance: base - expense,
        count: list.length,
        savingGoal: S.settings.money.savingGoal
      };
    },

    /** 学习板块进度（由 blueprint.js 注入结构） */
    learnProgress: {},

    /* ───── 导入 / 导出 ───── */
    exportAll() { return JSON.parse(JSON.stringify(db)); },

    importAll(obj, mode = 'merge') {
      if (!obj || typeof obj !== 'object') throw new Error('数据格式不正确');
      if (mode === 'replace') {
        db = deepMerge(defaultDB(), obj);
        saveNow();
        return { mode: 'replace' };
      }
      const counts = {};
      ['tasks', 'reviews', 'meals', 'sleep', 'weights', 'txns', 'txnRules'].forEach(coll => {
        if (!Array.isArray(obj[coll])) return;
        const seen = new Set(db[coll].map(x => x.id));
        let n = 0;
        obj[coll].forEach(it => {
          if (!it.id) it.id = U.uid(coll.slice(0, 2) + '_');
          if (seen.has(it.id)) return;
          db[coll].push(it); seen.add(it.id); n++;
        });
        counts[coll] = n;
      });
      if (obj.settings) db.settings = deepMerge(db.settings, obj.settings);
      saveNow();
      return { mode: 'merge', counts };
    },

    reset() { db = defaultDB(); saveNow(); },

    stats() {
      return {
        tasks: db.tasks.length, open: db.tasks.filter(t => !t.done).length,
        reviews: db.reviews.length, meals: db.meals.length,
        txns: db.txns.length, bytes: (localStorage.getItem(KEY) || '').length
      };
    }
  };

  function cmpTask(a, b) {
    // 未完成在前 → 时间早的在前 → 优先级高的在前
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    const ta = (a.start || a.due || '') , tb = (b.start || b.due || '');
    if (ta !== tb) return ta.localeCompare(tb);
    return (b.priority || 0) - (a.priority || 0);
  }

  S.cmpTask = cmpTask;

  /* ═══════════ 待填配置清单 ═══════════
     集中列出「哪些配置还是代填的、需要用户手动替换」。
     设置页顶部据此显示提示，填完后对应项自动消失。

     判定规则：代填值放在 settings.pending 里；
     真实值一旦填进 settings.<模块>，该项就算完成。 */
  S.PENDING_ITEMS = [
    {
      key: 'apiKey',
      label: 'AI API Key',
      where: '设置 → AI 助手 → API Key',
      hint: '填了才能用 AI 评价饮食、识别课表图片',
      done: () => {
        const k = String((S.settings.ai || {}).apiKey || '').trim();
        /* 空、或者还是那句占位文案，都算没填 */
        return k.length > 10 && !/替换/.test(k);
      },
      fill: () => { S.settings.ai.apiKey = ''; }
    },
    {
      key: 'weight',
      label: '当前体重',
      where: '设置 → 身体与减脂目标',
      hint: '填了才能算减脂进度',
      done: () => S.settings.body.weight != null,
      fill: () => { S.settings.body.weight = S.settings.pending.weight; }
    },
    {
      key: 'dailyKcal',
      label: '每日热量目标',
      where: '设置 → 身体与减脂目标',
      hint: '填了 AI 才能判断你今天吃多了还是少了',
      done: () => S.settings.body.dailyKcal != null,
      fill: () => { S.settings.body.dailyKcal = S.settings.pending.dailyKcal; }
    },
    {
      key: 'monthlyIncome',
      label: '每月收入',
      where: '设置 → 财务',
      hint: '填了才能算每月能攒多少',
      done: () => S.settings.money.monthlyIncome != null,
      fill: () => { S.settings.money.monthlyIncome = S.settings.pending.monthlyIncome; }
    }
  ];

  /** 返回还没填的项 */
  S.pendingList = function () {
    return S.PENDING_ITEMS.filter(it => {
      try { return !it.done(); } catch (e) { return false; }
    });
  };

  /** 把一个代填值正式写入配置（用户点「使用代填值」时调用） */
  S.applyPending = function (key) {
    const it = S.PENDING_ITEMS.find(x => x.key === key);
    if (!it) return false;
    it.fill();
    save();
    return true;
  };

  global.S = S;
})(window);