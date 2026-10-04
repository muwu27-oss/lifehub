/* ═══════════════════════════════════════════════
   diary.js — 日记模块的数据层（加密存储 + 区间 + AI）

   和 App 里其它模块最大的不同：**这里的内容全是密文**。
   localStorage 里、导出备份里，都只有
     {id, date, iv, ct}
   正文、心情、谈话、小结都在 ct 里，没有密码解不开。

   分层：
     Crypto  做算法（PBKDF2 / AES-GCM）
     diary.js 决定「什么时候加密、锁在哪个范围」
     views/diary.js 只管显示

   ⚠️ 密钥只活在内存里（模块级变量 key），**从不写进 localStorage**。
   刷新页面 = 自动上锁，这是有意设计：密文和钥匙放在同一个地方，
   加密就没有意义了。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const D = {};

  /* ───────── 会话状态（只在内存） ───────── */
  let key = null;              // CryptoKey，解锁后才有
  let cache = null;            // {entries:[], chats:[], digests:[]} 解密后的明文缓存
  let lastActive = 0;          // 最后一次操作时间，自动锁定用

  D.touch = function () { lastActive = Date.now(); };
  D.lastActive = function () { return lastActive; };

  /* ── 正在写东西时，挂住自动锁 ──
     用户报的：「5 分钟无操作就锁住，在我写日记的时候都会触发」。
     根因是 lastActive 只在存/解/锁这些动作上更新，**打字不算操作**，
     所以写着写着就被锁了 —— 而草稿只在那个输入框里，锁一次就没了。

     修了两层：
       ① 编辑器每次输入都 touch()，正在打字的人绝不会被锁；
       ② 打开编辑器期间整段 hold 住 —— 因为「停下来想两分钟」也不该算
          「无操作」，而想的时候是没有按键事件的。
     关掉编辑框（不管怎么关）就释放，正常的安全策略不受影响。
     代价是：把编辑框开着撂下不管，会一直不锁。但丢一篇刚写完的日记
     比这个严重得多，所以往「别丢」这边倒。 */
  let lockHeld = false;
  D.holdLock = function (on) { lockHeld = !!on; if (lockHeld) D.touch(); };
  D.isLockHeld = function () { return lockHeld; };

  /* ═══════════ 密码 ═══════════ */

  const cfg = () => S.settings.diary;

  D.hasPassword = function () {
    const c = cfg();
    return !!(c && c.enabled && c.salt && c.verifier);
  };

  D.isUnlocked = function () { return !!key; };

  /** 密码强度提示（只提示，不强制 —— 这是他的日记，不是注册账号） */
  D.passwordHint = function (pw) {
    const s = String(pw || '');
    if (s.length < 6) return { level: 'weak', text: '太短了。至少 6 位，否则别人试几次就开了。' };
    const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(re => re.test(s)).length;
    if (s.length >= 12 && kinds >= 3) return { level: 'strong', text: '很稳。记住它 —— 没有找回流程。' };
    if (s.length >= 8 && kinds >= 2) return { level: 'ok', text: '可以。别用生日、学号、手机号。' };
    return { level: 'weak', text: '偏弱。加长一点，或混上数字和符号。' };
  };

  /** 第一次设置密码 */
  D.setup = async function (password) {
    if (!Crypto.available()) throw new Error(Crypto.whyUnavailable());
    const pw = String(password || '');
    if (pw.length < 4) throw new Error('密码至少 4 位');
    const salt = Crypto.newSalt();
    const it = Crypto.ITERATIONS;
    const k = await Crypto.derive(pw, salt, it);
    const v = await Crypto.makeVerifier(k);

    const c = cfg();
    c.enabled = true;
    c.salt = salt;
    c.verifier = v;
    c.iterations = it;
    c.createdAt = new Date().toISOString();

    key = k;
    cache = null;
    D.touch();
    S.saveNow();
    return true;
  };

  /** 解锁。密码错了抛异常，界面据此提示。 */
  D.unlock = async function (password) {
    if (!Crypto.available()) throw new Error(Crypto.whyUnavailable());
    const c = cfg();
    if (!D.hasPassword()) throw new Error('还没有设置过密码');

    const k = await Crypto.derive(String(password || ''), c.salt, c.iterations);
    const okPw = await Crypto.checkVerifier(k, c.verifier && c.verifier.iv, c.verifier && c.verifier.ct);
    if (!okPw) throw new Error('密码不对');

    key = k;
    cache = null;
    D.touch();
    return true;
  };

  /** 上锁：清掉密钥和明文缓存 */
  D.lock = function () {
    key = null;
    cache = null;
    return true;
  };

  /** 改密码：把所有记录用新密钥重新加密一遍。
   *  必须整体重写 —— 只换 salt 而不重加密，老记录就再也解不开了。 */
  D.changePassword = async function (oldPw, newPw) {
    if (!D.isUnlocked()) throw new Error('先解锁');
    await D.unlock(oldPw);                       // 验证旧密码（顺带确保 key 是对的）

    const np = String(newPw || '');
    if (np.length < 4) throw new Error('新密码至少 4 位');

    /* 先把明文全读出来（此刻还是旧密钥） */
    const entries = await D.entries();
    const chats = await D.chats();
    const digests = await D.digests();

    const salt = Crypto.newSalt();
    const k = await Crypto.derive(np, salt, Crypto.ITERATIONS);
    const v = await Crypto.makeVerifier(k);
    key = k;

    /* 用新密钥重新加密每一条 */
    for (const e of entries) {
      const rec = S.find('diaryEntries', e.id);
      if (!rec) continue;
      const payload = { text: e.text, mood: e.mood };
      const enc = await Crypto.encryptJSON(key, payload);
      S.update('diaryEntries', e.id, { iv: enc.iv, ct: enc.ct });
    }
    for (const c of chats) {
      const rec = S.find('diaryChats', c.id);
      if (!rec) continue;
      const enc = await Crypto.encryptJSON(key, { messages: c.messages, title: c.title });
      S.update('diaryChats', c.id, { iv: enc.iv, ct: enc.ct });
    }
    for (const d of digests) {
      const rec = S.find('diaryDigests', d.id);
      if (!rec) continue;
      const enc = await Crypto.encryptJSON(key, d.payload);
      S.update('diaryDigests', d.id, { iv: enc.iv, ct: enc.ct });
    }

    const c = cfg();
    c.salt = salt;
    c.verifier = v;
    c.iterations = Crypto.ITERATIONS;
    c.enabled = true;
    cache = null;
    S.saveNow();
    return true;
  };

  /** 抹掉整个日记库（密码 + 全部内容） */
  D.wipe = function () {
    S.db.diaryEntries = [];
    S.db.diaryChats = [];
    S.db.diaryDigests = [];
    const c = cfg();
    c.enabled = false; c.salt = ''; c.verifier = null; c.createdAt = null;
    D.lock();
    S.saveNow();
    return true;
  };

  /** 存储里各有多少条记录。
   *  **不需要密钥** —— 数的是密文条数，不是内容。
   *  锁屏上的「忘记密码 → 重置」用它如实告诉用户会丢多少东西：
   *  空库时说「现在是空的，重置不会丢任何东西」，
   *  有内容时给出真实条数，而不是含糊的「所有数据」。 */
  D.counts = function () {
    return {
      entries: S.all('diaryEntries').length,
      chats: S.all('diaryChats').length,
      digests: S.all('diaryDigests').length
    };
  };

  /* ═══════════ 明文缓存 ═══════════
     每次渲染都重新解密一轮在手机上会明显卡（PBKDF2 慢、AES 也不免费），
     所以解锁后第一次访问时一次性解密，之后走缓存。
     任何写操作都会把 cache 置空，避免读到旧内容。 */

  async function loadCache() {
    if (cache) return cache;
    if (!key) throw new Error('日记已上锁');

    const out = { entries: [], chats: [], digests: [] };
    const bad = { entries: 0, chats: 0, digests: 0 };

    for (const rec of S.all('diaryEntries')) {
      try {
        const p = await Crypto.decryptJSON(key, rec.iv, rec.ct);
        out.entries.push({
          id: rec.id, date: rec.date,
          text: p.text || '', mood: p.mood == null ? null : p.mood,
          createdAt: rec.createdAt, updatedAt: rec.updatedAt
        });
      } catch (e) { bad.entries++; }
    }
    for (const rec of S.all('diaryChats')) {
      try {
        const p = await Crypto.decryptJSON(key, rec.iv, rec.ct);
        out.chats.push({
          id: rec.id, gran: rec.gran, key: rec.key,
          messages: p.messages || [], title: p.title || '',
          model: p.model || '', usage: p.usage || null,
          createdAt: rec.createdAt
        });
      } catch (e) { bad.chats++; }
    }
    for (const rec of S.all('diaryDigests')) {
      try {
        const p = await Crypto.decryptJSON(key, rec.iv, rec.ct);
        out.digests.push({
          id: rec.id, gran: rec.gran, key: rec.key,
          payload: p, createdAt: rec.createdAt, updatedAt: rec.updatedAt
        });
      } catch (e) { bad.digests++; }
    }

    out.entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    out.chats.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    out.digests.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    out.bad = bad;
    cache = out;
    return cache;
  }

  /** 解密失败的条数。密码对但解不开 = 数据被改过，或混进了别的库的记录。 */
  D.badCounts = async function () {
    const c = await loadCache();
    return c.bad;
  };

  /* ── 一天的边界是早上 7 点，不是午夜 ──
     凌晨两三点写的东西，人的感觉是「还是昨晚那一天」，不是「第二天」。
     所以 10/3 这一天 = 10/3 07:00 ～ 10/4 07:00，
     在这个区间里提交的日记都归到 10/3。

     为什么是 7 点：正常作息里 7 点前基本都算「还没睡，还是前一天」，
     跨过 7 点才算新的一天。用户明确要的就是这个范围。

     ⚠️ 这个边界**只在这里定义一次**：「写今天」按钮和把历史数据
     重新归档的迁移都调它。两处各写一份迟早会漂。 */
  D.DAY_START_HOUR = 7;

  /** 某个时刻属于哪一天（日记口径）。不传就是现在。 */
  D.dayKey = function (when) {
    const d = when == null ? new Date() : new Date(when);
    if (isNaN(d.getTime())) return U.ymd(U.today());
    /* 没到 7 点 → 算前一天 */
    return U.ymd(d.getHours() < D.DAY_START_HOUR ? U.addDays(d, -1) : d);
  };

  /* ═══════════ 日记条目 ═══════════ */

  /** 把一条日记挪到另一天（连同那天的日粒度小结/谈话）。
   *  用于「归档错了，我自己改回来」。一天一篇，目标已有内容时拒绝，不覆盖。 */
  D.reDateEntry = function (from, to) {
    if (!from || !to || from === to) return false;
    const rec = (S.all('diaryEntries') || []).find(r => r.date === from);
    if (!rec) return false;
    const clash = (S.all('diaryEntries') || []).some(r => r.id !== rec.id && r.date === to);
    if (clash) return false;
    S.update('diaryEntries', rec.id, { date: to });
    moveDayKeys(from, to);
    cache = null;
    S.saveNow();
    return true;
  };

  /** 日粒度的小结和谈话跟着日记一起搬 key，否则它们会指向一个空日子 */
  function moveDayKeys(from, to) {
    ['diaryDigests', 'diaryChats'].forEach(coll => {
      (S.all(coll) || []).forEach(r => {
        if (r.gran !== 'day' || r.key !== from) return;
        const taken = (S.all(coll) || [])
          .some(x => x.id !== r.id && x.gran === 'day' && x.key === to);
        if (taken) return;
        S.update(coll, r.id, { key: to });
      });
    });
  }

  /* ── 一次性迁移：把「凌晨写的」日记按新口径重新归档 ──
     一天的口径从「午夜→午夜」改成了「07:00→次日 07:00」。
     改之前，10/4 凌晨 1 点写的日记存成了 10/4；按新口径它属于 10/3。
     这里把历史数据也对齐，否则日历上会留着一条错位的记录。

     ⚠️ 这个函数会改用户的数据，所以条件卡得很死：
       · 只动 `date === createdAt 当天` 的 —— 这证明它是**自动记成那天**的，
         而不是用户手动「选日期」补写的（补写的 createdAt 和 date 本来就不同）；
       · 只动 createdAt 落在当天 07:00 之前的；
       · 目标日期已经有日记就**不动**（一天一篇，撞了宁可不搬也不能覆盖）；
       · 只跑一次，用 settings 标记。

     不需要密钥：date 和 createdAt 都是明文，不用解密。 */
  D.migrateDayBoundary = function () {
    const dcfg = S.settings.diary;
    if (dcfg.dayBoundaryMigrated === 1) return 0;

    const list = S.all('diaryEntries') || [];
    const movedMap = {};
    let moved = 0;

    list.slice().forEach(r => {
      if (!r.createdAt || !r.date) return;
      const at = new Date(r.createdAt);
      if (isNaN(at.getTime())) return;
      if (at.getHours() >= D.DAY_START_HOUR) return;   // 不是凌晨写的，不关它的事
      if (U.ymd(at) !== r.date) return;                // 手动补写的，一律不碰
      const target = U.ymd(U.addDays(at, -1));
      if (!target || target === r.date) return;
      const taken = (S.all('diaryEntries') || [])
        .some(x => x.id !== r.id && x.date === target);
      if (taken) return;
      /* ⚠️ 必须在 S.update 之前把旧日期存下来。
         S.update 改的就是**同一个对象**（S.find 返回的是存储里那个引用），
         改完 r.date 已经是新值了 —— 之后再把 r.date 当 key 记进 movedMap，
         记的就是「新 → 新」，moveDayKeys 永远找不到要搬的小结和谈话。
         这个坑和 store.remove 那个是同一类：对象是引用，不是快照。 */
      const fromDate = r.date;
      S.update('diaryEntries', r.id, { date: target });
      movedMap[fromDate] = target;
      moved++;
    });

    Object.keys(movedMap).forEach(from => moveDayKeys(from, movedMap[from]));

    dcfg.dayBoundaryMigrated = 1;
    cache = null;
    S.saveNow();
    return moved;
  };

  D.entries = async function () { return (await loadCache()).entries; };

  D.entryOn = async function (date) {
    const list = await D.entries();
    return list.find(e => e.date === date) || null;
  };

  /** 写/改某一天的日记。一天一篇。 */
  D.saveEntry = async function (date, text, mood) {
    if (!key) throw new Error('日记已上锁');
    const body = String(text == null ? '' : text);
    const rec = S.all('diaryEntries').find(r => r.date === date);
    const enc = await Crypto.encryptJSON(key, { text: body, mood: mood == null ? null : mood });
    let out;
    if (rec) {
      out = S.update('diaryEntries', rec.id, { iv: enc.iv, ct: enc.ct });
    } else {
      out = S.add('diaryEntries', { date, iv: enc.iv, ct: enc.ct });
    }
    cache = null; D.touch();
    S.saveNow();
    return out;
  };

  D.removeEntry = async function (id) {
    const ok = S.remove('diaryEntries', id);
    cache = null;
    return ok;
  };

  /** 有日记的日期集合，日历打点用 */
  D.markedDates = async function () {
    const list = await D.entries();
    const s = {};
    list.forEach(e => { if (e.text && e.text.trim()) s[e.date] = true; });
    return s;
  };

  D.stats = async function () {
    const list = await D.entries();
    const written = list.filter(e => e.text && e.text.trim());
    const chars = U.sum(written, e => e.text.length);
    return {
      total: written.length,
      chars,
      avgChars: written.length ? Math.round(chars / written.length) : 0,
      first: written.length ? written[written.length - 1].date : null,
      last: written.length ? written[0].date : null,
      chats: S.all('diaryChats').length,
      digests: S.all('diaryDigests').length
    };
  };

  /* ═══════════ 区间（日 / 周 / 月 / 年） ═══════════
     注意：日记用**自然月**，不套账本那套「上月最后一天~本月倒数第二天」的错位窗口。
     那套是为生活费提前到账设计的，跟日记没关系。 */

  D.GRANS = [
    { id: 'day', name: '日', short: '日' },
    { id: 'week', name: '周', short: '周' },
    { id: 'month', name: '月', short: '月' },
    { id: 'year', name: '年', short: '年' }
  ];

  /** 某一天属于哪个区间的 key */
  D.keyOf = function (gran, dateStr) {
    const d = U.ymd(U.parse(dateStr || U.today()));
    if (gran === 'day') return d;
    if (gran === 'week') return U.ymd(U.startOfWeek(d));
    if (gran === 'month') return d.slice(0, 7);
    if (gran === 'year') return d.slice(0, 4);
    return d;
  };

  /** key → {start, end} 闭区间 */
  D.range = function (gran, k) {
    if (gran === 'day') return { start: k, end: k, gran };
    if (gran === 'week') {
      const s = U.parse(k);
      return { start: U.ymd(s), end: U.ymd(U.addDays(s, 6)), gran };
    }
    if (gran === 'month') {
      const [y, m] = String(k).split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return { start: `${k}-01`, end: `${k}-${U.pad(last)}`, gran };
    }
    if (gran === 'year') return { start: `${k}-01-01`, end: `${k}-12-31`, gran };
    return { start: k, end: k, gran };
  };

  /** 区间里的每一天 */
  D.daysIn = function (r) {
    const out = [];
    let cur = U.parse(r.start), end = U.parse(r.end);
    let guard = 0;
    while (cur <= end && guard++ < 400) {
      out.push(U.ymd(cur));
      cur = U.addDays(cur, 1);
    }
    return out;
  };

  /** 按 delta 前后移动一个区间 */
  D.shift = function (gran, k, delta) {
    if (gran === 'day') return U.ymd(U.addDays(U.parse(k), delta));
    if (gran === 'week') return U.ymd(U.addDays(U.parse(k), delta * 7));
    if (gran === 'month') {
      const [y, m] = String(k).split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}`;
    }
    if (gran === 'year') return String(Number(k) + delta);
    return k;
  };

  /** 人类可读的区间名 */
  /* ── 日期一律带上「号数」 ──
     用户的要求：「这个页面我希望可以看到具体的日期，精确到号数，
     后面年月周也是一样，精确到号」。

     U.friendly() 对最近几天只返回「今天 / 昨天 / 前天」——
     看着亲切，但**完全看不到是几号**，翻日记时对不上日历。
     所以日记版块单独用这两个：
       · dateText    —— 10月3日 周六
       · dateTextRel —— 昨天 · 10月3日 周六（相对说法留着，但一定带号）
     ⚠️ 只改日记版块，不动 U.friendly —— 它全 App 都在用，
     任务列表那种地方「昨天」就够，加上号数反而啰嗦。 */
  D.dateText = function (date) {
    const d = U.parse(date);
    if (!d) return String(date == null ? '' : date);
    const y = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : '';
    return `${y}${d.getMonth() + 1}月${d.getDate()}日 ${U.dowName(d)}`;
  };

  D.dateTextRel = function (date) {
    const f = U.friendly(date);
    /* friendly 已经带号数（不是最近几天）就不用再补 */
    if (/月\d+日/.test(f)) return f;
    return `${f} · ${D.dateText(date)}`;
  };

  /** 区间文字，精确到号。跨年时补上年份。 */
  D.rangeText = function (gran, k) {
    const r = D.range(gran, k);
    if (!r || !r.start || !r.end) return '';
    const a = U.parse(r.start), b = U.parse(r.end);
    if (!a || !b) return '';
    const cross = a.getFullYear() !== b.getFullYear();
    const f = d => (cross ? `${d.getFullYear()}年` : '') + `${d.getMonth() + 1}月${d.getDate()}日`;
    return `${f(a)}–${f(b)}`;
  };

  D.label = function (gran, k) {
    if (gran === 'day') return D.dateTextRel(k);
    if (gran === 'week') {
      const r = D.range('week', k);
      const a = U.parse(r.start);
      const wk = Math.floor((a.getDate() - 1) / 7) + 1;
      /* 原来写的是 10/3–10/9 这种斜杠式，和别处的中文日期不一致，
         现在补齐号数写法 */
      return `${a.getMonth() + 1}月第${wk}周（${D.rangeText('week', k)}）`;
    }
    if (gran === 'month') {
      const [y, m] = String(k).split('-').map(Number);
      return `${y}年${m}月（${D.rangeText('month', k)}）`;
    }
    if (gran === 'year') return `${k}年（${D.rangeText('year', k)}）`;
    return k;
  };

  /** 以 now 结尾、往前数 n 个区间（含当前），返回 [{key,label,range}] */
  D.recentRanges = function (gran, n, from) {
    const base = D.keyOf(gran, from || U.ymd(U.today()));
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = D.shift(gran, base, -i);
      out.push({ key: k, label: D.label(gran, k), range: D.range(gran, k) });
    }
    return out.reverse();
  };

  /** 区间里的日记条目（按日期升序，方便喂给 AI 和按时间读） */
  D.entriesIn = async function (gran, k) {
    const r = D.range(gran, k);
    const list = await D.entries();
    return list
      .filter(e => e.date >= r.start && e.date <= r.end && e.text && e.text.trim())
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  /* ═══════════ 谈话（一次对话 = 一条记录） ═══════════ */

  D.chats = async function (gran, k) {
    const all = (await loadCache()).chats;
    if (!gran) return all;
    return all.filter(c => c.gran === gran && c.key === k);
  };

  D.chatById = async function (id) {
    const all = (await loadCache()).chats;
    return all.find(c => c.id === id) || null;
  };

  /** 存一次谈话。messages 是完整的 [{role,content}]（含 system 之外的全部轮次）。 */
  D.saveChat = async function (gran, k, messages, meta) {
    if (!key) throw new Error('日记已上锁');
    const payload = {
      messages: messages || [],
      title: (meta && meta.title) || '',
      model: (meta && meta.model) || '',
      usage: (meta && meta.usage) || null
    };
    const enc = await Crypto.encryptJSON(key, payload);
    const rec = S.add('diaryChats', { gran, key: k, iv: enc.iv, ct: enc.ct });
    cache = null; D.touch();
    S.saveNow();
    return rec;
  };

  /** 往已有谈话里追加内容（继续聊） */
  D.updateChat = async function (id, messages, meta) {
    const rec = S.find('diaryChats', id);
    if (!rec) return null;
    const old = await D.chatById(id);
    const payload = {
      messages: messages || [],
      title: (meta && meta.title) || (old && old.title) || '',
      model: (meta && meta.model) || (old && old.model) || '',
      usage: (meta && meta.usage) || (old && old.usage) || null
    };
    const enc = await Crypto.encryptJSON(key, payload);
    const out = S.update('diaryChats', id, { iv: enc.iv, ct: enc.ct });
    cache = null; D.touch();
    S.saveNow();
    return out;
  };

  D.removeChat = async function (id) {
    const ok = S.remove('diaryChats', id);
    cache = null;
    return ok;
  };

  /* ═══════════ 小结（回顾总结系统） ═══════════ */

  D.digests = async function (gran) {
    const all = (await loadCache()).digests;
    if (!gran) return all;
    return all.filter(d => d.gran === gran);
  };

  D.digestFor = async function (gran, k) {
    const list = await D.digests(gran);
    return list.find(d => d.key === k) || null;
  };

  D.saveDigest = async function (gran, k, payload) {
    if (!key) throw new Error('日记已上锁');
    const enc = await Crypto.encryptJSON(key, payload);
    const exist = S.all('diaryDigests').find(r => r.gran === gran && r.key === k);
    let out;
    if (exist) out = S.update('diaryDigests', exist.id, { iv: enc.iv, ct: enc.ct });
    else out = S.add('diaryDigests', { gran, key: k, iv: enc.iv, ct: enc.ct });
    cache = null; D.touch();
    S.saveNow();
    return out;
  };

  D.removeDigest = async function (id) {
    const ok = S.remove('diaryDigests', id);
    cache = null;
    return ok;
  };

  /* ── 趋势：把小结里的评分串成一条线 ── */
  D.DIMS = [
    { id: 'mood', name: '整体', color: '#8b5cf6' },
    { id: 'emotion', name: '情绪', color: '#ec4899' },
    { id: 'energy', name: '精力', color: '#f59e0b' },
    { id: 'body', name: '身体', color: '#0d9488' },
    { id: 'study', name: '学业', color: '#3b6ef6' },
    { id: 'social', name: '人际', color: '#64748b' }
  ];

  /** 取最近 n 个区间的某个维度评分（时间升序）。
   *  没有小结的区间**不补 0** —— 0 分和「没记录」是两回事，
   *  补 0 会让曲线凭空掉下去，看起来像状态崩了。 */
  D.series = async function (gran, dim, n) {
    const ranges = D.recentRanges(gran, n || 12);
    const out = [];
    for (const r of ranges) {
      const d = await D.digestFor(gran, r.key);
      const v = d && d.payload ? Number(d.payload[dim]) : NaN;
      out.push({
        key: r.key, label: r.label,
        value: isFinite(v) && v > 0 ? v : null,
        has: !!d
      });
    }
    return out;
  };

  /** 小结覆盖率：有小结的区间 / 总区间。样本太少时趋势不可信。 */
  D.coverage = async function (gran, n) {
    const s = await D.series(gran, 'mood', n);
    const has = s.filter(x => x.has).length;
    return { has, total: s.length, pct: s.length ? Math.round(has / s.length * 100) : 0 };
  };

  /* ═══════════ 客观数据（给 AI 当参照） ═══════════
     日记是主观的。用户说「我这周挺累的」，可能是真的，
     也可能只是这周写了三次日记。配上作息/饮食/任务/账目，
     AI 才有依据说「你确实三次熬夜到一点以后」或者
     「其实你这周睡了 7.5 小时，累的是别的事」。
     这些都是本机数据，只有发给 AI 那一次会离开手机。 */

  /** 入睡时间换算成「晚上 6 点之后的第几分钟」，方便判断熬夜。
   *  23:30→330，01:20→440，02:00→480。>=390（00:30）算熬夜。 */
  function bedOffset(bedtime) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(bedtime || ''));
    if (!m) return null;
    let mins = Number(m[1]) * 60 + Number(m[2]);
    if (mins < 12 * 60) mins += 24 * 60;      // 凌晨的算第二天
    return mins - 18 * 60;                     // 相对晚 6 点
  }
  D.bedOffset = bedOffset;

  D.context = function (gran, k) {
    const c = cfg();
    if (!c.useContext) return '';
    const parts = c.useContextParts || {};
    const r = D.range(gran, k);
    const days = D.daysIn(r);
    const L = [];

    /* ── 作息 ── */
    if (parts.sleep) {
      const recs = days.map(d => S.sleepOn(d)).filter(Boolean);
      const hrs = recs.map(x => Number(x.hours) || 0).filter(h => h > 0);
      if (recs.length) {
        L.push('### 作息（客观记录）');
        if (hrs.length) {
          L.push(`- 有记录的 ${hrs.length} 天：平均睡 ${U.round(U.sum(hrs) / hrs.length, 1)} 小时，`
            + `最少 ${U.round(Math.min.apply(null, hrs), 1)}，最多 ${U.round(Math.max.apply(null, hrs), 1)}`);
        }
        const late = recs.map(x => bedOffset(x.bedtime)).filter(v => v != null && v >= 390);
        if (late.length) {
          L.push(`- 其中 ${late.length} 天是 00:30 之后才睡`
            + (late.length >= 3 ? '（连着熬夜）' : ''));
        }
        const bad = recs.filter(x => x.quality === '较差' || x.quality === '失眠');
        if (bad.length) L.push(`- 睡眠质量差/失眠 ${bad.length} 天`);
        const naps = recs.filter(x => Number(x.nap) > 0);
        if (naps.length) L.push(`- 午睡 ${naps.length} 天，平均 ${Math.round(U.sum(naps, x => Number(x.nap)) / naps.length)} 分钟`);
        L.push('');
      }
    }

    /* ── 饮食 ── */
    if (parts.meals) {
      const tot = { kcal: 0, p: 0, days: 0, skipped: 0, partial: 0 };
      days.forEach(d => {
        const meals = S.mealsOn(d);
        if (!meals.length) return;
        const t = global.Nutrition ? Nutrition.dayTotals(meals) : null;
        if (!t) return;
        tot.days++;
        tot.kcal += t.kcal; tot.p += t.p;
        tot.skipped += t.skipped;
        /* 只记了一餐的，热量肯定偏低，要标出来免得 AI 当成「吃得很少」 */
        if (meals.filter(m => !m.skipped).length < 3) tot.partial++;
      });
      if (tot.days) {
        const b = S.settings.body || {};
        L.push('### 饮食（客观记录）');
        L.push(`- 有记录的 ${tot.days} 天：平均摄入 ${Math.round(tot.kcal / tot.days)} kcal、`
          + `蛋白 ${U.round(tot.p / tot.days, 1)} g`
          + (b.dailyKcal ? `（目标 ${b.dailyKcal} kcal）` : ''));
        if (tot.partial) L.push(`- 注意：其中 ${tot.partial} 天只记了不到三餐，热量会偏低，不要当成真的吃得少`);
        if (tot.skipped) L.push(`- 明确记录了「没吃」的餐次 ${tot.skipped} 次`);
        L.push('');
      }
    }

    /* ── 任务 ── */
    if (parts.tasks) {
      const inRange = S.all('tasks').filter(t => {
        const d = (t.due || t.start || '').slice(0, 10);
        return d && d >= r.start && d <= r.end;
      });
      const overdue = S.all('tasks').filter(t => {
        if (t.done) return false;
        const d = (t.due || '').slice(0, 10);
        return d && d < r.end;
      });
      if (inRange.length || overdue.length) {
        L.push('### 任务（客观记录）');
        if (inRange.length) {
          const done = inRange.filter(t => t.done).length;
          const byCat = {};
          inRange.forEach(t => { byCat[t.cat || 'life'] = (byCat[t.cat || 'life'] || 0) + 1; });
          L.push(`- 这段时间到期 ${inRange.length} 项，完成 ${done} 项（${Math.round(done / inRange.length * 100)}%）`);
          L.push(`- 分布：` + Object.keys(byCat).map(x => `${(S.CATS[x] || S.CATS.life).short} ${byCat[x]}`).join(' / '));
        }
        let overdueN = overdue.length;
        if (gran === 'day') overdueN = overdue.filter(t => (t.due || '').slice(0, 10) === k).length;
        if (overdueN) L.push(`- 有 ${overdueN} 项未完成且已过截止日`);
        L.push('');
      }
    }

    /* ── 账本 ── */
    if (parts.money) {
      let ym = null;
      if (gran === 'month') ym = k;
      else if (gran === 'year') ym = null;
      if (gran === 'month') {
        const s = S.monthSummary(ym);
        if (!s.count && !s.income) { /* 一笔都没有就别占篇幅 */ }
        else {
        L.push('### 开销（客观记录）');
        L.push(`- 这个统计窗口（${s.window.start} ~ ${s.window.end}）支出 ${U.money(s.expense)}，`
          + `收入 ${U.money(s.income)}，结余 ${U.money(s.balance)}`);
        const budget = S.settings.money.monthlyBudget;
        if (budget) {
          L.push(`- 预算 ${U.money(budget)}，${s.expense > budget ? '超了 ' + U.money(s.expense - budget) : '还剩 ' + U.money(budget - s.expense)}`);
        }
        L.push('');
        }
      } else if (gran === 'week' || gran === 'day') {
        const list = S.all('txns').filter(t => {
          const d = (t.date || '').slice(0, 10);
          return d && d >= r.start && d <= r.end && t.type === 'expense';
        });
        if (list.length) {
          L.push('### 开销（客观记录）');
          L.push(`- 这段时间支出 ${U.money(U.sum(list, t => t.amount))}，共 ${list.length} 笔`);
          L.push('');
        }
      }
    }

    /* ── 体重 ── */
    if (parts.weight) {
      const ws = S.all('weights')
        .filter(w => w.date >= r.start && w.date <= r.end)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (ws.length) {
        L.push('### 体重（客观记录）');
        const a = ws[0], b = ws[ws.length - 1];
        const delta = U.round(Number(b.kg) - Number(a.kg), 1);
        L.push(`- ${a.date} ${a.kg}kg → ${b.date} ${b.kg}kg`
          + (ws.length > 1 ? `（${delta > 0 ? '+' : ''}${delta}kg）` : ''));
        const target = (S.settings.body || {}).targetWeight;
        if (target) L.push(`- 目标 ${target}kg`);
        L.push('');
      }
    }

    if (!L.length) return '';
    return L.join('\n');
  };

  /* ═══════════ AI ═══════════ */

  D.aiCfg = function () { return S.settings.diaryAi; };
  D.aiReady = function () {
    if (!global.AI) return false;
    const c = D.aiCfg();
    if (!AI.usable(c)) return false;
    /* 占位 key（sk-替换成你的百炼APIKey）也算没配 ——
       否则会拿着假 key 去请求，用户收到一个看不懂的 401，
       而真正的原因是「你还没填」。 */
    if (/替换/.test(String(c.apiKey || ''))) return false;
    return true;
  };

  /* 人设是这个模块最要紧的一段话。
     用户的原话：「像一个心理医生，但我不是以病人的身份而是他的朋友」。
     所以关键不是「温暖」，而是**平等**和**具体** ——
     咨询师腔（我理解你的感受 / 建议你…）恰好是最不像朋友的。 */
  const SYS_FRIEND = `你是用户的老朋友，认识他很多年了，关系很铁。
他不是来找你看病的，你也不是医生。你们之间是平等的、松弛的。
他写日记，你偶尔看看，然后跟他聊。

说话方式（这些是硬要求，不是风格建议）：
1. 不许出现"作为你的AI助手""我理解你的感受""建议你……""你可以试试……"这类腔调。
   那是咨询师和客服的说法，不是朋友的。
2. **具体压倒一切**。说"你周三那篇就写了两行，是不是那天太累了"，
   不要说"你最近状态似乎不太好"。提到了他写过的细节，他才知道你真看了。
3. 不硬给建议。朋友很多时候只是听着，只是说一句"这周你确实挺累的"。
   真要给建议，只说一件，说完就停，别列清单。
4. 不许说"你已经很棒了""相信自己""保持积极心态"这种谁都会说的空话。
   宁可什么都不说，也不要敷衍式安慰。
5. 不许诊断、不许贴标签，不许出现"抑郁""焦虑症""内耗型人格"这类词。
   你不是医生，他也不是病人。
6. 可以不同意他，可以调侃他，可以有你自己的判断。朋友会说实话。
7. 长度自然。有时一两句就够。不要为了显得认真而硬写长。
8. 用 Markdown，但克制：最多几个短句或一两个短点，不要堆小标题。`;

  /* ── 小结的人设：专业、客观、全面 ──
     用户的原话：「我觉得的 ai 总结和谈话是两种定位……小结不应该也是朋友，
     而是专业的心理 ai 专家的客观分析，并且要全面」
     「那个'他可能没有意识到的'这个部分很好，内容篇幅也可以扩展」。

     所以小结和谈话**刻意用两套人设**：
       · 谈话 = SYS_FRIEND，平等的朋友，松弛、可以调侃；
       · 小结 = SYS_ANALYST，冷静的分析者，不照顾情绪，要全面。

     仍然不诊断、不贴标签 —— 这不是风格选择：没有诊断资质，
     而且用户明确说了「我不是以病人的身份」。
     「专业」体现在**观察密度、交叉验证、结构化**上，不是体现在术语上。 */
  const SYS_ANALYST = `你是一位受过系统训练的心理评估分析者，长期跟踪这位用户的日记。
你们不是朋友，你也不需要照顾他的情绪；你的职责是**如实、全面、有条理地分析**。
他不需要安慰，他要知道的是「我自己没看清的东西，被人看清了」。

分析方式（硬要求，不是风格建议）：
1. 客观优先：先陈述观察到的**事实和证据**，再给判断。
   每条判断都必须能追溯到具体某一天或某个数据，不许凭空下结论。
2. 全面覆盖，别只谈情绪。至少都要看到：心情与情绪、精力与疲劳、
   身体与作息、学业／项目推进、人际与支持，以及这几者之间的**相互关系**。
   比如「连续三天 1 点后睡 → 那三天的日记都只有一两行 → 精力跟着掉」
   是一条链，要把它说出来，而不是三件事各说一句。
3. 交叉验证：日记是他自己写的（主观），客观记录来自他手机（作息／饮食／任务／开销）。
   两者一致，说明可信；**两者不一致必须点出来** ——
   比如他说「这周还好」，但任务在堆积、睡眠在下滑。
4. 指出**变化**：和上一阶段比，什么在好转、什么在变差、什么一直没动。
   趋势比单点重要。
5. 不确定就明说不确定。证据不足时写清楚「这段时间只有两篇，判断仅供参考」，
   不要用好听的措辞掩盖信息量不够。
6. 不诊断、不贴标签。不出现"抑郁症""焦虑症""内耗型人格"这类词，也不下医学结论。
   你分析的是**状态和模式**，不是病。
7. 不安慰、不鼓励、不说"你已经很棒了"。有问题就直接指出，语气平实，不必软化。
8. 可以直接点出他的盲点、回避和自相矛盾的地方 —— 这正是他请你看的。

篇幅：**不要吝啬**。该展开就展开，宁可多写两段有内容的，
也不要为了简短把重要的观察省掉。用 Markdown，小标题 + 短段落，方便他自己回看。`;

  /* 暴露给测试：要能验证「两套人设确实是分开的、而且各自守住了该守的边界」。
     谈话用 friend，小结用 analyst —— 用户明确要求这是两种定位。 */
  D.personas = { friend: SYS_FRIEND, analyst: SYS_ANALYST };

  /** 把一段日记渲染成给 AI 看的文本 */
  function renderEntries(list, opts) {
    const o = opts || {};
    const L = [];
    if (!list.length) return '（这段时间没有写日记）';
    list.forEach(e => {
      L.push(`【${e.date} ${U.dowName(e.date)}】` + (e.mood != null ? `（当天心情自评 ${e.mood}/10）` : ''));
      L.push(e.text.trim());
      L.push('');
      if (o.maxChars && L.join('\n').length > o.maxChars) {
        L.push(`（后面还有 ${list.length - list.indexOf(e) - 1} 天，内容过长已省略）`);
        return;
      }
    });
    return L.join('\n');
  }
  D.renderEntries = renderEntries;

  /** 组装谈话用的 messages（含历史轮次） */
  D.buildChatMessages = async function (gran, k, history, userText) {
    const entries = await D.entriesIn(gran, k);
    const ctx = D.context(gran, k);
    const label = D.label(gran, k);

    const L = [];
    L.push(`# 背景：${label} 的日记`);
    L.push('');
    if (entries.length) {
      L.push(`他这段时间写了 ${entries.length} 天：`);
      L.push('');
      L.push(renderEntries(entries));
    } else {
      L.push('（他这段时间没写日记）');
      L.push('');
    }
    if (ctx) {
      L.push('# 同时期的客观记录（来自他手机里的数据，不是他写的）');
      L.push('');
      L.push(ctx);
      L.push('这些数字是他的实际作息/饮食/任务/开销。他说"累"的时候，你可以看看是不是真的；');
      L.push('他说的和他实际做的不一样时，可以点出来，但别拿数据当证据去审他。');
      L.push('');
    }
    L.push('# 现在他说');
    L.push(String(userText || ''));

    const msgs = [{ role: 'system', content: SYS_FRIEND }];
    (history || []).forEach(m => {
      if (m && (m.role === 'user' || m.role === 'assistant') && m.content) {
        msgs.push({ role: m.role, content: String(m.content) });
      }
    });
    msgs.push({ role: 'user', content: L.join('\n') });
    return msgs;
  };

  /** 直接开始谈（不带历史）时，让 AI 起个头 */
  D.buildOpenPrompt = async function (gran, k) {
    return D.buildChatMessages(gran, k, [], '（我先不说话。你看看这段时间的日记，想说什么就说。别客套，别总结，就像平时聊天那样开口。）');
  };

  /** 组装小结的提示词。为了能稳定解析成 JSON，评分和文本一起要。 */
  D.buildDigestPrompt = async function (gran, k, chats) {
    const entries = await D.entriesIn(gran, k);
    const ctx = D.context(gran, k);
    const label = D.label(gran, k);

    const L = [];
    L.push(`# 任务：给 ${label} 写一份阶段小结`);
    L.push('');
    L.push('这份小结有两个读者：一个是他自己（想看到状态的变化），');
    L.push('一个是系统（要存起来做趋势曲线）。所以文本要真诚，评分要克制。');
    L.push('');
    L.push('## 他写的日记');
    L.push('');
    L.push(entries.length ? renderEntries(entries) : '（这段时间没写）');
    L.push('');
    if (ctx) {
      L.push('## 同时期的客观记录');
      L.push('');
      L.push(ctx);
      L.push('');
    }
    if (chats && chats.length) {
      L.push('## 你之前和他聊过（这些是已保存的谈话）');
      L.push('');
      chats.slice(0, 3).forEach(c => {
        L.push(`--- 谈话（${c.createdAt ? c.createdAt.slice(0, 10) : ''}） ---`);
        (c.messages || []).forEach(m => {
          if (m.role === 'user' || m.role === 'assistant') {
            L.push(`${m.role === 'user' ? '他' : '你'}：${String(m.content).slice(0, 600)}`);
          }
        });
        L.push('');
      });
    }
    L.push('## 输出要求');
    L.push('只输出一个 JSON 对象，不要代码块围栏，不要解释。字段：');
    L.push('');
    L.push('{');
    L.push('  "brief": "他这段时间写了什么。客观简概，2~4 句。只陈述，不评价，不要煽情。",');
    /* 原来这里是「用朋友的口吻，150 字以内」—— 用户反馈「篇幅有点少」，
       而且定位也变了：小结是分析，不是朋友闲聊。所以去掉字数上限，
       并要求按 SYS_ANALYST 那 8 条展开写。 */
    L.push('  "review": "完整的分析，就是这份小结的主体。按上面那 8 条要求展开写：先事实后判断、各维度都要覆盖、日记和客观数据交叉验证、指出与上一阶段相比的变化。用 Markdown 小标题分段。**不要压字数，300~700 字**，宁可长也不要省掉重要观察。",');
    L.push('  "mood": 1到10的整数,   // 整体状态。5 = 平常，7 = 不错，3 = 明显低落');
    L.push('  "emotion": 1到10的整数, // 情绪稳定度与心情');
    L.push('  "energy": 1到10的整数,  // 精力 / 疲劳程度');
    L.push('  "body": 1到10的整数,    // 身体状态（结合作息饮食看，不是单看日记）');
    L.push('  "study": 1到10的整数,   // 学业 / 项目推进');
    L.push('  "social": 1到10的整数,  // 人际 / 情绪支持');
    L.push('  "keywords": ["最多5个短词"],');
    L.push('  "noticed": ["2~5条他自己可能没意识到的事。每条都要写具体：现象 + 你看到的证据 + 这可能意味着什么。没有就给空数组。"]');
    L.push('}');
    L.push('');
    L.push('评分规则（重要）：');
    L.push('- 没有依据就給 5，不要为了好看给高分，也不要为了显得关心给低分。');
    L.push('- 数据不足时（比如整段时间只有一篇日记），在 brief 里说明，评分往 5 靠。');
    L.push('- noticed 只写**有证据**的，比如「连着三天 1 点后睡，那三天的日记都只有一两行」。');
    L.push('  不要写"你需要多休息"这种没有信息量的话。没有就交空数组。');
    L.push('- noticed 是这份小结里他最有价值的部分 —— 写足、写具体，别只写一条敷衍。');
    return L.join('\n');
  };

  /** 宽容地抠出 JSON（AI 常常会加围栏或前后废话） */
  D.parseDigest = function (raw) {
    let s = String(raw == null ? '' : raw).trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    let o;
    try { o = JSON.parse(s); }
    catch (e) { throw new Error('AI 返回的不是合法 JSON：' + String(raw).slice(0, 150)); }

    const num = v => {
      const n = Number(v);
      if (!isFinite(n)) return 5;
      return U.clamp(Math.round(n), 1, 10);
    };
    const out = {
      brief: String(o.brief || '').slice(0, 1200),
      /* 上限放到 6000 字：小结现在要求展开写，原来的 3000 会把它拦腰截断，
         而且截断是**静默**的 —— 用户只会觉得「怎么突然断了」。 */
      review: String(o.review || '').slice(0, 6000),
      keywords: (Array.isArray(o.keywords) ? o.keywords : [])
        .map(x => String(x).slice(0, 12)).filter(Boolean).slice(0, 5),
      /* noticed 从 3 条 × 200 字放到 5 条 × 400 字：用户明确说这部分很好，
         希望内容扩展。 */
      noticed: (Array.isArray(o.noticed) ? o.noticed : [])
        .map(x => String(x).slice(0, 400)).filter(Boolean).slice(0, 5)
    };
    D.DIMS.forEach(d => { out[d.id] = num(o[d.id]); });
    if (!out.brief && !out.review) throw new Error('AI 没给出小结内容');
    return out;
  };

  /** 跑一次谈话（流式回调交给界面） */
  D.runChat = function (messages, onDelta) {
    const c = D.aiCfg();
    return AI.chat(messages, {
      cfg: c, onDelta,
      temperature: c.temperature != null ? c.temperature : 0.85,
      maxTokens: c.maxTokens || 2000,
      timeoutMs: 180000
    });
  };

  /** 跑一次小结（要求 JSON 输出） */
  D.runDigest = async function (gran, k, chats) {
    const c = D.aiCfg();
    const prompt = await D.buildDigestPrompt(gran, k, chats);
    const raw = await AI.chat([
      /* 这里用分析者人设，不是朋友 —— 小结的定位是客观全面的分析。
         谈话仍然走 SYS_FRIEND（见 buildChatMessages），两套刻意分开。 */
      { role: 'system', content: SYS_ANALYST + '\n\n（这次的输出是 JSON，但 review 字段里就是上面要求的那种分析文字。）' },
      { role: 'user', content: prompt }
      /* maxTokens 1800 → 4000：小结篇幅放开了，1800 装不下 300~700 字的分析
         外加评分和 noticed，会在半句上被切断。 */
    ], { cfg: c, temperature: 0.5, json: true, maxTokens: 4000, timeoutMs: 180000 });
    return D.parseDigest(raw);
  };

  global.Diary = D;
})(window);