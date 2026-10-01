/* ═══════════════════════════════════════════════
   schedule.js — 智能排期引擎
   ───────────────────────────────────────────────
   职责：给任务推荐「什么时候做」，并避开有课时段。

   任务的三种时间形态：
     1. 只有截止时间 (due)        → 推荐一个早于截止的完成时段
     2. 只有安排时间 (plannedAt)  → 就按这个排
     3. 两者都有                  → 都记下，完成时段必须在截止前
     4. 都没有                    → 主动推荐一个完成时间

   排期硬约束：不排到有课的时间（来自课程表导入）。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const Sch = {};

  /* ───── 可排期的时段（一天里适合做事的窗口） ─────
     早上从 8:00 起，不排 7 点——大学生 7 点做深度任务不现实。 */
  const WINDOWS = [
    { id: 'morning', name: '早上', from: 8 * 60, to: 11 * 60 + 30 },
    { id: 'noon', name: '午间', from: 12 * 60 + 30, to: 13 * 60 + 50 },
    { id: 'afternoon', name: '下午', from: 14 * 60, to: 17 * 60 + 30 },
    { id: 'evening', name: '晚上', from: 19 * 60, to: 22 * 60 + 30 }
  ];

  /* 按分类给个默认时长（分钟） */
  const DEFAULT_DURATION = { study: 90, cv: 120, life: 30 };

  /* ═══════════ 时间工具 ═══════════ */

  function toMin(hhmm) {
    if (!hhmm) return null;
    const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
    return m ? (+m[1] * 60 + +m[2]) : null;
  }
  function toHHMM(min) {
    /* 兜底取整：调用方可能传进小数（比如按比例算出来的时长），
       不取整会格式化出 "08:37.5" 这种非法时间。 */
    const m = Math.round(Number(min) || 0);
    return U.pad(Math.floor(m / 60)) + ':' + U.pad(m % 60);
  }

  /** 从任务里取出「当天的时间窗口」[startMin, endMin] */
  function taskSpan(task) {
    const s = toMin((task.start || '').slice(11, 16));
    const e = toMin((task.end || task.due || '').slice(11, 16));
    if (s != null && e != null && e > s) return [s, e];
    if (s != null) return [s, s + (task.duration || DEFAULT_DURATION[task.cat] || 60)];
    if (e != null) return [Math.max(0, e - (task.duration || DEFAULT_DURATION[task.cat] || 60)), e];
    return null;
  }

  /* ═══════════ 课程表（排期约束） ═══════════ */

  /**
   * 取某天的课程占用时段
   * 课程数据存在 settings.timetable.courses 里：
   *   { name, weekday(1-7), start:{h,m}, end:{h,m}, weeks:[...], location }
   * @returns {Array<{from,to,name}>} 分钟区间
   */
  Sch.busyOn = function (dateStr) {
    const tt = (S.settings.timetable || {});
    const courses = tt.courses || [];
    if (!courses.length) return [];

    const d = U.parse(dateStr);
    const wd = d.getDay() === 0 ? 7 : d.getDay();     // 周一=1 … 周日=7

    /* 当前是第几周（相对开学第一周） */
    let weekNo = null;
    if (tt.termStart) {
      const diff = U.diffDays(tt.termStart, dateStr);
      if (diff >= 0) weekNo = Math.floor(diff / 7) + 1;
    }

    const out = [];
    courses.forEach(c => {
      if (c.weekday !== wd) return;
      if (weekNo != null && c.weeks && c.weeks.length && c.weeks.indexOf(weekNo) < 0) return;
      const from = (c.start.h || 0) * 60 + (c.start.m || 0);
      const to = (c.end.h || 0) * 60 + (c.end.m || 0);
      if (to > from) out.push({ from, to, name: c.name, location: c.location || '' });
    });
    return out.sort((a, b) => a.from - b.from);
  };

  /** 合并重叠的占用区间 */
  function mergeBusy(busy) {
    if (!busy.length) return [];
    const sorted = busy.slice().sort((a, b) => a.from - b.from);
    const out = [Object.assign({}, sorted[0])];
    for (let i = 1; i < sorted.length; i++) {
      const last = out[out.length - 1];
      if (sorted[i].from <= last.to) last.to = Math.max(last.to, sorted[i].to);
      else out.push(Object.assign({}, sorted[i]));
    }
    return out;
  }

  /** 某天已排的任务占用（不含有课） */
  function taskBusyOn(dateStr, opts) {
    const skipId = opts && opts.skipId;
    return S.tasksOn(dateStr)
      .filter(t => t.id !== skipId && !t.done)
      .map(t => {
        const span = taskSpan(t);
        return span ? { from: span[0], to: span[1], name: t.title, isTask: true } : null;
      })
      .filter(Boolean);
  }

  /* ═══════════ 找空档 ═══════════ */

  /**
   * 在指定日期找可用空档
   * @param {string} dateStr
   * @param {number} needMin 需要的分钟数
   * @param {object} opts { skipId, ignoreCourses, ignoreTasks, preferWindow }
   * @returns {Array<{from,to,window}>} 可用区间，按开始时间排序
   */
  Sch.freeSlots = function (dateStr, needMin, opts) {
    const o = opts || {};
    needMin = needMin || 60;

    let busy = [];
    if (!o.ignoreCourses) busy = busy.concat(Sch.busyOn(dateStr));
    if (!o.ignoreTasks) busy = busy.concat(
      taskBusyOn(dateStr, o).map(b => ({ from: b.from, to: b.to, name: b.name, isTask: true }))
    );
    busy = mergeBusy(busy);

    /* 今天的话，已经过去的时间不能再排；留 30 分钟缓冲，避免刚排上就过期 */
    let nowMin = -1;
    if (dateStr === U.ymd(U.today())) {
      const n = new Date();
      nowMin = n.getHours() * 60 + n.getMinutes() + 30;
    }

    const slots = [];
    /* 空档只取「够用就好」的长度，不要把整个上午都给一件小事。
       例如取快递只要 30 分钟，就不该占掉 08:00-11:30 整个窗口。
       但也留一点余量，免得排得刚刚好、稍微拖一下就挤压下一件事。
       注意要取整到 5 分钟：needMin*1.25 会产生 37.5 这种小数，
       直接格式化会得到 "08:37.5" 这种非法时间。 */
    const pad = Math.max(needMin, Math.min(needMin + 15, Math.ceil(needMin * 1.25 / 5) * 5));
    const take = Math.round(pad / 5) * 5;

    WINDOWS.forEach(w => {
      if (o.preferWindow && w.id !== o.preferWindow) return;

      /* 把窗口按 busy 切碎 */
      let cursor = w.from;
      const blockers = busy
        .filter(b => b.to > w.from && b.from < w.to)
        .sort((a, b) => a.from - b.from);

      blockers.forEach(b => {
        if (b.from > cursor) {
          const gapEnd = Math.min(b.from, w.to);
          if (gapEnd - cursor >= needMin) {
            slots.push({ from: cursor, to: Math.min(cursor + take, gapEnd), window: w.id });
          }
        }
        cursor = Math.max(cursor, b.to);
      });
      if (cursor < w.to && (w.to - cursor) >= needMin) {
        slots.push({ from: cursor, to: Math.min(cursor + take, w.to), window: w.id });
      }
    });

    return slots
      .filter(s => nowMin < 0 || s.to > nowMin)      // 丢掉已经过去的时段
      .map(s => (nowMin > s.from ? Object.assign({}, s, { from: nowMin }) : s))
      /* 补上可读的时间文本，方便调用方直接展示（之前只有 from/to 两个数字） */
      .map(s => Object.assign(s, {
        fromText: toHHMM(s.from),
        toText: toHHMM(s.to),
        minutes: s.to - s.from
      }));
  };

  /* ═══════════ 推荐完成时间 ═══════════ */

  /**
   * 给一个任务推荐完成时段
   *
   * 规则：
   *  - 有 plannedAt（用户自己安排的时间）→ 直接用，但检查是否撞课
   *  - 只有 due → 从「今天」开始往前找，最晚不超过截止前一天；
   *                离截止越近优先级越高，但优先选较早的空档（避免拖到最后）
   *  - 都没有 → 从今天开始找，按分类的紧急度决定最多往后推几天
   *
   * @returns {object|null} {
   *   date, from, to, fromText, toText, window,
   *   reason, conflicts: [], confidence
   * }
   */
  Sch.suggest = function (task, opts) {
    const o = opts || {};
    /* 长期任务和日常活动本来就不该有「完成时段」。
       返回 null 让调用方知道「这条不需要排」，而不是硬塞一个时间。 */
    const kind = S.kindOf(task);
    if (kind === 'longterm' || kind === 'daily') return null;

    const today = U.ymd(U.today());
    const dur = task.duration || DEFAULT_DURATION[task.cat] || 60;

    /* ── 情况 1：用户已指定安排时间 ── */
    const planned = task.plannedAt || (task.start && task.start);
    if (planned) {
      const ds = planned.slice(0, 10);
      const span = taskSpan(task) || [toMin(planned.slice(11, 16)) || 9 * 60, (toMin(planned.slice(11, 16)) || 9 * 60) + dur];
      const conflicts = Sch.busyOn(ds).filter(b => b.to > span[0] && b.from < span[1]);
      return {
        date: ds,
        from: span[0], to: span[1],
        fromText: toHHMM(span[0]), toText: toHHMM(span[1]),
        window: windowOf(span[0]),
        reason: conflicts.length
          ? `你安排的时间与「${conflicts.map(c => c.name).join('、')}」冲突`
          : '按你安排的时间',
        conflicts,
        confidence: conflicts.length ? 'conflict' : 'exact'
      };
    }

    /* ── 情况 2 / 3：有截止时间 ── */
    if (task.due) {
      const dueDate = task.due.slice(0, 10);
      const dueMin = toMin(task.due.slice(11, 16));      // 截止当天若带时刻

      /* 搜索范围：今天 → 截止前一天（若截止就是今天，则只搜今天）。
         但对「截止还很远」的任务，一上来就排到今天没有意义
         （比如 169 天后交的大作业，今天排它只会挤掉真正紧急的事）。
         所以在截止日较远时，把搜索起点推迟到「截止前 N 天」，
         N 依据任务类别的工作量来定。 */
      const spanDays = Math.max(0, U.diffDays(today, dueDate));
      const lastDay = spanDays <= 0 ? today : U.ymd(U.addDays(U.parse(dueDate), -1));
      const searchEnd = spanDays <= 0 ? dueDate : lastDay;

      /* 提前量：cv 类通常要整块时间，study 类次之，生活杂事临近再说 */
      const leadDays = task.cat === 'cv' ? 10 : task.cat === 'study' ? 5 : 2;
      /* 只有截止日离得足够远时才推迟起点，否则会跳过整个可排区间 */
      const startDate = spanDays > leadDays * 2
        ? U.ymd(U.addDays(U.parse(dueDate), -leadDays))
        : today;

      const found = searchDays(startDate, searchEnd, dur, task, o, dueMin);
      if (found) {
        found.reason = spanDays <= 0
          ? '今天截止，尽快完成'
          : `截止 ${U.friendly(dueDate)}，建议提前 ${U.diffDays(found.date, dueDate)} 天完成`;
        found.confidence = spanDays <= 0 ? 'urgent' : 'before-due';
        return found;
      }

      /* 推迟起点后没排下（比如那段正好满课），退回到从头找 */
      if (startDate !== today) {
        const wider = searchDays(today, searchEnd, dur, task, o, dueMin);
        if (wider) {
          wider.reason = `截止 ${U.friendly(dueDate)}，截止前找空档`;
          wider.confidence = 'before-due';
          return wider;
        }
      }

      /* 截止前实在排不下，就退回截止当天 */
      const fallback = searchDays(dueDate, dueDate, dur, task, o, dueMin);
      if (fallback) {
        fallback.reason = '截止前没有空档，只能排在截止当天';
        fallback.confidence = 'tight';
        return fallback;
      }
      return null;
    }

    /* ── 情况 4：完全没有时间信息 ── */
    const horizon = task.cat === 'cv' ? 7 : task.cat === 'study' ? 5 : 3;
    const end = U.ymd(U.addDays(U.today(), horizon));
    const free = searchDays(today, end, dur, task, o, null);
    if (free) {
      free.reason = '你没给时间，我挑了个空档';
      free.confidence = 'suggested';
      return free;
    }
    return null;
  };

  /** 在 [fromDate, toDate] 里逐天找空档 */
  function searchDays(fromDate, toDate, dur, task, opts, beforeMin) {
    const o = opts || {};
    let cur = fromDate;
    let guard = 0;
    while (guard++ < 120) {
      let slots = Sch.freeSlots(cur, dur, o);
      /* 截止当天如果有具体时刻，只能排在那之前 */
      if (beforeMin != null && cur === toDate && o.dueDateIsLast) {
        slots = slots.filter(s => s.to <= beforeMin);
      }
      /* 优先选同分类偏好的时段 */
      const prefer = preferWindowFor(task.cat);
      if (prefer) {
        const hit = slots.find(s => s.window === prefer);
        if (hit) return slotResult(cur, hit);
      }
      if (slots.length) {
        /* 选最靠前的空档，但避免刚起床/刚下课的整点，取整到 5 分钟 */
        return slotResult(cur, slots[0]);
      }
      if (cur >= toDate) break;
      cur = U.ymd(U.addDays(U.parse(cur), 1));
    }
    return null;
  }

  function slotResult(date, slot) {
    return {
      date,
      from: slot.from,
      to: Math.min(slot.to, slot.from + 1e9),
      fromText: toHHMM(slot.from),
      toText: toHHMM(slot.to),
      window: slot.window
    };
  }

  function preferWindowFor(cat) {
    if (cat === 'cv') return 'evening';      // 深度内容放晚上
    if (cat === 'study') return 'afternoon';
    return null;
  }

  function windowOf(min) {
    const w = WINDOWS.find(x => min >= x.from && min < x.to);
    return w ? w.id : '';
  }

  Sch.windowName = function (id) {
    const w = WINDOWS.find(x => x.id === id);
    return w ? w.name : '';
  };

  /* ═══════════ 批量排期 ═══════════ */

  /**
   * 给一批任务统一排期：按优先级和紧急度排序，逐个找空档，
   * 且已排的会占用时间，避免互相重叠。
   */
  Sch.plan = function (tasks, opts) {
    const o = opts || {};
    const sorted = tasks.slice().sort((a, b) => {
      /* 截止日近的优先，其次优先级高的 */
      const da = a.due || '9999', db_ = b.due || '9999';
      if (da !== db_) return da.localeCompare(db_);
      return (b.priority || 0) - (a.priority || 0);
    });

    const out = [];
    const reserved = [];      // 本次已占用的 {date, from, to}

    sorted.forEach(t => {
      /* 长期任务和日常活动都不排具体时段：
           长期任务 → 没打算现在做，排了只会占掉真正要紧的事
           日常活动 → 每天都要做，不需要挑某一天 */
      const kind = S.kindOf(t);
      if (kind === 'longterm' || kind === 'daily') {
        out.push({
          task: t, slot: null,
          reason: kind === 'daily' ? '日常活动，每天晚 6 点提醒' : '长期任务，放进长期栏'
        });
        return;
      }

      const dur = t.duration || DEFAULT_DURATION[t.cat] || 60;
      const s = Sch.suggest(t, {
        skipId: t.id,
        ignoreCourses: o.ignoreCourses,
        ignoreTasks: o.ignoreTasks
      });

      if (!s) { out.push({ task: t, slot: null, reason: '找不到合适时间' }); return; }

      /* 若与本次已排的撞车，就在「推荐日及其后几天」内另找空档，
         而不是直接放弃——这是批量排期必须做的事，否则一天排满后面的全丢。 */
      if (reserved.some(r => r.date === s.date && r.to > s.from && r.from < s.to)) {
        const alt = findAlternative(s.date, t, reserved, o);
        if (alt) {
          alt.reason = s.reason;
          alt.confidence = s.confidence;
          out.push({ task: t, slot: alt });
          reserved.push({ date: alt.date, from: alt.from, to: alt.to });
          return;
        }
        out.push({ task: t, slot: null, reason: '找不到不重叠的时间' });
        return;
      }

      out.push({ task: t, slot: s });
      reserved.push({ date: s.date, from: s.from, to: s.to });
    });

    return out;
  };

  /**
   * 从 startDate 起往后找若干天，找一个既不撞课、也不与本次已排重叠的空档。
   * 搜索上限 14 天。
   */
  function findAlternative(startDate, task, reserved, opts) {
    const o = opts || {};
    const dur = task.duration || DEFAULT_DURATION[task.cat] || 60;
    const prefer = preferWindowFor(task.cat);

    for (let i = 0; i < 14; i++) {
      const ds = U.ymd(U.addDays(U.parse(startDate), i));

      /* 不要排到截止日之后 */
      if (task.due && ds > task.due.slice(0, 10)) break;

      const slots = Sch.freeSlots(ds, dur, {
        skipId: task.id,
        ignoreCourses: o.ignoreCourses,
        ignoreTasks: o.ignoreTasks
      }).filter(sl => !reserved.some(r => r.date === ds && r.to > sl.from && r.from < sl.to));

      if (!slots.length) continue;

      /* 优先挑分类偏好的时段 */
      const hit = prefer ? slots.find(sl => sl.window === prefer) : null;
      return slotResult(ds, hit || slots[0]);
    }
    return null;
  }

  /**
   * 把排期结果写回任务
   * @param {Array} planned Sch.plan() 的输出
   * @param {boolean} applyAll 是否连无时间的也一起写
   */
  Sch.apply = function (planned, applyAll) {
    let n = 0;
    planned.forEach(p => {
      if (!p.slot) return;
      if (!applyAll && p.task.due && p.task.start) return;   // 已有明确时间的跳过
      const t = S.find('tasks', p.task.id);
      if (!t) return;
      /* 有 due 的保留 due，把建议时段写进 start */
      t.start = `${p.slot.date}T${p.slot.fromText}`;
      t.suggested = true;
      t.suggestReason = p.slot.reason || '';
      if (!t.due) t.due = `${p.slot.date}T${p.slot.toText}`;
      t.updatedAt = new Date().toISOString();
      n++;
    });
    if (n) S.saveNow();
    return n;
  };

  /* ═══════════ 冲突检查 ═══════════ */

  /** 检查所有未完成任务是否与课程冲突 */
  Sch.findConflicts = function () {
    const out = [];
    S.all('tasks').filter(t => !t.done && (t.start || t.due)).forEach(t => {
      const ds = (t.start || t.due).slice(0, 10);
      const span = taskSpan(t);
      if (!span) return;
      const busy = Sch.busyOn(ds);
      const hit = busy.filter(b => b.to > span[0] && b.from < span[1]);
      if (hit.length) out.push({ task: t, date: ds, courses: hit });
    });
    return out;
  };

  /** 课表是否已导入 */
  Sch.hasTimetable = function () {
    const tt = S.settings.timetable || {};
    return !!(tt.courses && tt.courses.length);
  };

  Sch.DEFAULT_DURATION = DEFAULT_DURATION;
  Sch.WINDOWS = WINDOWS;

  global.Sch = Sch;
})(window);