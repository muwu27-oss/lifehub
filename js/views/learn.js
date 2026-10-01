/* ═══════════════════════════════════════════════
   views/learn.js — 学习蓝图（计算机视觉 / 具身智能）
   把 Obsidian 知识库的结构呈现在手机上，并可直接转成日程
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const Views = global.Views || (global.Views = {});

  const st = { tab: 'roadmap', filter: 'all' };

  Views.learn = function () {
    const root = U.$('#view-learn');

    /* ───── 阶段卡 ───── */
    const stage = Blueprint.STAGE;
    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' } }, [
        U.el('div', { class: 'grow' }, [
          U.el('div', { style: { fontSize: '15.5px', fontWeight: '700', lineHeight: '1.4' }, text: stage.title }),
          U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '5px' }, text: '方向位置：' + stage.position })
        ]),
        U.el('span', { class: 'badge cv', text: '阶段 ' + stage.current })
      ]),
      U.el('div', {}, stage.phases.map(p => {
        const icon = p.state === 'done' ? '✅' : p.state === 'doing' ? '🟡' : '🔴';
        return U.el('div', {
          style: {
            display: 'flex', gap: '8px', padding: '6px 0', fontSize: '13px',
            color: p.state === 'todo' ? 'var(--text-faint)' : 'var(--text)'
          }
        }, [
          U.el('span', { text: icon, style: { flexShrink: '0' } }),
          U.el('span', { text: `阶段 ${p.n}：${p.name}`, style: { lineHeight: '1.5' } })
        ]);
      }))
    ]));

    /* ───── Tab ───── */
    root.appendChild(App.seg([
      { value: 'roadmap', label: '路线图' },
      { value: 'modules', label: '模块进度' },
      { value: 'projects', label: '项目' },
      { value: 'actions', label: '转成日程' }
    ], st.tab, v => { st.tab = v; App.refresh(); }));

    root.appendChild(U.el('div', { style: { height: '14px' } }));

    if (st.tab === 'roadmap') renderRoadmap(root);
    else if (st.tab === 'modules') renderModules(root);
    else if (st.tab === 'projects') renderProjects(root);
    else renderActions(root);
  };

  /* ═══════════ 路线图 ═══════════ */
  function renderRoadmap(root) {
    const ov = Blueprint.overall();

    root.appendChild(U.el('div', { class: 'card tight' }, [
      U.el('div', { class: 'ring-wrap' }, [
        App.ring(ov.pct, 84, 'var(--c-cv)', ov.pct + '%', '总体'),
        U.el('div', { class: 'grow' }, [
          U.el('div', { class: 'stat-grid' }, [
            App.stat('已掌握', ov.done, '个'),
            App.stat('进行中', ov.doing, '个')
          ])
        ])
      ])
    ]));

    root.appendChild(U.el('div', { class: 'section-label', text: '学科地图' }));

    const statusMeta = {
      ok:     { color: 'var(--ok)',      label: '基础扎实' },
      doing:  { color: 'var(--brand)',   label: '正在推进' },
      todo:   { color: 'var(--warn)',    label: '待补' },
      future: { color: 'var(--text-faint)', label: '远期，当前不投入' }
    };

    Blueprint.ROADMAP.forEach((layer, i) => {
      const meta = statusMeta[layer.status] || statusMeta.todo;
      const card = U.el('div', {
        class: 'card tight',
        style: { borderLeft: '3px solid ' + meta.color, marginBottom: '8px' }
      }, [
        U.el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' } }, [
          U.el('div', { style: { fontSize: '14.5px', fontWeight: '650' }, text: layer.layer }),
          U.el('span', { style: { fontSize: '11px', color: meta.color, fontWeight: '600', flexShrink: '0' }, text: meta.label })
        ]),
        U.el('div', {
          style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '5px', lineHeight: '1.6' },
          text: layer.nodes.map(n => {
            const m = Blueprint.module(n);
            return m ? `${m.id} ${m.name}` : n;
          }).join(' · ')
        })
      ]);
      card.addEventListener('click', () => { st.tab = 'modules'; App.refresh(); });
      root.appendChild(card);

      if (i < Blueprint.ROADMAP.length - 1) {
        root.appendChild(U.el('div', {
          style: { textAlign: 'center', color: 'var(--text-faint)', fontSize: '11px', margin: '-4px 0 2px' },
          text: '↓'
        }));
      }
    });

    /* 优先级说明 */
    root.appendChild(U.el('div', { class: 'section-label', text: '四级优先级（来自知识库 README）' }));
    root.appendChild(U.el('div', { class: 'card tight' }, [
      U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.85', color: 'var(--text-dim)' } }, [
        U.el('div', {}, [U.el('b', { style: { color: 'var(--text)' }, text: '1. ' }), '机器人视觉 + Robocon + 当前 Project 1']),
        U.el('div', {}, [U.el('b', { style: { color: 'var(--text)' }, text: '2. ' }), 'ROS2 + 3D Vision + 定位 + 视觉几何']),
        U.el('div', {}, [U.el('b', { style: { color: 'var(--text)' }, text: '3. ' }), 'SLAM + Sensor Fusion']),
        U.el('div', {}, [U.el('b', { style: { color: 'var(--text)' }, text: '4. ' }), '纯计算机视觉理论深入'])
      ]),
      U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--warn)', marginTop: '9px', lineHeight: '1.6' },
        text: '⚠️ 远期内容（27 具身智能）一律标记 🔴，不允许看起来像"现在必须学"。'
      })
    ]));
  }

  /* ═══════════ 模块进度 ═══════════ */
  function renderModules(root) {
    const ov = Blueprint.overall();

    /* 分组进度条 */
    root.appendChild(U.el('div', { class: 'section-label', text: '分组进度' }));
    const gCard = U.el('div', { class: 'card tight' });
    Object.keys(ov.groups).forEach(g => {
      const info = ov.groups[g];
      gCard.appendChild(App.barRow(g, info.score, 100, 'var(--c-cv)', info.score + '%'));
    });
    root.appendChild(gCard);

    /* 筛选 */
    root.appendChild(App.chips([
      { value: 'all', label: '全部' },
      { value: '1', label: '优先级 1' },
      { value: '2', label: '优先级 2' },
      { value: '3', label: '优先级 3' },
      { value: '4', label: '远期 4' },
      { value: 'todo', label: '仅未掌握' }
    ], st.filter, v => { st.filter = v; App.refresh(); }));

    /* 模块列表 */
    let mods = Blueprint.MODULES.slice();
    if (st.filter === 'todo') mods = mods.filter(m => Blueprint.statusScore(m.status) < 0.75);
    else if (st.filter !== 'all') mods = mods.filter(m => m.prio === Number(st.filter));

    mods.forEach(m => {
      const score = Blueprint.statusScore(m.status);
      const color = score >= 0.9 ? 'var(--ok)' : score >= 0.45 ? 'var(--brand)' : score >= 0.2 ? 'var(--warn)' : 'var(--text-faint)';
      const card = U.el('div', {
        class: 'card tight',
        style: { padding: '11px 13px', marginBottom: '7px' }
      }, [
        U.el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px' } }, [
          U.el('span', {
            style: {
              fontSize: '11px', fontWeight: '700', color: 'var(--text-faint)',
              fontVariantNumeric: 'tabular-nums', flexShrink: '0', minWidth: '20px'
            },
            text: m.id
          }),
          U.el('div', { class: 'grow' }, [
            U.el('div', { style: { fontSize: '14px', fontWeight: '600' }, text: m.name }),
            U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '2px' }, text: m.status })
          ]),
          U.el('span', {
            class: 'badge',
            style: { background: color + '22', color, flexShrink: '0' },
            text: 'P' + m.prio
          })
        ]),
        U.el('div', { class: 'bar', style: { marginTop: '8px' } }, [
          U.el('div', { class: 'bar-fill', style: { width: (score * 100) + '%', background: color } })
        ])
      ]);
      card.addEventListener('click', () => openModuleDetail(m));
      root.appendChild(card);
    });

    /* AI 评价进度 */
    root.appendChild(U.el('button', {
      class: 'btn ghost block', style: { marginTop: '10px' },
      text: '🤖 让 AI 评价我的学习进度',
      onclick: () => App.openAI()
    }));
  }

  function openModuleDetail(m) {
    const score = Blueprint.statusScore(m.status);
    const box = U.el('div', {}, [
      U.el('div', { class: 'card tight' }, [
        U.el('div', { class: 'kv' }, [U.el('span', { class: 'k', text: '编号' }), U.el('span', { class: 'v', text: m.id })]),
        U.el('div', { class: 'kv' }, [U.el('span', { class: 'k', text: '分组' }), U.el('span', { class: 'v', text: m.group })]),
        U.el('div', { class: 'kv' }, [U.el('span', { class: 'k', text: '优先级' }), U.el('span', { class: 'v', text: 'P' + m.prio })]),
        U.el('div', { class: 'kv' }, [U.el('span', { class: 'k', text: '状态' }), U.el('span', { class: 'v', text: m.status })])
      ]),
      U.el('button', {
        class: 'btn primary block', text: '把这个模块加进日程',
        onclick: () => {
          App.closeSheet();
          setTimeout(() => Views.editTask(null, {
            title: `学习 ${m.id} ${m.name}`,
            cat: 'cv',
            priority: m.prio,
            note: '来自 Obsidian 知识库蓝图'
          }), 220);
        }
      })
    ]);
    App.sheet(`${m.id} ${m.name}`, box, { autofocus: false });
  }

  /* ═══════════ 项目 ═══════════ */
  function renderProjects(root) {
    Blueprint.PROJECTS.forEach(p => {
      const meta = {
        done:   { color: 'var(--ok',    label: '已完成' },
        mostly: { color: 'var(--brand)', label: '基本完成' },
        doing:  { color: 'var(--warn)',  label: '进行中' },
        todo:   { color: 'var(--text-faint)', label: '未开始' }
      }[p.status] || { color: 'var(--text-dim)', label: p.status };

      const card = U.el('div', { class: 'card tight' }, [
        U.el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' } }, [
          U.el('div', { style: { fontSize: '14.5px', fontWeight: '650', lineHeight: '1.4' }, text: p.name }),
          U.el('span', {
            class: 'badge',
            style: { background: meta.color + '22', color: meta.color, flexShrink: '0' },
            text: meta.label
          })
        ]),
        U.el('div', { style: { fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '8px', lineHeight: '1.65' }, text: p.desc }),
        p.config ? U.el('div', {
          style: {
            fontSize: '11px', color: 'var(--text-faint)', marginTop: '7px',
            fontFamily: 'ui-monospace, monospace', background: 'var(--bg-sunken)',
            padding: '6px 8px', borderRadius: '6px', wordBreak: 'break-all', lineHeight: '1.6'
          },
          text: p.config
        }) : null,
        p.note ? U.el('div', { style: { fontSize: '11.5px', color: 'var(--warn)', marginTop: '6px' }, text: '· ' + p.note }) : null,
        U.el('div', { style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '7px' },
          text: '关联模块：' + p.modules.map(id => { const mm = Blueprint.module(id); return mm ? mm.name : id; }).join('、') })
      ]);
      root.appendChild(card);
    });
  }

  /* ═══════════ 转成日程 ═══════════ */
  function renderActions(root) {
    root.appendChild(U.el('div', {
      class: 'card tight',
      style: { background: 'var(--brand-soft)', border: 'none' }
    }, [
      U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.7', color: 'var(--brand)' },
        text: '这些是基于你知识库当前状态给出的建议学习任务。勾选后归档到日程，会自动归入「计算机视觉 · 具身智能」分类。' })
    ]));

    const suggestions = Blueprint.suggestionsToTasks();
    if (!st._sel) st._sel = {};

    root.appendChild(U.el('div', { class: 'section-label', text: '建议任务' }));

    suggestions.forEach((t, i) => {
      if (st._sel[i] === undefined) st._sel[i] = true;
      const on = st._sel[i];
      const toggle = U.el('button', {
        class: 'check' + (on ? ' on' : ''), style: { flexShrink: '0' }
      }, [U.svg('M20 6L9 17l-5-5', { sw: '3' })]);
      toggle.addEventListener('click', () => { st._sel[i] = !on; App.refresh(); });

      root.appendChild(U.el('div', {
        class: 'prev-item', style: on ? {} : { opacity: '.45' }
      }, [
        toggle,
        U.el('div', { class: 'grow' }, [
          U.el('div', { class: 't', text: t.title }),
          U.el('div', { class: 'm' }, [
            U.el('span', { text: t.note }),
            U.el('span', { class: 'badge ' + (t.priority === 1 ? 'danger' : t.priority === 2 ? 'warn' : ''), text: 'P' + t.priority })
          ])
        ])
      ]));
    });

    const picked = suggestions.filter((_, i) => st._sel[i]);
    root.appendChild(U.el('button', {
      class: 'btn primary block', style: { marginTop: '12px' },
      text: `归档 ${picked.length} 条到日程`,
      onclick: () => {
        if (!picked.length) return U.toast('至少选一条', 'err');
        picked.forEach(t => {
          const item = Object.assign({}, t);
          delete item._keep;
          S.bulkAdd('tasks', [item]);
        });
        S.saveNow();
        U.toast(`已归档 ${picked.length} 条`, 'ok');
        setTimeout(() => App.go('plan'), 500);
      }
    }));

    /* 间隔复习说明 */
    root.appendChild(U.el('div', { class: 'section-label', text: '间隔复习节奏' }));
    root.appendChild(U.el('div', { class: 'card tight' }, [
      U.el('div', { style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.75' } }, [
        U.el('div', { text: Blueprint.REVIEW_INTERVALS.map(d => d + '天').join(' → ') }),
        U.el('div', { style: { marginTop: '6px', fontSize: '12px' },
          text: '每个知识点复习 5 次即毕业。每次先不看资料自测，通过就打勾推进，不通过就重置。' })
      ]),
      U.el('button', {
        class: 'btn ghost sm block', style: { marginTop: '10px' }, text: '新建复习计划',
        onclick: openReviewCreator
      })
    ]));
  }

  function openReviewCreator() {
    const titleIn = App.input('text', '', () => {}, '知识点，如「Kalman 概念」');
    const linkIn = App.input('text', '', () => {}, 'Obsidian 链接（可选），如 11_目标跟踪');
    const dateIn = App.input('date', U.ymd(U.today()), () => {});

    App.sheet('新建复习计划', U.el('div', {}, [
      App.field('知识点', titleIn),
      App.field('所属笔记', linkIn),
      App.field('首次学习日期', dateIn),
      U.el('p', { style: { fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.65' },
        text: '会自动按 1 / 3 / 7 / 14 / 30 天生成 5 次复习安排，到期的会出现在「今日」页。' }),
      U.el('div', { class: 'row', style: { marginTop: '14px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
        U.el('button', {
          class: 'btn primary grow', text: '创建',
          onclick: () => {
            const title = titleIn.value.trim();
            if (!title) return U.toast('请填写知识点', 'err');
            const plans = Blueprint.makeReviewPlan(title, dateIn.value, linkIn.value.trim());
            S.bulkAdd('reviews', plans);
            S.saveNow();
            App.closeSheet();
            U.toast('已创建 5 次复习安排', 'ok');
            App.refresh();
          }
        })
      ])
    ], ), { autofocus: false });
  }

  Views.learnState = st;
  global.Views = Views;
})(window);