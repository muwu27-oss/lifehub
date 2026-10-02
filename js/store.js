/* ═══════════════════════════════════════════════
   store.js — 数据层（localStorage 持久化 + 发布订阅）
   所有数据留在手机本地，不上传任何服务器。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const KEY = 'lifehub.v1';

  /* ⚠️ 所有集合**只在这里定义一次**。
     以前 load() 里写了一份（10 个）、importAll() 里又写了一份（7 个），
     两份清单慢慢就对不上了 —— 结果换设备导入备份时，
     customFoods / imports / aiLogs 三条**静默丢失**：
     自己存的食物没了，「导入记录」没了（于是撤销导入也没了）。
     以后加集合只改这一处，别再抄第二份。 */
  const COLLECTIONS = [
    'tasks', 'reviews', 'meals', 'sleep', 'weights',
    'txns', 'txnRules', 'customFoods', 'imports', 'aiLogs',
    /* 日记模块：内容和上面这些一样，**只在本地加密存储**。
       照样登记在这里，是为了让「换设备」这条路自动带上它们 ——
       备份走的是通用机制，不为日记单独开一条路，
       否则就会重演「两份清单各自演化、悄悄丢数据」。 */
    'diaryEntries', 'diaryChats', 'diaryDigests'
  ];

  /* 日记的三个集合单独列一份，给 importAll 做「密码冲突」判断用。
     用 COLLECTIONS 过滤也能得到，但显式写出来读起来更清楚。 */
  const DIARY_COLLS = ['diaryEntries', 'diaryChats', 'diaryDigests'];

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
        savingGoal: null,

        /* 固定生活费：每月定额打过来的那笔钱。
           用户的情况是每月 1500、分两次各 750 到账，
           所以「金额≈750 的收入」要认出来单独统计，
           不能跟兼职/红包之类的额外收入混在一起。
           见 DEVLOG.md：750 是这个用户的敏感数字。 */
        stipendAmount: 750,        // 单笔固定生活费金额
        stipendTolerance: 0.5,     // 容差（元）：防浮点/手续费误差。0.5 能兜住 749.5/750.5，又不会把 749/751 误吞
        stipendTwice: true,        // 是否分两次到账（影响「收齐了吗」的提示）

        /* 收入窗口错位：生活费常在上月底提前到账，
           所以「10 月的收入」= 9/30 ~ 10/30，而不是 10/1 ~ 10/31。
           支出仍按自然月。 */
        incomeWindowShift: true
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
      /* ───── 日记模块 ─────
         加密参数必须放在 settings 里，**不能另起一个顶层对象**。
         原因：importAll() 会合并 settings 和 COLLECTIONS 里的数组，
         但不会搬运别的顶层字段。盐如果不在备份里带走，
         换设备后密文还在、密钥参数没了 —— 那些日记将**永远解不开**，
         这比直接丢掉还糟，因为文件看着是完整的。 */
      diary: {
        enabled: false,        // 设过密码没有
        salt: '',              // base64，16 字节随机盐（每个日记库一份）
        verifier: null,        // {iv, ct}：拿它验证密码对不对
        iterations: 200000,    // PBKDF2 迭代次数
        createdAt: null,
        /* 离开日记后自动锁定（分钟）。0 = 不自动锁 */
        autoLockMinutes: 5,
        /* 让 AI 评价时参考客观数据。日记本身是主观的，
           配上作息/饮食/任务/账目，AI 才看得出「你自己没意识到的事」。 */
        useContext: true,
        useContextParts: { sleep: true, meals: true, tasks: true, money: true, weight: true }
      },

      /* 日记的 AI 独立配置 —— 用户明确要求「这个版块的 api 需要重新单独配置」。
         为什么值得单独配：外层那个 Key 是给「识别课表 / 查食物热量」这类
         事务性任务用的，用便宜快的模型就够；
         日记里的谈话是长文本、要共情、要记得住上下文，
         值得单独换一个更强的模型，也更方便你单独控制这块花多少钱。 */
      diaryAi: {
        enabled: false,
        provider: 'dashscope',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: '',
        model: 'qwen3.8-max',
        temperature: 0.85,     // 聊天要有点人味，比外层的事务性 0.6 高
        maxTokens: 2000
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
      customFoods: [],  // AI 查过/识别过的食物（补内置库的不足）
      imports: [],      // 每次账单导入的留痕：什么时候、走哪条路、导了哪些日期
      aiLogs: [],       // AI 评价历史
      /* ── 日记模块：存的全是密文 ──
         {id, date, iv, ct, createdAt, updatedAt}
         date 是明文（要按日期取区间，不解密就得能筛），
         心情、正文、谈话、小结全在 ct 里。 */
      diaryEntries: [],
      diaryChats: [],   // {id, gran, key, iv, ct, ...} 一次「谈话」
      diaryDigests: [], // {id, gran, key, iv, ct, ...} 一次「小结」
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
        COLLECTIONS.forEach(k => {
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
      /* 未注册的集合直接抛清楚的话。
         踩过的坑：db[coll] 是 undefined 时 unshift 抛 TypeError，
         被上层 try/catch 吞掉，表现成「数据莫名没存进去」。 */
      if (!Array.isArray(db[coll])) {
        throw new Error('未知集合「' + coll + '」，先在 defaultDB() 里注册');
      }
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

    /* ───── 账单导入留痕 ─────
       为什么记这个：截图导入是「一屏一屏」导的，过几天再截，
       很容易忘记上次截到哪儿，结果要么漏一段、要么重复截。
       所以每导一次都记一笔：什么时候、走哪条路、覆盖了哪段日期。 */

    /** 记一次导入。txns 是这次真正入库的记录 */
    recordImport(info) {
      const list = (info && info.txns) || [];
      const dates = list.map(t => String(t.date || '').slice(0, 10)).filter(Boolean).sort();
      const rec = {
        id: U.uid('im_'),
        at: new Date().toISOString(),          // 导入时刻，精确到秒（显示取到小时）
        via: (info && info.via) || '未知方式',
        count: list.length,
        /* 这批入库记录的 id。留着是为了「撤销这次导入」——
           识别错了要一笔一笔删太痛苦，整批回滚才是正解。 */
        ids: list.map(t => t.id).filter(Boolean),
        images: (info && info.images) || 0,     // 截图识别用了几张
        expense: U.round(list.filter(t => t.type === 'expense')
          .reduce((a, t) => a + t.amount, 0), 2),
        income: U.round(list.filter(t => t.type === 'income')
          .reduce((a, t) => a + t.amount, 0), 2),
        from: dates[0] || null,                 // 这批流水里最早 / 最晚的日期
        to: dates[dates.length - 1] || null,
        createdAt: new Date().toISOString()
      };
      if (!db.imports) db.imports = [];
      db.imports.push(rec);
      /* 只留最近 50 次，免得一年后拖慢加载 */
      if (db.imports.length > 50) db.imports = db.imports.slice(-50);
      db.meta.lastImport = rec.at;
      save();
      return rec;
    },

    /** 最近的导入记录，新的在前 */
    importLogs(limit) {
      const l = (db.imports || []).slice().reverse();
      return limit ? l.slice(0, limit) : l;
    },

    lastImport() {
      const l = db.imports || [];
      return l.length ? l[l.length - 1] : null;
    },

    /** 批量删除。返回真正删掉的条数。
     *  一次 save()，避免循环调 remove() 触发 N 次落盘 + N 次刷新。 */
    removeMany(coll, ids) {
      if (!Array.isArray(db[coll]) || !ids || !ids.length) return 0;
      const set = {};
      ids.forEach(id => { if (id) set[id] = true; });
      const before = db[coll].length;
      db[coll] = db[coll].filter(x => !set[x.id]);
      const n = before - db[coll].length;
      if (n) save();
      return n;
    },

    /** 这次导入到底对应哪几笔。
     *  新留痕直接有 ids。
     *  老留痕（记 ids 这个功能上线之前导的）没有 —— 用户手机上就有这种，
     *  不兜住的话「撤销」按钮根本不出现，等于白做。
     *  反推依据三条一起卡，缺一不可：
     *    ① 这批流水是 bulkAdd 在同一瞬间写进去的（createdAt ≈ 留痕的 at）
     *    ② 日期落在这次导入的 from~to 区间里
     *    ③ source 是账单导入来的（不是 manual）
     *  只卡 ①② 不够 —— 用户刚导完立刻手记一笔，那笔也会被卷进去。
     *  宁可少认几笔（撤销按钮数字变小），也不能多删用户的账。 */
    importIds(rec) {
      if (!rec) return [];
      if (rec.ids && rec.ids.length) return rec.ids.slice();
      if (!rec.at) return [];
      const t0 = new Date(rec.at).getTime();
      if (!isFinite(t0)) return [];
      const from = rec.from || '', to = rec.to || '';
      const WIN = 30 * 1000;          // 30 秒内创建的才算同一次
      const IMPORTED = { wechat: 1, 'bill-photo': 1, 'bill-text': 1, ai: 1, bill: 1 };
      return (db.txns || []).filter(t => {
        if (!IMPORTED[t.source]) return false;          // ③ 手记的不认
        if (!t.createdAt) return false;
        const tc = new Date(t.createdAt).getTime();
        if (!isFinite(tc) || Math.abs(tc - t0) > WIN) return false;   // ①
        const d = (t.date || '').slice(0, 10);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;                 // ②
        return true;
      }).map(t => t.id);
    },

    /** 这次导入现在还能撤销吗（还有多少笔在库里）。
     *  用户可能已经手动删过几笔，所以按「实际还在的数量」算。 */
    importAlive(rec) {
      const ids = S.importIds(rec);
      if (!ids.length) return 0;
      const set = {};
      ids.forEach(id => { set[id] = true; });
      return (db.txns || []).filter(t => set[t.id]).length;
    },

    /** 撤销某一次导入：把这批流水整批删掉，并移除这条留痕。
     *  返回真正删掉的笔数（可能少于当初导入的，因为中间手动删过）。 */
    undoImport(recId) {
      const rec = (db.imports || []).find(r => r.id === recId);
      if (!rec) return 0;
      const n = S.removeMany('txns', S.importIds(rec));
      db.imports = (db.imports || []).filter(r => r.id !== recId);
      save();
      return n;
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

    /** 标记某一餐「没吃」。
     *  为什么需要：以前「没吃早饭」和「忘了记早饭」在数据里长得一样，
     *  都是没有记录，AI 只能猜。但这两件事结论完全相反——
     *  真没吃要提醒补蛋白、别拖到中午暴食；忘了记只是数据缺失。
     *  存成 { date, type, skipped: true, items: [] }，跟「没记录」区分开。 */
    setMealSkipped(dateStr, type, skipped) {
      const ex = db.meals.find(m => m.date === dateStr && m.type === type && m.skipped);
      if (skipped) {
        if (!ex) db.meals.push({ id: U.uid('me_'), date: dateStr, type, skipped: true, items: [], time: '' });
      } else if (ex) {
        db.meals = db.meals.filter(m => m !== ex);
      }
      save();
      return true;
    },

    /** 这一餐的状态：'eaten' 有记录 | 'skipped' 明确没吃 | 'none' 没记录 */
    mealStatus(dateStr, type) {
      const list = db.meals.filter(m => m.date === dateStr && m.type === type);
      if (list.some(m => m.skipped)) return 'skipped';
      if (list.length) return 'eaten';
      return 'none';
    },

    sleepOn(dateStr) { return db.sleep.find(s => s.date === dateStr) || null; },
    weightLatest() { return db.weights.length ? db.weights[db.weights.length - 1] : null; },

    /* ───── 账本 ───── */
    /** 某个月的流水。**按统计窗口取，不是自然月前缀。**
     *  窗口见 S.monthWindow()：默认 上月最后一天 ~ 本月倒数第二天。
     *  列表、计数、分类统计、AI 提示词都走这里，保证「看得到的就是算进去的」。 */
    txnsInMonth(ym) {
      const w = S.monthWindow(ym);
      return db.txns.filter(t => {
        const d = (t.date || '').slice(0, 10);
        return d && d >= w.start && d <= w.end;
      });
    },

    /** 账本里出现过的所有「用途」标签（去重、按出现次数排）。
     *  用途是自由文本（如「这个月房租」「给妹妹生活费」），
     *  但给用户一个历史列表选，比每次手打强。 */
    txnPurposes() {
      const map = {};
      db.txns.forEach(t => {
        const p = (t.purpose || '').trim();
        if (p) map[p] = (map[p] || 0) + 1;
      });
      return Object.keys(map).sort((a, b) => map[b] - map[a] || a.localeCompare(b));
    },

    /** 账本里出现过的所有分类（含自定义的）。 */
    txnCategories() {
      /* 踩过的坑：WeChat.CATEGORIES 是数组不是对象，
         用 Object.keys() 会得到 ["0","1","2"...] 这种下标。
         这里兼容两种形态。 */
      const src = (typeof WeChat !== 'undefined' && WeChat.CATEGORIES) || [];
      const base = Array.isArray(src) ? src.slice() : Object.keys(src);
      const set = {};
      base.forEach(c => { if (c) set[c] = 1; });
      db.txns.forEach(t => { if (t.category) set[t.category] = 1; });
      db.txnRules.forEach(r => { if (r.category) set[r.category] = 1; });
      return Object.keys(set);
    },

    /**
     * 学会一条规则：根据一笔已编辑的交易，生成/更新对应的 txnRules 条目。
     *
     * 去重键是「关键词 + 流向」——同一个人两个方向算两条规则，
     * 这正是用户要的：「张三给我转账是生活费，我给李四转账是其他消费」。
     * 已存在就更新分类和用途（用户改主意了），不新增。
     *
     * @returns {{rule:object, created:boolean}|null}
     */
    learnRuleFromTxn(txn) {
      if (!txn || typeof WeChat === 'undefined' || !WeChat.ruleFromTxn) return null;
      const draft = WeChat.ruleFromTxn(txn);
      if (!draft) return null;

      const k = U.norm(draft.keyword).toLowerCase();
      const ex = db.txnRules.find(r =>
        U.norm(String(r.keyword || '')).toLowerCase() === k &&
        (r.direction || 'both') === (draft.direction || 'both')
      );
      if (ex) {
        ex.category = draft.category || ex.category;
        if (draft.purpose) ex.purpose = draft.purpose;
        ex.hits = (ex.hits || 0) + 1;
        save();
        return { rule: ex, created: false };
      }
      const rule = Object.assign({ id: U.uid('ru_'), hits: 1 }, draft);
      db.txnRules.push(rule);
      save();
      return { rule, created: true };
    },

    /** 把一条规则应用到已有的历史流水上（用于「回填」按钮）。 */
    applyRuleToHistory(rule) {
      if (!rule || !rule.keyword) return 0;
      let n = 0;
      db.txns.forEach(t => {
        /* 只回填还没被人工确认过的，避免覆盖用户手动改过的分类 */
        if (t.edited) return;
        if (rule.direction && rule.direction !== 'both' && rule.direction !== t.type) return;
        const hay = U.norm([t.counterparty, t.product, t.note].filter(Boolean).join(' ')).toLowerCase();
        if (hay.indexOf(U.norm(rule.keyword).toLowerCase()) < 0) return;
        if (rule.category) { t.category = rule.category; n++; }
        if (rule.purpose) t.purpose = rule.purpose;
      });
      if (n) save();
      return n;
    },

    monthSummary(ym) {
      /* 收入和支出用**同一个**窗口。
         之前支出按自然月，结果「10 月支出」和「10 月收入」覆盖的日期不一样，
         对不上账。现在统一成 S.monthWindow()。 */
      const win = S.monthWindow(ym);
      const list = S.txnsInMonth(ym);
      const expense = U.sum(list.filter(t => t.type === 'expense'), t => t.amount);
      const inc = S.monthIncome(ym);

      return {
        /* income 现在是「账单里的真实收入」，不再被设置值覆盖。
           设置值降级成参考（referenceIncome），见 DEVLOG。 */
        income: inc.total,
        realIncome: inc.total,
        expense,
        balance: inc.total - expense,
        count: list.length,
        savingGoal: S.settings.money.savingGoal,

        /* 收入拆分 */
        stipend: inc.stipend,          // 固定生活费合计
        extra: inc.extra,              // 额外收入合计
        stipendCount: inc.stipendCount,
        extraCount: inc.extraCount,
        referenceIncome: inc.reference,
        window: win,
        incomeWindow: win            // 兼容旧名字：income 和 expense 现在是同一个窗口
      };
    },

    /** 某个月的**统计窗口** [start, end]（含两端）。
     *  收入和支出都用它。
     *  默认错位：上个月最后一天 ~ 本月倒数第二天。
     *  理由：生活费常在上月底提前打进来，那笔其实属于下个月；
     *  支出跟着同一个窗口走，两边才对得上账。 */
    monthWindow(ym) {
      const shift = S.settings.money.incomeWindowShift !== false;
      const [y, m] = String(ym).split('-').map(Number);
      if (!shift) {
        const last = new Date(y, m, 0).getDate();
        return { start: `${ym}-01`, end: `${ym}-${U.pad(last)}`, shifted: false };
      }
      /* 上个月最后一天 */
      const prevLast = new Date(y, m - 1, 0);
      const startStr = U.ymd(prevLast);
      /* 本月倒数第二天 */
      const lastDay = new Date(y, m, 0).getDate();
      return { start: startStr, end: `${ym}-${U.pad(lastDay - 1)}`, shifted: true };
    },

    /** 旧名字，等价于 monthWindow。保留是为了不破坏已有调用。 */
    incomeWindow(ym) { return S.monthWindow(ym); },

    /** 这笔金额算不算「固定生活费」。
     *  用户设定：每月 1500 分两次各 750 到账，所以 750 是敏感数字。
     *  带容差是因为微信导出的金额偶尔有几分钱浮动 / 手续费。
     *  纯读函数，不改数据——统计和界面都用它，保证口径一致。 */
    isStipendAmount(amt) {
      const tol = Number(S.settings.money.stipendTolerance);
      const target = Number(S.settings.money.stipendAmount);
      const useTol = isFinite(tol) && tol >= 0 ? tol : 1;
      if (!isFinite(target) || target <= 0) return false;
      return Math.abs((Number(amt) || 0) - target) <= useTol;
    },

    /** 某个月的收入统计（含固定生活费 / 额外收入的拆分）。 */
    monthIncome(ym) {
      const win = S.monthWindow(ym);
      const all = db.txns.filter(t => t.type === 'income');
      const inWin = all.filter(t => {
        const d = (t.date || '').slice(0, 10);
        return d && d >= win.start && d <= win.end;
      });

      let stipend = 0, extra = 0, stipendCount = 0, extraCount = 0;
      inWin.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (S.isStipendAmount(amt)) {
          stipend += amt; stipendCount++;
        } else {
          extra += amt; extraCount++;
        }
      });

      const ref = S.settings.money.monthlyIncome;
      return {
        total: U.round(stipend + extra, 2),
        stipend: U.round(stipend, 2),
        extra: U.round(extra, 2),
        stipendCount, extraCount,
        reference: (ref != null && ref !== '') ? Number(ref) : null,
        window: win,
        /* 供界面提示：生活费收齐了吗 */
        expected: (ref != null && ref !== '') ? Number(ref) : null
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

      /* ───── 先决定日记要不要收 ─────
         日记是密文，只有「同一把钥匙」才有意义。
         两台设备各自设过不同的密码 = 两份不同的 salt，
         硬合并进来会得到一串**永远解不开、但看起来完好**的记录 ——
         用户不会发现，直到某天去翻那篇日记。所以宁可当场拒绝并告诉他。 */
      const incomingDiary = obj.settings && obj.settings.diary;
      const localDiary = (db.settings && db.settings.diary) || {};
      const incomingHasData = DIARY_COLLS.some(c => Array.isArray(obj[c]) && obj[c].length);
      let diaryOutcome = 'none';     // none | merged | adopted | conflict

      if (incomingDiary && incomingDiary.salt) {
        if (!localDiary.salt || !localDiary.enabled) {
          diaryOutcome = 'adopted';                    // 本机还没建过日记库 → 整套采纳
        } else if (localDiary.salt === incomingDiary.salt) {
          diaryOutcome = 'merged';                     // 同一个密码 → 正常合并
        } else if (!incomingHasData) {
          diaryOutcome = 'merged';                     // 备份里只有参数没内容 → 跟着走就行
        } else {
          const localHasData = DIARY_COLLS.some(c => Array.isArray(db[c]) && db[c].length);
          /* 本机设过密码但一篇都没写 → 采纳备份的（备份才是真有内容的那个）。
             两边都有内容且密码不同 → 拒绝，绝不能混。 */
          diaryOutcome = localHasData ? 'conflict' : 'adopted';
        }
      }

      COLLECTIONS.forEach(coll => {
        if (!Array.isArray(obj[coll])) return;
        /* 密码冲突时，日记的三个集合一笔都不进 */
        if (diaryOutcome === 'conflict' && DIARY_COLLS.indexOf(coll) >= 0) return;
        if (!Array.isArray(db[coll])) db[coll] = [];
        const seen = new Set(db[coll].map(x => x.id));
        let n = 0;
        obj[coll].forEach(it => {
          if (!it || typeof it !== 'object') return;
          if (!it.id) it.id = U.uid(coll.slice(0, 2) + '_');
          if (seen.has(it.id)) return;
          db[coll].push(it); seen.add(it.id); n++;
        });
        counts[coll] = n;
      });

      if (obj.settings) {
        /* 日记的加密参数必须**整套采纳或整套不动**，
           不能让 deepMerge 把两边的 salt / verifier 拌在一起 ——
           混出来的参数解不开任何一边的密文。所以先摘出来单独处理。 */
        const rest = Object.assign({}, obj.settings);
        delete rest.diary;
        db.settings = deepMerge(db.settings, rest);

        if (incomingDiary) {
          if (diaryOutcome === 'conflict') {
            db.settings.diary = localDiary;            // 保持本机原样，一个字都不动
          } else if (diaryOutcome === 'adopted') {
            const keepPref = { autoLockMinutes: localDiary.autoLockMinutes,
                               useContext: localDiary.useContext,
                               useContextParts: localDiary.useContextParts };
            db.settings.diary = Object.assign({}, localDiary, incomingDiary, keepPref);
            /* salt / verifier / enabled / iterations 必须是备份侧的一整套 */
            ['salt', 'verifier', 'enabled', 'iterations', 'createdAt'].forEach(k => {
              if (incomingDiary[k] !== undefined) db.settings.diary[k] = incomingDiary[k];
            });
          } else {
            /* 同密码：加密参数保持本机，其余偏好跟随备份 */
            const keepCrypto = { salt: localDiary.salt, verifier: localDiary.verifier,
                                 enabled: localDiary.enabled, iterations: localDiary.iterations,
                                 createdAt: localDiary.createdAt };
            db.settings.diary = Object.assign({}, localDiary, incomingDiary, keepCrypto);
          }
        }
      }

      /* meta 也要带过来：lastImport 决定了「导入记录」卡片里的引用是否还对得上 */
      if (obj.meta && typeof obj.meta === 'object') {
        db.meta = Object.assign({}, db.meta, obj.meta);
      }
      saveNow();
      return { mode: 'merge', counts, diary: diaryOutcome };
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
      key: 'diaryApiKey',
      label: '日记的 AI Key（单独一套）',
      where: '长按「今天」→ 日记 → 设置 → 日记的 AI',
      hint: '日记的 AI 是独立配置的，不填就用不了「谈话」和「小结」',
      done: () => {
        const k = String((S.settings.diaryAi || {}).apiKey || '').trim();
        return k.length > 10 && !/替换/.test(k);
      },
      fill: () => { S.settings.diaryAi.apiKey = S.settings.pending.apiKey; }
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