/* ═══════════════════════════════════════════════
   ics.js — 生成标准 iCalendar (.ics)
   用途：把「晚 6 点未完成检查」与「截止前一天提醒」
        批量导入小米系统日历（息屏也可靠触发）
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const I = {};

  /** ICS 转义：反斜杠、分号、逗号、换行 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /** 折叠长行（RFC 5545：每行 ≤75 字节，续行以空格开头） */
  function fold(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 73) return line;
    const out = [];
    let cur = '', curBytes = 0, limit = 73;
    for (const ch of line) {
      const n = new TextEncoder().encode(ch).length;
      if (curBytes + n > limit) { out.push(cur); cur = ' ' + ch; curBytes = 1 + n; limit = 73; }
      else { cur += ch; curBytes += n; }
    }
    if (cur) out.push(cur);
    return out.join('\r\n');
  }

  /** 时间 → UTC 的 ICS 格式 "YYYYMMDDTHHmmssZ"。
   *  为什么用 UTC 而不是「浮动时间 + VTIMEZONE」：
   *  浮动时间（DTSTART:20261002T180000）在 RFC 5545 里合法，但国产/安卓日历
   *  解析器挑食 —— 文件里一旦出现 VTIMEZONE，有的解析器就要求每个 DTSTART
   *  必须带 TZID 引用，不带就判定整个文件无效。
   *  UTC 是兼容性最好的写法：18:00 北京时间 = 10:00Z，语义完全一样，
   *  而且不再需要一个可能被挑剔的 VTIMEZONE 块。 */
  function dtUtc(d) {
    d = d instanceof Date ? d : U.parse(d);
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  /** Date → 本地时间 ICS 格式 "YYYYMMDDTHHmmss"（浮动时间，目前未使用） */
  function dtLocal(d) {
    d = d instanceof Date ? d : U.parse(d);
    return `${d.getFullYear()}${U.pad(d.getMonth() + 1)}${U.pad(d.getDate())}T${U.pad(d.getHours())}${U.pad(d.getMinutes())}00`;
  }

  /** UTC 时间戳，用于 DTSTAMP */
  function dtStamp(d) {
    d = d || new Date();
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  /**
   * 构建一个 VEVENT
   * @param {object} o {uid,start,end,title,desc,alarms:[{minutes,desc}],allDay,location}
   */
  function vevent(o) {
    const L = [];
    L.push('BEGIN:VEVENT');
    L.push('UID:' + esc(o.uid));
    L.push('DTSTAMP:' + dtStamp());
    if (o.allDay) {
      L.push('DTSTART;VALUE=DATE:' + o.start.replace(/-/g, ''));
      L.push('DTEND;VALUE=DATE:' + o.end.replace(/-/g, ''));
    } else {
      L.push('DTSTART:' + dtUtc(o.start));
      L.push('DTEND:' + dtUtc(o.end));
    }
    L.push('SUMMARY:' + esc(o.title));
    if (o.desc) L.push('DESCRIPTION:' + esc(o.desc));
    if (o.location) L.push('LOCATION:' + esc(o.location));
    L.push('STATUS:CONFIRMED');
    L.push('TRANSP:OPAQUE');
    /* 闹钟是三态，别把「显式不要」和「没指定」混为一谈：
         alarms === undefined  → 没指定，给一条 -PT0M 兜底
         alarms === []         → **明确不要**闹钟（一声都不响）
         alarms === [{...}]    → 用调用方给的
       以前无条件加一条 -PT0M，调用方又各给了一条 minutes:0，
       结果每个事件带**两个同一时刻的闹钟**；而「截止日当天」那条
       本来该是纯展示、不该响的，也被强行加上了一条 09:00 的闹钟 ——
       用户只要求「截止前一天 18:00 提醒」，多响一次就是噪音。 */
    const alarms = (o.alarms === undefined || o.alarms === null)
      ? [{ minutes: 0, desc: o.title }]
      : o.alarms;
    alarms.forEach(a => {
      L.push('BEGIN:VALARM');
      L.push('TRIGGER:' + (a.minutes >= 0 ? '-' : '') + 'PT' + Math.abs(a.minutes) + 'M');
      L.push('ACTION:DISPLAY');
      L.push('DESCRIPTION:' + esc(a.desc || o.title));
      L.push('END:VALARM');
    });
    L.push('END:VEVENT');
    return L;
  }

  function wrap(events, calName) {
    /* 头部尽量精简，只留各家日历都认的那几行。去掉的：
         METHOD  —— 只有 iTIP 调度消息才需要；带上它，有的客户端会把
                    「导入」当成「订阅更新」处理。Google 的导出也不带。
         VTIMEZONE / X-WR-TIMEZONE —— 时间已经用 UTC，不再引用任何 TZID；
                    留一个没人引用的时区块只会多一个被挑刺的机会。 */
    const head = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LifeHub//Personal Planner//CN',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:' + esc(calName || 'LifeHub 计划')
    ];
    const tail = ['END:VCALENDAR'];
    return head.concat(events, tail).map(fold).join('\r\n');
  }

  /* ═══════════════════════════════════════════
     主入口：把当前数据渲染成日历事件
     ═══════════════════════════════════════════ */

  /**
   * @param {object} opts
   *   days        {number}  未来覆盖天数（默认取设置）
   *   includeDaily {bool} 是否生成日常活动提醒（每天 18:00）
   *   includeDeadline{bool} 是否生成截止前一天提醒
   *   includeTasks {bool}   是否把任务本身也放进日历
   */
  /* ═══════════ 提醒策略（这一节决定导出什么） ═══════════
     用户的规则：
       ① 有确切截止日的任务 → 只在「截止前一天 18:00」提醒一次
       ② 手动标记为「日常活动」的 → 每天 18:00 提醒（打卡用）
       ③ 长期任务（没截止没时间） → 不提醒、不排期，只在 App 里的长期栏显示

     注意与旧版的区别：旧版会给「每一天有未完成任务」都生成一个 18:00 事件，
     噪音很大（一导日历天天响）。现在只保留上面两类。 */
  I.buildEvents = function (opts = {}) {
    const st = S.settings.remind;
    const days = opts.days || st.lookaheadDays || 30;
    const includeDaily = opts.includeDaily !== false;
    const includeDeadline = opts.includeDeadline !== false;
    const includeTasks = opts.includeTasks !== false;

    const today = U.today();
    const events = [];
    const stamp = Date.now().toString(36);
    const hour = st.eveningHour != null ? st.eveningHour : 18;
    const minute = st.eveningMinute != null ? st.eveningMinute : 0;

    /* ── ① 日常活动：每天 18:00 一个提醒，列出所有日常项 ── */
    if (includeDaily) {
      const daily = S.dailyTasks();
      if (daily.length) {
        for (let i = 0; i < days; i++) {
          const day = U.addDays(today, i);
          const ds = U.ymd(day);
          const start = new Date(day); start.setHours(hour, minute, 0, 0);
          const end = new Date(start.getTime() + 15 * 60000);

          const lines = daily.map(t => {
            const cat = S.CATS[t.cat] || S.CATS.life;
            return `· ${t.title}（${cat.short}）`;
          });
          const desc = `今天要做的日常：\n\n${lines.join('\n')}\n\n` +
            `共 ${daily.length} 项，做完记得在 LifeHub 打勾\n\n来自 LifeHub`;

          events.push({
            uid: `daily-${ds}-${stamp}@lifehub`,
            start, end,
            title: `🔁 日常活动 ${daily.length} 项`,
            desc,
            alarms: [{ minutes: 0, desc: '今天的日常活动' }]
          });
        }
      }
    }

    /* ── ② 有截止日的任务：截止前一天 18:00 提醒 ── */
    if (includeDeadline) {
      const limit = U.addDays(today, days + 3);
      S.all('tasks').forEach(t => {
        /* 已完成的不再提醒 —— 以前这里只看 kindOf 和 due，
           完成的任务照样会弹出「明天截止」。 */
        if (t.done) return;
        if (S.kindOf(t) !== 'deadline') return;
        const due = U.parse(t.due);
        if (!due || due > limit || due < U.addDays(today, -1)) return;

        /* 提醒时刻 = 截止日的前一天 18:00 */
        const remindAt = U.addDays(due, -1);
        remindAt.setHours(hour, minute, 0, 0);
        if (remindAt < new Date()) return;               // 已经过去就不导了

        const end = new Date(remindAt.getTime() + 15 * 60000);
        const cat = S.CATS[t.cat] || S.CATS.life;
        const hasTime = String(t.due).includes('T');

        events.push({
          uid: `ddl-${t.id}-${stamp}@lifehub`,
          start: remindAt, end,
          title: `⚠️ 明天截止：${t.title}`,
          desc: `截止时间：${U.friendly(t.due)}${hasTime ? ' ' + U.hm(t.due) : ''}\n` +
                `分类：${cat.name}\n` +
                (t.location ? `地点：${t.location}\n` : '') +
                (t.note ? `\n备注：${t.note}\n` : '') + '\n来自 LifeHub',
          alarms: [{ minutes: 0, desc: '明天截止：' + t.title }]
        });
      });
    }

    /* ── ③ 具体任务事件（可关；长期任务永远不进来） ── */
    if (includeTasks) {
      const from = U.ymd(today);
      const to = U.ymd(U.addDays(today, days));
      S.all('tasks').forEach(t => {
        const kind = S.kindOf(t);
        /* 长期任务不排期，自然也不进日历 */
        if (kind === 'longterm') return;
        /* 日常活动已经由 ① 统一提醒，不再生成单条事件 */
        if (kind === 'daily') return;
        /* 已完成的不再占日历格子 —— 日历是用来看「还要做什么」的，
           已完成的任务留在 App 里当记录就够了，导进去只会造成混乱
           （比如取消勾选后还要手动去系统日历里删）。 */
        if (t.done) return;

        const ds = (t.start || t.due || '').slice(0, 10);
        if (!ds || ds < from || ds > to) return;
        const cat = S.CATS[t.cat] || S.CATS.life;

        let start, end;
        if (t.start && t.start.includes('T')) {
          start = U.parse(t.start);
          end = t.end && t.end.includes('T') ? U.parse(t.end) : new Date(start.getTime() + (t.duration || 60) * 60000);
        } else {
          start = new Date(U.parse(ds)); start.setHours(9, 0, 0, 0);
          end = new Date(start.getTime() + 30 * 60000);
        }

        events.push({
          uid: `task-${t.id}@lifehub`,
          start, end,
          title: (t.done ? '✓ ' : '') + t.title,
          desc: `分类：${cat.name}\n优先级：${(S.PRIORITY[t.priority] || S.PRIORITY[1]).name}\n` +
                (t.note ? `\n${t.note}\n` : '') + '\n来自 LifeHub',
          alarms: t.start ? [{ minutes: 10, desc: t.title }] : []
        });
      });
    }

    return events;
  };

  /** 生成完整 .ics 文本 */
  I.generate = function (opts = {}) {
    const events = I.buildEvents(opts);
    return { text: wrap(events.flatMap(e => vevent(e)), 'LifeHub 计划'), count: events.length };
  };

  /** 生成并下载 */
  I.download = function (opts = {}) {
    const { text, count } = I.generate(opts);
    /* MIME 只写 text/calendar，**不带 charset 参数**。
       安卓下载时会把 Blob 的 type 写进 MediaStore；带 `;charset=utf-8`
       有可能被记成 application/octet-stream，于是日历的文件选择器
       （按 text/calendar 过滤）看不到这个文件 —— 表现就是「没有可导入的文件」。 */
    U.download(`lifehub-${U.ymd(new Date())}.ics`, text, 'text/calendar');
    return count;
  };

  /** 设备支持把文件分享出去吗（安卓上这条路比下载可靠得多） */
  I.canShare = function () {
    try {
      if (typeof File === 'undefined' || !navigator.canShare) return false;
      const probe = new File(['x'], 'p.ics', { type: 'text/calendar' });
      return !!navigator.canShare({ files: [probe] });
    } catch (e) { return false; }
  };

  /** 生成 .ics 并交给**系统分享面板**。
   *
   *  为什么还要这一条路：
   *  在「添加到主屏幕」的独立窗口里，blob: + <a download> 这条下载路径在
   *  安卓上并不可靠 —— 有时存不下来、有时存成 0 字节、有时落在应用自己的
   *  私有目录里，系统日历的文件选择器根本看不到。
   *  分享面板是原生能力：可以直接「分享到小米日历」，也可以存进文件管理，
   *  不依赖浏览器把文件写到哪里。
   *
   *  返回 {ok, reason, count}，reason 用来区分「不支持」和「用户取消了」。 */
  I.share = async function (opts = {}) {
    const { text, count } = I.generate(opts);
    if (!I.canShare()) return { ok: false, reason: 'unsupported', count };
    const file = new File([text], `lifehub-${U.ymd(new Date())}.ics`, { type: 'text/calendar' });
    try {
      await navigator.share({ files: [file], title: 'LifeHub 计划' });
      return { ok: true, count };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, reason: 'cancel', count };
      return { ok: false, reason: (e && e.message) || '分享失败', count };
    }
  };

  /** 生成 Google 日历 / 其它在线日历可订阅的单文件（同上，语义一致） */
  I.preview = function (opts = {}) {
    const events = I.buildEvents(opts);
    return events.map(e => ({
      date: U.ymd(e.start),
      time: U.hm(e.start),
      title: e.title,
      kind: e.uid.startsWith('daily') ? 'daily'
          : e.uid.startsWith('ddl') ? 'deadline'
          : 'task'
    })).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  };

  global.ICS = I;
})(window);