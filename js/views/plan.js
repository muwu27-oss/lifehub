/* ═══════════════════════════════════════════════
   views/plan.js — 计划：日历 / 列表 / 任务编辑 / 日历导出
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const Views = global.Views || (global.Views = {});

  /* 视图内部状态 */
  const st = {
    mode: 'list',        // list | calendar
    filter: 'all',       // all | study | cv | life | open | done
    calMonth: null,      // {y, m}
    selDate: null
  };

  Views.plan = function () {
    const root = U.$('#view-plan');
    if (!st.calMonth) {
      const n = new Date();
      st.calMonth = { y: n.getFullYear(), m: n.getMonth() };
    }
    if (!st.selDate) st.selDate = U.ymd(U.today());

    /* ───── 顶部：视图切换 + 日历导出 ───── */
    root.appendChild(U.el('div', { class: 'row', style: { marginBottom: '12px' } }, [
      App.seg([
        { value: 'list', label: '列表' },
        { value: 'calendar', label: '日历' },
        { value: 'long', label: '长期' }
      ], st.mode, v => { st.mode = v; App.refresh(); }),
      U.el('button', {
        class: 'btn ghost', style: { flexShrink: '0', padding: '0 13px' },
        title: '导出到系统日历',
        onclick: openICSExport
      }, [U.svg(['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16'], { sw: '1.9' })])
    ]));

    /* 长期模式不按分类筛，直接看全部长期任务 */
    if (st.mode === 'long') {
      renderLong(root);
      root.appendChild(U.el('button', {
        class: 'btn primary block', style: { marginTop: '14px' },
        text: '＋ 新建长期任务',
        onclick: () => Views.editTask(null, { kind: 'longterm' })
      }));
      return;
    }

    /* ───── 筛选 ───── */
    root.appendChild(App.chips([
      { value: 'all', label: '全部' },
      { value: 'open', label: '未完成' },
      { value: 'study', label: '通用学习' },
      { value: 'cv', label: 'CV·具身' },
      { value: 'life', label: '日常' },
      { value: 'done', label: '已完成' }
    ], st.filter, v => { st.filter = v; App.refresh(); }));

    if (st.mode === 'calendar') renderCalendar(root);
    else renderList(root);

    /* 悬浮新增 */
    root.appendChild(U.el('button', {
      class: 'btn primary block', style: { marginTop: '14px' },
      text: '＋ 新建任务',
      onclick: () => Views.editTask(null, { due: st.selDate })
    }));
  };

  /* ═══════════ 列表模式 ═══════════ */
  function renderList(root) {
    let list = S.all('tasks').slice();

    if (st.filter === 'open') list = list.filter(t => !t.done);
    else if (st.filter === 'done') list = list.filter(t => t.done);
    else if (st.filter !== 'all') list = list.filter(t => t.cat === st.filter);

    if (!list.length) {
      root.appendChild(App.empty('这里还没有任务', '点「导入」粘贴群消息，或新建一个任务'));
      return;
    }

    list.sort(S.cmpTask);

    /* 按时间分组 */
    const today = U.ymd(U.today());
    const groups = {
      overdue: [], today: [], week: [], later: [], nodate: [], done: []
    };
    list.forEach(t => {
      if (t.done) { groups.done.push(t); return; }
      const d = (t.start || t.due || '').slice(0, 10);
      if (!d) { groups.nodate.push(t); return; }
      if (d < today) groups.overdue.push(t);
      else if (d === today) groups.today.push(t);
      else if (U.diffDays(today, d) <= 7) groups.week.push(t);
      else groups.later.push(t);
    });

    const sections = [
      ['overdue', '已逾期', 'var(--danger)'],
      ['today', '今天', 'var(--brand)'],
      ['week', '未来 7 天', ''],
      ['later', '更远', ''],
      ['nodate', '无日期', ''],
      ['done', `已完成（${groups.done.length}）`, '']
    ];

    sections.forEach(([key, label, color]) => {
      const arr = groups[key];
      if (!arr.length) return;
      root.appendChild(U.el('div', {
        class: 'section-label',
        style: color ? { color } : {},
        text: `${label} · ${arr.length}`
      }));
      arr.slice(0, key === 'done' ? 12 : 50).forEach(t => root.appendChild(Views.taskRow(t, key === 'overdue')));
      if (key === 'done' && arr.length > 12) {
        root.appendChild(U.el('div', {
          style: { fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', padding: '6px' },
          text: `还有 ${arr.length - 12} 项已完成`
        }));
      }
    });
  }

  /* ═══════════ 长期任务模式 ═══════════
     长期任务的语义：没有截止日、没安排时间，不排期、不提醒。
     它们只是「我迟早要做的事」清单，靠优先级和顺序来表达「先做哪个」。

     所以这个页面的重点是**排序**：
       ↑↓ 手动调顺序（可以直接跟优先级联动，见下）
       点优先级标签直接改优先级
     两者都保留 —— 有些人习惯「就按优先级排」，有些人想「手动微调顺序」。 */
  function renderLong(root) {
    const list = S.longTerm();

    /* 说明条：让用户知道这一类为什么没有时间 */
    root.appendChild(U.el('div', {
      class: 'card tight',
      style: { marginBottom: '10px', fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.6' }
    }, [
      U.el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', color: 'var(--text)' },
        html: '<b>长期任务</b>'
      }),
      U.el('div', {
        text: '没有截止日、也没定时间的任务放这里。不会排期、不会提醒，' +
              '你想做的时候再手动安排。用 ↑↓ 调整顺序，或直接点优先级标签。'
      })
    ]));

    if (!list.length) {
      root.appendChild(App.empty('还没有长期任务',
        '导入时没有截止日的事项会自动进这里，也可以点下面「新建长期任务」'));
      return;
    }

    /* 按优先级分组的视觉提示 */
    list.forEach((t, i) => {
      root.appendChild(longRow(t, i, list.length));
    });

    /* 底部：一键按优先级重排 */
    if (list.length > 1) {
      root.appendChild(U.el('button', {
        class: 'btn ghost block', style: { marginTop: '10px' },
        text: '按优先级重排',
        onclick: () => {
          const arr = S.longTerm();
          /* 稳定排序：优先级高的在前，同优先级保持当前顺序 */
          arr.forEach((t, idx) => { t.order = idx; });
          arr.sort((a, b) => {
            const pa = a.priority || 0, pb = b.priority || 0;
            if (pa !== pb) return pb - pa;
            return a.order - b.order;
          });
          arr.forEach((t, idx) => { t.order = idx; });
          S.save();
          App.refresh();
          U.toast('已按优先级重排', 'ok');
        }
      }));
    }
  }

  /** 长期任务的一行：标题 + 分类 + 优先级标签 + 上下移动 */
  function longRow(t, idx, total) {
    const cat = S.CATS[t.cat] || S.CATS.life;

    const prio = U.el('button', {
      class: 'badge',
      style: { cursor: 'pointer', border: 'none', flexShrink: '0' },
      text: (S.PRIORITY[t.priority] || S.PRIORITY[1]).name,
      title: '点击切换优先级',
      onclick: e => {
        e.stopPropagation();
        /* 紧急 → 重要 → 普通 → 随意 → 紧急 循环 */
        const order = [3, 2, 1, 0];
        const cur = order.indexOf(t.priority == null ? 1 : t.priority);
        t.priority = order[(cur + 1) % order.length];
        S.save();
        App.refresh();
      }
    });
    const pc = (S.PRIORITY[t.priority] || S.PRIORITY[1]).color;
    if (pc) { prio.style.color = pc; prio.style.background = 'transparent'; }

    const nums = U.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: '0' } }, [
      U.el('button', {
        class: 'icon-btn sm', disabled: idx === 0 ? 'disabled' : null,
        style: { opacity: idx === 0 ? '.3' : '1', padding: '0', width: '22px', height: '18px' },
        html: '▲', title: '上移',
        onclick: e => { e.stopPropagation(); if (S.moveLongTerm(t.id, -1)) App.refresh(); }
      }),
      U.el('button', {
        class: 'icon-btn sm', disabled: idx === total - 1 ? 'disabled' : null,
        style: { opacity: idx === total - 1 ? '.3' : '1', padding: '0', width: '22px', height: '18px' },
        html: '▼', title: '下移',
        onclick: e => { e.stopPropagation(); if (S.moveLongTerm(t.id, 1)) App.refresh(); }
      })
    ]);

    return U.el('div', {
      class: 'card tight',
      style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', cursor: 'pointer' },
      onclick: () => Views.editTask(t.id)
    }, [
      nums,
      U.el('div', { style: { flex: '1', minWidth: '0' } }, [
        U.el('div', {
          style: { fontWeight: '600', fontSize: '14.5px', marginBottom: '3px' },
          text: t.title
        }),
        U.el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, [
          U.el('span', {
            class: 'badge', text: cat.short,
            style: { color: cat.hex, background: 'transparent' }
          }),
          (function () {
            if (!t.parentId) return null;
            const p = S.parent(t);
            return p ? U.el('span', {
              style: { fontSize: '11.5px', color: 'var(--text-faint)' },
              text: '↳ ' + p.title
            }) : null;
          })()
        ])
      ]),
      prio
    ]);
  }

  /* ═══════════ 日历模式 ═══════════ */
  function renderCalendar(root) {
    const { y, m } = st.calMonth;

    /* 月份切换 */
    root.appendChild(U.el('div', {
      class: 'card tight',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }
    }, [
      U.el('button', {
        class: 'icon-btn sm', onclick: () => { shiftMonth(-1); App.refresh(); }
      }, [U.svg('M15 6l-6 6 6 6', { sw: '2.2' })]),
      U.el('div', { style: { fontSize: '16px', fontWeight: '700' }, text: `${y} 年 ${m + 1} 月` }),
      U.el('button', {
        class: 'icon-btn sm', onclick: () => { shiftMonth(1); App.refresh(); }
      }, [U.svg('M9 6l6 6-6 6', { sw: '2.2' })])
    ]));

    /* 网格 */
    const grid = U.el('div', { class: 'cal-grid' });
    ['一', '二', '三', '四', '五', '六', '日'].forEach(d =>
      grid.appendChild(U.el('div', { class: 'cal-dow', text: d })));

    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7;   // 周一为第一列
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();

    /* 上月补位 */
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevDays - i;
      grid.appendChild(U.el('div', { class: 'cal-day other', text: String(d) }));
    }
    /* 当月 */
    const todayStr = U.ymd(U.today());
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${U.pad(m + 1)}-${U.pad(d)}`;
      const dayTasks = S.tasksOn(ds);
      const dots = U.el('div', { class: 'cal-dots' });
      const cats = [...new Set(dayTasks.filter(t => !t.done).map(t => t.cat || 'life'))].slice(0, 3);
      cats.forEach(c => dots.appendChild(U.el('span', {
        class: 'dot', style: { background: (S.CATS[c] || S.CATS.life).hex }
      })));
      if (!cats.length && dayTasks.length) {
        dots.appendChild(U.el('span', { class: 'dot', style: { background: 'var(--text-faint)' } }));
      }

      const cell = U.el('button', {
        class: 'cal-day'
          + (ds === todayStr ? ' today' : '')
          + (ds === st.selDate ? ' sel' : '')
      }, [U.el('span', { text: String(d) }), dots]);
      cell.addEventListener('click', () => { st.selDate = ds; App.refresh(); });
      grid.appendChild(cell);
    }
    /* 下月补位，凑满整行 */
    const total = startOffset + daysInMonth;
    const tail = (7 - total % 7) % 7;
    for (let d = 1; d <= tail; d++) {
      grid.appendChild(U.el('div', { class: 'cal-day other', text: String(d) }));
    }

    root.appendChild(U.el('div', { class: 'card tight' }, [grid]));

    /* 选中日详情 */
    const selTasks = S.tasksOn(st.selDate);
    root.appendChild(U.el('div', {
      class: 'section-label',
      text: `${U.friendly(st.selDate)} · ${U.dowName(st.selDate)}（${selTasks.length}）`
    }));
    if (!selTasks.length) {
      root.appendChild(U.el('div', {
        class: 'card tight', style: { textAlign: 'center', color: 'var(--text-faint)', fontSize: '13.5px', padding: '24px' },
        text: '这天没有安排'
      }));
    } else {
      selTasks.forEach(t => root.appendChild(Views.taskRow(t)));
    }
  }

  function shiftMonth(delta) {
    let { y, m } = st.calMonth;
    m += delta;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    st.calMonth = { y, m };
  }

  /* ═══════════ 任务编辑 ═══════════ */
  Views.editTask = function (task, defaults = {}) {
    const isNew = !task;
    const t = task ? Object.assign({}, task) : Object.assign({
      title: '', cat: 'life', priority: 1, note: '', location: '',
      start: '', due: '', repeat: '', done: false, kind: ''
    }, defaults);
    /* 没指定类型时按现有字段推断（有截止日 → deadline，否则长期），
       这样打开新建框时默认选项是合理的，用户不用每次挑 */
    if (!t.kind) t.kind = S.kindOf(t);

    const titleIn = App.input('text', t.title, v => { t.title = v; }, '要做什么？');
    const kindChips = App.chips(
      Object.keys(S.KINDS).map(k => ({ value: k, label: S.KINDS[k].name })),
      t.kind,
      v => { t.kind = v; rebuild(); }
    );
    const catChips = App.chips(
      Object.keys(S.CATS).map(c => ({ value: c, label: S.CATS[c].short })),
      t.cat,
      v => { t.cat = v; rebuild(); }
    );
    const prioChips = App.chips(
      [3, 2, 1, 0].map(p => ({ value: p, label: S.PRIORITY[p].name })),
      t.priority,
      v => { t.priority = Number(v); rebuild(); }
    );

    const startIn = App.input('datetime-local', t.start ? String(t.start).slice(0, 16) : '', v => { t.start = v; });
    const dueIn = App.input('datetime-local', t.due ? String(t.due).slice(0, 16) : '', v => {
      t.due = v;
      /* 填了截止时间但类型还是「长期」时，自动切成「有截止」——
         长期任务带着截止日是自相矛盾的，用户八成是漏点了类型。
         已经手动选过 daily 的不动（日常活动也可能顺带有个截止日）。 */
      if (v && t.kind === 'longterm') { t.kind = 'deadline'; rebuild(); }
    });
    const locIn = App.input('text', t.location, v => { t.location = v; }, '教室 / 地点');
    const noteIn = U.el('textarea', {
      class: 'textarea', style: { minHeight: '70px' }, placeholder: '备注（可选）',
      oninput: e => { t.note = e.target.value; }
    });
    noteIn.value = t.note || '';

    const repeatSel = App.selectEl([
      { value: '', label: '不重复' },
      { value: 'daily', label: '每天' },
      { value: 'weekly', label: '每周' }
    ], t.repeat || '', v => { t.repeat = v; });

    const box = U.el('div', {}, [
      App.field('任务内容', titleIn),
      App.field('类型', kindChips, '决定怎么提醒：有截止 → 截止前一天晚 6 点；日常 → 每天晚 6 点；长期 → 不提醒'),
      App.field('分类', catChips),
      App.field('优先级', prioChips),
      App.field('开始时间', startIn),
      App.field('截止时间', dueIn),
      App.field('地点', locIn),
      App.field('重复', repeatSel),
      App.field('备注', noteIn)
    ]);

    function rebuild() {
      /* 重新渲染分类/优先级的选中态（chips() 已带选中样式，直接重建即可） */
      const bodyEl = U.$('#sheetBody');
      if (!bodyEl) return;
      bodyEl.innerHTML = '';
      const fresh = U.el('div', {}, [
        App.field('任务内容', titleIn),
        App.field('类型', App.chips(
          Object.keys(S.KINDS).map(k => ({ value: k, label: S.KINDS[k].name })), t.kind,
          v => { t.kind = v; rebuild(); }),
          '决定怎么提醒：有截止 → 截止前一天晚 6 点；日常 → 每天晚 6 点；长期 → 不提醒'),
        App.field('分类', App.chips(
          Object.keys(S.CATS).map(c => ({ value: c, label: S.CATS[c].short })), t.cat,
          v => { t.cat = v; rebuild(); })),
        App.field('优先级', App.chips(
          [3, 2, 1, 0].map(p => ({ value: p, label: S.PRIORITY[p].name })), t.priority,
          v => { t.priority = Number(v); rebuild(); })),
        App.field('开始时间', startIn),
        App.field('截止时间', dueIn),
        App.field('地点', locIn),
        App.field('重复', repeatSel),
        App.field('备注', noteIn),
        actions()
      ]);
      bodyEl.appendChild(fresh);
    }

    function actions() {
      const row = U.el('div', { class: 'row', style: { marginTop: '18px' } });
      if (!isNew) {
        row.appendChild(U.el('button', {
          class: 'btn danger', text: '删除',
          onclick: () => App.confirm(`删除「${t.title}」？`, () => {
            S.remove('tasks', t.id);
            U.toast('已删除', 'ok');
            App.refresh();
          }, '删除')
        }));
      }
      row.appendChild(U.el('button', {
        class: 'btn primary grow', text: isNew ? '添加' : '保存',
        onclick: () => {
          if (!t.title.trim()) return U.toast('请填写任务内容', 'err');
          // 规范化：只有日期没有时刻时，去掉 T00:00
          ['start', 'due'].forEach(k => {
            if (t[k] && /T00:00$/.test(t[k])) t[k] = t[k].slice(0, 10);
            if (t[k] === '') t[k] = null;
          });
          if (isNew) {
            S.add('tasks', t);
            U.toast('已添加', 'ok');
          } else {
            S.update('tasks', t.id, t);
            U.toast('已保存', 'ok');
          }
          App.closeSheet();
          App.refresh();
        }
      }));
      return row;
    }

    /* ── 智能排期按钮 ── */
    const sugBox = U.el('div', { style: { marginTop: '4px' } });
    function renderSug() {
      sugBox.innerHTML = '';
      if (t.suggested && t.start) {
        sugBox.appendChild(U.el('div', {
          style: {
            fontSize: '12px', color: 'var(--brand)', background: 'var(--brand-soft)',
            padding: '8px 10px', borderRadius: '8px', lineHeight: '1.6'
          }
        }, [
          U.el('div', { text: '💡 ' + (t.suggestReason || '系统推荐的时间') }),
          U.el('button', {
            class: 'btn ghost sm', style: { marginTop: '6px' }, text: '重新推荐',
            onclick: () => recalc()
          })
        ]));
      } else {
        sugBox.appendChild(U.el('button', {
          class: 'btn ghost sm block', text: '💡 给我推荐一个完成时间',
          onclick: () => recalc()
        }));
      }
    }
    function recalc() {
      try {
        const s = Sch.suggest(t, { skipId: t.id, ignoreCourses: Sch.hasTimetable() });
        if (!s) return U.toast('找不到合适的空档', 'err');
        startIn.value = `${s.date}T${s.fromText}`;
        t.start = startIn.value;
        if (!t.due) { dueIn.value = `${s.date}T${s.toText}`; t.due = dueIn.value; }
        t.suggested = true;
        t.suggestReason = s.reason;
        renderSug();
        U.toast(`推荐：${U.friendly(s.date)} ${s.fromText}–${s.toText}`, 'ok');
      } catch (e) {
        U.toast('排期失败：' + e.message, 'err');
      }
    }
    renderSug();

    /* ── 子任务 ── */
    const kidBox = U.el('div', {});
    function renderKids() {
      kidBox.innerHTML = '';
      const kids = isNew ? [] : S.children(t.id);
      if (kids.length) {
        const prog = S.progress(t.id);
        kidBox.appendChild(U.el('div', {
          style: { fontSize: '11.5px', color: 'var(--text-dim)', marginBottom: '6px' }
        }, [
          U.el('span', { text: `子任务进度 ${prog.done}/${prog.total}` })
        ]));
        kids.forEach(k => {
          const kd = !!k.done;
          const kc = U.el('button', { class: 'check sm' + (kd ? ' on' : '') },
            [U.svg('M20 6L9 17l-5-5', { sw: '3' })]);
          kc.addEventListener('click', () => {
            S.toggleDone(k.id, !kd);
            renderKids();
            App.refresh();
          });
          kidBox.appendChild(U.el('div', {
            style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)' }
          }, [
            kc,
            U.el('span', {
              class: 'grow', style: {
                fontSize: '13px',
                color: kd ? 'var(--text-faint)' : 'var(--text)',
                textDecoration: kd ? 'line-through' : 'none'
              },
              text: k.title
            }),
            U.el('button', {
              class: 'icon-btn sm',
              onclick: () => { S.remove('tasks', k.id); renderKids(); App.refresh(); }
            }, [U.svg(['M6 6l12 12', 'M18 6L6 18'], { sw: '2' })])
          ]));
        });
      }
      /* 加子任务：父任务必须先存在，所以新建时提示先保存 */
      const addIn = App.input('text', '', () => {}, '加一个子任务…');
      addIn.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doAddKid(addIn); }
      });
      kidBox.appendChild(U.el('div', { class: 'row', style: { marginTop: '8px' } }, [
        U.el('div', { class: 'grow' }, [addIn]),
        U.el('button', {
          class: 'btn ghost', style: { flexShrink: '0' }, text: '添加',
          onclick: () => doAddKid(addIn)
        })
      ]));
      if (isNew) {
        kidBox.appendChild(U.el('div', {
          style: { fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '6px' },
          text: '提示：先保存任务，之后可以再回来加子任务'
        }));
      }
    }
    function doAddKid(inp) {
      const v = inp.value.trim();
      if (!v) return;
      if (isNew) {
        U.toast('请先保存这个任务', 'err');
        return;
      }
      S.add('tasks', {
        title: v, cat: t.cat, priority: t.priority,
        parentId: t.id, done: false, note: ''
      });
      inp.value = '';
      renderKids();
      App.refresh();
      U.toast('已添加子任务', 'ok');
    }
    renderKids();

    box.appendChild(App.field('子任务', kidBox));
    box.appendChild(sugBox);
    box.appendChild(actions());

    App.sheet(isNew ? '新建任务' : '编辑任务', box);

    /* 派生快捷操作：从标题猜分类 */
    if (isNew) {
      const guess = U.debounce(() => {
        const v = titleIn.value.trim();
        if (v.length < 3) return;
        const c = Parser.classify(v);
        if (c.cat !== t.cat) {
          t.cat = c.cat;
          rebuild();
        }
      }, 600);
      titleIn.addEventListener('input', guess);
    }
  };

  /* ═══════════ 导出到系统日历 ═══════════ */
  function openICSExport() {
    const r = S.settings.remind;
    const opts = { days: r.lookaheadDays, includeDaily: true, includeDeadline: true, includeTasks: true };

    const preview = ICS.preview(opts);
    const evening = preview.filter(p => p.kind === 'evening').length;
    const deadline = preview.filter(p => p.kind === 'deadline').length;
    const taskCount = preview.filter(p => p.kind === 'task').length;

    const box = U.el('div', {}, [
      U.el('p', {
        style: { fontSize: '13.5px', color: 'var(--text-dim)', lineHeight: '1.7', marginTop: 0 },
        text: `将生成未来 ${r.lookaheadDays} 天的日历事件，导入小米系统日历后：`
      }),
      U.el('div', { class: 'stat-grid', style: { marginBottom: '14px' } }, [
        App.stat('每晚检查', evening, '个', `${U.pad(r.eveningHour)}:${U.pad(r.eveningMinute)} 提醒未完成`),
        App.stat('截止提醒', deadline, '个', `提前 ${r.deadlineLeadDays} 天`),
        App.stat('任务事件', taskCount, '个', '任务本身进日历'),
        App.stat('合计', preview.length, '个', '')
      ]),
      U.el('div', {
        class: 'card tight',
        style: { background: 'var(--brand-soft)', border: 'none', marginBottom: '14px' }
      }, [
        U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.75', color: 'var(--brand)' } }, [
          U.el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: '导入方法（只需做一次，之后约每月更新一次）' }),
          U.el('div', { text: '1. 点下面「导出 .ics 文件」' }),
          U.el('div', { text: '2. 用「小米日历」打开下载的文件，或到 日历 → 设置 → 导入' }),
          U.el('div', { text: '3. 之后提醒由系统日历弹出，息屏也会响' })
        ])
      ]),
      U.el('div', { class: 'row' }, [
        U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
        U.el('button', {
          class: 'btn primary grow', text: '导出 .ics 文件',
          onclick: () => {
            const n = ICS.download(opts);
            App.closeSheet();
            /* 0 个事件导出来的 .ics 是个空日历，导进系统日历什么也不会发生，
               用户只会以为「坏了」。所以这里要说清楚为什么。 */
            if (!n) {
              U.toast('没有可导出的事项：先在「计划」里加上有截止日的任务', 'err');
            } else {
              U.toast(`已导出 ${n} 个事件`, 'ok');
            }
          }
        })
      ]),
      /* 安卓上「分享到日历」比「下载再打开」可靠得多（见 ICS.share 的注释）。
         不支持分享的浏览器干脆不显示这个按钮，免得点了没反应。 */
      ICS.canShare() ? U.el('button', {
        class: 'btn ghost block', style: { marginTop: '8px' },
        text: '📤 分享到日历 / 文件（手机推荐）',
        onclick: async () => {
          const r = await ICS.share(opts);
          if (r.ok) {
            App.closeSheet();
            U.toast(`已分享 ${r.count} 个事件，选「日历」即可导入`, 'ok');
          } else if (r.reason === 'cancel') {
            /* 用户自己取消的，什么都不用说 */
          } else if (r.reason === 'unsupported') {
            U.toast('这个浏览器不支持分享，请用上面的「导出 .ics 文件」', 'err');
          } else {
            U.toast('分享失败：' + r.reason, 'err');
          }
        }
      }) : null
    ]);

    /* 预览列表 */
    if (preview.length) {
      box.insertBefore(U.el('div', { class: 'section-label', text: '预览（前 12 条）' }), box.children[2]);
      const list = U.el('div', { style: { maxHeight: '30vh', overflowY: 'auto', marginBottom: '14px' } });
      preview.slice(0, 12).forEach(p => {
        list.appendChild(U.el('div', {
          style: {
            display: 'flex', gap: '9px', padding: '7px 0',
            borderBottom: '1px solid var(--border)', fontSize: '12.5px', alignItems: 'baseline'
          }
        }, [
          U.el('span', { style: { color: 'var(--text-faint)', flexShrink: '0', fontVariantNumeric: 'tabular-nums' },
            text: p.date.slice(5) + ' ' + p.time }),
          U.el('span', { class: 'grow', text: p.title, style: { wordBreak: 'break-word' } })
        ]));
      });
      box.insertBefore(list, box.children[3]);
    }

    App.sheet('导出到系统日历', box, { autofocus: false });
  }

  Views.openICSExport = openICSExport;
  Views.planState = st;
  global.Views = Views;
})(window);