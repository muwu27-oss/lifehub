/* ═══════════════════════════════════════════════
   views/today.js — 今日仪表盘
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const Views = global.Views || (global.Views = {});

  Views.today = function () {
    const root = U.$('#view-today');
    const today = U.ymd(U.today());
    const tasks = S.tasksOn(today);
    const done = tasks.filter(t => t.done).length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;

    /* ───── 顶部：今日完成环 + 快速统计 ───── */
    const catStats = S.catStats(today, today);
    const catBits = Object.keys(S.CATS).map(c => {
      const s = catStats[c];
      if (!s.total) return null;
      const color = S.CATS[c].hex;
      return U.el('span', {
        style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-dim)' }
      }, [
        U.el('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: color } }),
        `${S.CATS[c].short} ${s.done}/${s.total}`
      ]);
    }).filter(Boolean);

    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'ring-wrap' }, [
        App.ring(pct, 92, 'var(--brand)', pct + '%', `${done}/${tasks.length}`),
        U.el('div', { class: 'grow' }, [
          U.el('div', { style: { fontSize: '15px', fontWeight: '650', marginBottom: '6px' } },
            [tasks.length ? (done === tasks.length ? '今天全部完成 🎉' : `还有 ${tasks.length - done} 项要做`) : '今天还没有安排']),
          U.el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, catBits)
        ])
      ])
    ]));

    /* ───── 逾期警告 ───── */
    const overdue = S.overdue();
    if (overdue.length) {
      const box = U.el('div', {
        class: 'card tight',
        style: { borderColor: 'var(--danger)', background: 'var(--danger-soft)' }
      }, [
        U.el('div', { class: 'card-head', style: { marginBottom: '8px' } }, [
          U.el('h3', { style: { color: 'var(--danger)', fontSize: '14.5px' }, text: `⚠️ 有 ${overdue.length} 项已逾期` })
        ])
      ]);
      overdue.slice(0, 3).forEach(t => {
        box.appendChild(taskRow(t, true));
      });
      if (overdue.length > 3) {
        box.appendChild(U.el('button', {
          class: 'btn ghost sm block', style: { marginTop: '6px' },
          text: `查看全部 ${overdue.length} 项`,
          onclick: () => App.go('plan')
        }));
      }
      root.appendChild(box);
    }

    /* ───── 今日待办 ───── */
    root.appendChild(U.el('div', { class: 'section-label', text: '今天要做' }));
    if (!tasks.length) {
      root.appendChild(App.empty('今天还没有安排', '去「导入」粘贴群消息，或点下方按钮添加'));
    } else {
      tasks.forEach(t => root.appendChild(taskRow(t)));
    }

    root.appendChild(U.el('button', {
      class: 'btn ghost block', style: { marginTop: '4px' },
      text: '＋ 添加任务',
      onclick: () => Views.editTask(null, { due: today })
    }));

    /* ───── 即将到期 ───── */
    const upcoming = S.upcoming(7).filter(t => (t.due || '').slice(0, 10) !== today);
    if (upcoming.length) {
      root.appendChild(U.el('div', { class: 'section-label', text: '未来 7 天' }));
      upcoming.slice(0, 5).forEach(t => root.appendChild(taskRow(t)));
    }

    /* ───── 今天该复习 ───── */
    const reviews = S.dueReviews(today);
    if (reviews.length) {
      root.appendChild(U.el('div', { class: 'section-label', text: `今天该复习（${reviews.length}）` }));
      const card = U.el('div', { class: 'card tight' });
      reviews.slice(0, 6).forEach(r => {
        card.appendChild(U.el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 2px', borderBottom: '1px solid var(--border)'
          }
        }, [
          U.el('div', { class: 'grow' }, [
            U.el('div', { style: { fontSize: '14px', fontWeight: '600' }, text: r.title }),
            U.el('div', {
              style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '2px' },
              text: `第 ${r.round} 轮 · 间隔 ${r.interval} 天${r.link ? ' · ' + r.link : ''}`
            })
          ]),
          U.el('button', {
            class: 'btn ok sm', text: '记住了',
            onclick: e => {
              const adv = Blueprint.advanceReview(r);
              S.update('reviews', r.id, {
                done: true,
                retired: adv.retired,
                nextDate: adv.nextDate,
                lastDone: U.ymd(U.today())
              });
              U.toast(adv.retired ? '已完成 5 轮复习 👏' : '已推进到下一轮', 'ok');
              App.refresh();
            }
          })
        ]));
      });
      root.appendChild(card);
    }

    /* ───── 今日饮食 / 账本速览 ───── */
    const meals = S.mealsOn(today);
    const totals = Nutrition.dayTotals(meals);
    const sleepRec = S.sleepOn(today);
    const bodySet = S.settings.body;

    root.appendChild(U.el('div', { class: 'section-label', text: '今天的状态' }));

    const quick = U.el('div', { class: 'card tight' });
    const bodyBits = [];
    bodyBits.push(['热量', totals.kcal ? totals.kcal + ' kcal' : '未记录', bodySet.dailyKcal ? `目标 ${bodySet.dailyKcal}` : '']);
    bodyBits.push(['蛋白', totals.p ? U.round(totals.p, 1) + ' g' : '未记录', bodySet.proteinTarget ? `目标 ${bodySet.proteinTarget}g` : '']);
    bodyBits.push(['睡眠', sleepRec && sleepRec.hours != null ? sleepRec.hours + ' 小时' : '未记录', bodySet.sleepTarget ? `目标 ${bodySet.sleepTarget}h` : '']);

    /* 有几餐标了「没吃」就提示一句——这是要干预的事实，
       跟「忘了记」不一样，不能安静地待在饮食页里。 */
    if (totals.skipped) {
      quick.appendChild(U.el('div', {
        style: {
          fontSize: '12px', color: 'var(--warn, #f59e0b)',
          background: 'rgba(245,158,11,.10)', padding: '7px 10px',
          borderRadius: '8px', marginBottom: '11px', lineHeight: '1.6'
        },
        text: `今天有 ${totals.skipped} 餐标了「没吃」。偶尔一次没关系，`
            + `但连着几天这样会掉肌肉、也容易晚上暴食。`
      }));
    }

    quick.appendChild(U.el('div', { class: 'stat-grid' }, bodyBits.map(([l, v, s]) =>
      App.stat(l, v, '', s)
    )));
    quick.appendChild(U.el('div', { class: 'row', style: { marginTop: '12px' } }, [
      U.el('button', { class: 'btn sm grow', text: '记饮食', onclick: () => App.go('body') }),
      U.el('button', { class: 'btn sm grow', text: '记睡眠', onclick: () => App.go('body') }),
      U.el('button', { class: 'btn sm grow', text: '记账', onclick: () => App.go('money') })
    ]));
    root.appendChild(quick);

    /* ───── 本月结余 ───── */
    const ym = today.slice(0, 7);
    const ms = S.monthSummary(ym);
    root.appendChild(U.el('div', { class: 'card tight' }, [
      U.el('div', { class: 'card-head', style: { marginBottom: '8px' } }, [
        U.el('h3', { text: ym.replace('-', ' 年 ') + ' 月' }),
        U.el('span', {
          class: 'hint',
          style: { color: ms.balance >= 0 ? 'var(--ok)' : 'var(--danger)', fontWeight: '700' },
          text: (ms.balance >= 0 ? '结余 +' : '超支 ') + U.money(Math.abs(ms.balance))
        })
      ]),
      App.barRow('支出', ms.expense, Math.max(ms.income, ms.expense, 1), 'var(--danger)', U.money(ms.expense)),
      U.el('div', { style: { fontSize: '12px', color: 'var(--text-dim)', marginTop: '-4px' } },
        [`本月收入 ${U.money(ms.income)}`
         + (ms.stipend ? `（生活费 ${U.money(ms.stipend)}` + (ms.extra ? ` + 额外 ${U.money(ms.extra)}）` : '）') : '')
         + ` · ${ms.window.start.slice(5)} ~ ${ms.window.end.slice(5)}`])
    ]));
  };

  /* ───── 任务行 ───── */
  function taskRow(t, showOverdue) {
    const done = !!t.done;
    const cat = S.CATS[t.cat] || S.CATS.life;
    const kids = S.children(t.id);
    const prog = kids.length ? S.progress(t.id) : null;

    const check = U.el('button', { class: 'check' + (done ? ' on' : '') },
      [U.svg('M20 6L9 17l-5-5', { sw: '3' })]);
    check.addEventListener('click', e => {
      e.stopPropagation();
      /* 用 toggleDone 以便自动联动父子任务 */
      S.toggleDone(t.id, !done);
      App.refresh();
      if (!done) U.toast('完成 ✅', 'ok');
    });

    const meta = [];
    if (t.start && String(t.start).includes('T')) {
      meta.push(U.el('span', { text: U.hm(t.start) }));
      if (t.suggested) meta.push(U.el('span', {
        class: 'badge', style: { color: 'var(--brand)' }, text: '推荐'
      }));
    }
    if (t.due && !t.start) {
      meta.push(U.el('span', { text: U.friendly(t.due) }));
    } else if (t.due && t.start && t.due.slice(0, 10) !== t.start.slice(0, 10)) {
      meta.push(U.el('span', { text: '截止 ' + U.friendly(t.due) }));
    }
    if (showOverdue && t.due) {
      meta.push(U.el('span', { class: 'badge danger', text: U.untilText(t.due) }));
    }
    if (t.location) meta.push(U.el('span', { text: '📍' + t.location }));
    if (t.priority >= 2) {
      meta.push(U.el('span', { class: 'badge ' + (t.priority === 3 ? 'danger' : 'warn'),
        text: S.PRIORITY[t.priority].name }));
    }

    /* 父任务：显示子任务进度 */
    const kidBar = prog ? U.el('div', { style: { marginTop: '7px' } }, [
      U.el('div', {
        style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '3px' }
      }, [
        U.el('span', { text: `${prog.done}/${prog.total} 子任务` }),
        U.el('span', { text: prog.pct + '%' })
      ]),
      U.el('div', { class: 'bar' }, [
        U.el('div', { class: 'bar-fill', style: { width: prog.pct + '%', background: cat.hex } })
      ])
    ]) : null;

    /* 父任务：展开显示子任务（未完成的） */
    let kidList = null;
    if (kids.length && !done) {
      kidList = U.el('div', { style: { marginTop: '8px', paddingLeft: '2px' } });
      kids.forEach(k => {
        const kd = !!k.done;
        const kc = U.el('button', { class: 'check sm' + (kd ? ' on' : '') },
          [U.svg('M20 6L9 17l-5-5', { sw: '3' })]);
        kc.addEventListener('click', e => {
          e.stopPropagation();
          S.toggleDone(k.id, !kd);
          App.refresh();
        });
        const krow = U.el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '5px 0', fontSize: '13px',
            color: kd ? 'var(--text-faint)' : 'var(--text)',
            textDecoration: kd ? 'line-through' : 'none'
          }
        }, [kc, U.el('span', { class: 'grow', text: k.title })]);
        krow.addEventListener('click', e => { e.stopPropagation(); Views.editTask(k); });
        kidList.appendChild(krow);
      });
    }

    const row = U.el('div', { class: 'task' + (done ? ' done' : ''), dataset: { cat: t.cat || 'life' } }, [
      check,
      U.el('div', { class: 'task-main' }, [
        U.el('div', { class: 'task-title', text: t.title }),
        meta.length ? U.el('div', { class: 'task-meta' }, meta) : null,
        kidBar,
        t.note ? U.el('div', {
          style: { fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '3px' },
          text: t.note
        }) : null,
        kidList
      ]),
      U.el('span', { class: 'badge ' + cat.id, text: cat.short, style: { flexShrink: '0' } })
    ]);

    row.addEventListener('click', () => Views.editTask(t));
    return row;
  }

  Views.taskRow = taskRow;
  global.Views = Views;
})(window);