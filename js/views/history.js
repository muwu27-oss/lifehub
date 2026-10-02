/* ═══════════════════════════════════════════════
   views/history.js — 回顾页

   展示周 / 月 / 年三个粒度的历史。
   计算全部在 js/history.js 里（纯函数、可单测），
   这里只负责把结果渲染出来。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const Views = global.Views || (global.Views = {});

  /* 视图状态：记住用户选的粒度和位置，切页面回来不丢 */
  const st = {
    unit: 'week',
    anchor: U.ymd(new Date())
  };

  const UNIT_TABS = [
    { id: 'week', name: '周' },
    { id: 'month', name: '月' },
    { id: 'year', name: '年' }
  ];

  const TONE_COLOR = {
    great: 'var(--ok)', good: 'var(--brand)',
    ok: 'var(--text-dim)', warn: 'var(--warn, #f59e0b)', bad: 'var(--danger)',
    none: 'var(--text-faint)'
  };

  const CAT_NAMES = { study: '通用学习', cv: 'CV·具身', life: '日常' };

  /** 分数圆环
   *
   *  用 App.ring（SVG），不要自己用 Charts.progress 画 canvas 再叠一层文字。
   *  踩过的坑：Charts.progress 自己就会在圆心写「74%」，我在上面又叠了一个
   *  「74」的 div，两个数字直接糊在一起变成一团黑；而且它的入参是 0~100，
   *  我传了 value/100（0.74），圆弧等于没画、圆心还写着「1%」。
   *  App.ring 只认 0~100，文字也只有一处来源，不会再重叠。 */
  function scoreRing(value, label, size) {
    const color = value == null ? 'var(--text-faint)' : TONE_COLOR[History.grade(value).tone];
    return App.ring(value == null ? 0 : value, size || 96, color,
      value == null ? '—' : String(value), label);
  }

  /** 一行「标签 —— 值」 */
  function kv(label, value, sub) {
    return U.el('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '7px 0', borderBottom: '1px solid var(--line, rgba(0,0,0,.06))'
      }
    }, [
      U.el('div', { style: { fontSize: '12.5px', color: 'var(--text-dim)' } }, [
        U.el('span', { text: label }),
        sub ? U.el('span', { style: { fontSize: '10.5px', color: 'var(--text-faint)', marginLeft: '5px' }, text: sub }) : null
      ]),
      U.el('div', { style: { fontSize: '13.5px', fontWeight: '600' }, text: value })
    ]);
  }

  /** 和上期比的小徽章 */
  function deltaBadge(d, opts) {
    opts = opts || {};
    if (d == null) return null;
    const good = opts.goodWhen === 'down' ? d < 0 : d > 0;
    const flat = Math.abs(d) < (opts.epsilon || 0.05);
    const color = flat ? 'var(--text-faint)' : (good ? 'var(--ok)' : 'var(--danger)');
    const arrow = flat ? '→' : (d > 0 ? '↑' : '↓');
    const txt = (opts.unit === '元' ? '¥' : '') + Math.abs(d) + (opts.unit && opts.unit !== '元' ? opts.unit : '');
    return U.el('span', {
      style: { fontSize: '11px', color, fontWeight: '600', marginLeft: '6px' },
      text: arrow + ' ' + txt
    });
  }

  function section(title, extra) {
    const h = U.el('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        margin: '18px 0 8px'
      }
    }, [
      U.el('div', { style: { fontSize: '13px', fontWeight: '700' }, text: title }),
      extra || null
    ]);
    return h;
  }

  const money = v => (v == null ? '—' : U.money(v));

  /* ───────── 各板块渲染 ───────── */

  function renderHealth(s) {
    const box = U.el('div', { class: 'card' });
    const grade = History.grade(s.healthScore);

    box.appendChild(U.el('div', {
      style: { display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '12px' }
    }, [
      scoreRing(s.healthScore, '健康度'),
      U.el('div', { style: { flex: '1', minWidth: '0' } }, [
        U.el('div', {
          style: { fontSize: '15px', fontWeight: '700', color: TONE_COLOR[grade.tone], marginBottom: '5px' },
          text: grade.text
        }),
        U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', lineHeight: '1.7' } }, [
          U.el('div', {}, [
            U.el('span', { text: '作息 ' }),
            U.el('span', {
              style: { fontWeight: '600' },
              text: s.sleep && s.sleep.score != null ? String(s.sleep.score) : '—'
            }),
            U.el('span', { text: '　饮食 ' }),
            U.el('span', {
              style: { fontWeight: '600' },
              text: s.diet && s.diet.score != null ? String(s.diet.score) : '—'
            })
          ]),
          U.el('div', {
            style: { fontSize: '10.5px', color: 'var(--text-faint)' },
            text: `记录覆盖率 ${s.coverage}%（${s.range.days} 天里）`
          })
        ])
      ])
    ]));

    /* 覆盖率低的时候必须说清楚，否则分数不可信 */
    if (s.coverage < 40) {
      box.appendChild(U.el('div', {
        style: {
          fontSize: '11.5px', lineHeight: '1.6', color: 'var(--warn, #f59e0b)',
          background: 'var(--warn-soft, rgba(245,158,11,.1))', borderRadius: '8px', padding: '8px 10px'
        },
        text: `记录天数太少（覆盖率 ${s.coverage}%），这个分数参考价值有限。坚持记录后它才有意义。`
      }));
    }
    return box;
  }

  function renderCompare(cmp) {
    const d = cmp.delta, p = cmp.prev;

    /* 每行显式带上「上期是多少」。
       之前图省事用一个 map 反查，结果键名对不上、整列显示成「—」，
       又长又错。直接写清楚反而更短。 */
    const rows = [
      { label: '健康度',   key: 'healthScore', unit: '分',   prev: p.healthScore },
      { label: '作息分',   key: 'sleepScore',  unit: '分',   prev: p.sleep && p.sleep.score },
      { label: '睡眠时长', key: 'avgHours',    unit: 'h',    prev: p.sleep && p.sleep.avgHours },
      { label: '饮食分',   key: 'dietScore',   unit: '分',   prev: p.diet && p.diet.score },
      { label: '日均热量', key: 'avgKcal',     unit: 'kcal', prev: p.diet && p.diet.avgKcal },
      { label: '支出',     key: 'expense',     unit: '元',   prev: p.money && p.money.expense, money: true, goodWhen: 'down' },
      { label: '收入',     key: 'income',      unit: '元',   prev: p.money && p.money.income,  money: true },
      { label: '结余',     key: 'balance',     unit: '元',   prev: p.money && p.money.balance, money: true },
      { label: '体重',     key: 'weight',      unit: 'kg',   prev: p.weight && p.weight.end,   goodWhen: 'down' }
    ].filter(r => d[r.key] != null);

    if (!rows.length) return null;

    const box = U.el('div', { class: 'card tight' });
    rows.forEach(r => {
      const v = d[r.key];
      const flat = Math.abs(v) < 0.05;
      const good = r.goodWhen === 'down' ? v < 0 : v > 0;
      const prevTxt = r.prev == null ? '—'
        : (r.money ? money(r.prev) : r.prev) + r.unit.replace('元', '');

      box.appendChild(U.el('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: '12.5px', padding: '7px 0'
        }
      }, [
        U.el('span', { style: { color: 'var(--text-dim)' }, text: r.label }),
        U.el('span', { style: { textAlign: 'right' } }, [
          U.el('span', {
            style: {
              fontWeight: '700',
              color: flat ? 'var(--text-faint)' : (good ? 'var(--ok)' : 'var(--danger)')
            },
            text: flat ? '持平'
              : (v > 0 ? '↑' : '↓') + (r.money ? '¥' : '') + Math.abs(v) + (r.money ? '' : r.unit)
          }),
          U.el('span', {
            style: { fontSize: '10.5px', color: 'var(--text-faint)', marginLeft: '6px' },
            text: '上期 ' + prevTxt
          })
        ])
      ]));
    });
    return box;
  }

  function renderSleep(s) {
    if (!s || !s.days) {
      return U.el('div', { class: 'card tight' }, [
        U.el('div', {
          style: { fontSize: '12.5px', color: 'var(--text-faint)', textAlign: 'center', padding: '10px 0' },
          text: '这个区间没有作息记录'
        })
      ]);
    }
    const box = U.el('div', { class: 'card tight' });
    box.appendChild(kv('平均时长', s.avgHours != null ? s.avgHours + ' 小时' : '—',
      s.minHours != null ? `最少 ${s.minHours} / 最多 ${s.maxHours}` : ''));
    box.appendChild(kv('平均入睡', s.avgBedtime || '—',
      s.lateNights ? `晚于 00:30 有 ${s.lateNights} 天` : ''));
    box.appendChild(kv('规律性',
      s.bedtimeStdMin == null ? '—（至少要 2 天记录）'
        : (s.bedtimeStdMin <= 30 ? '很规律 ±' : s.bedtimeStdMin <= 60 ? '还行 ±' : '偏乱 ±') + s.bedtimeStdMin + ' 分钟',
      ''));
    box.appendChild(kv('平均质量', s.avgQuality != null ? s.avgQuality + ' / 5' : '—', ''));
    box.appendChild(kv('记录天数', `${s.days} 天`, `覆盖率 ${Math.round(s.logRate * 100)}%`));
    return box;
  }

  function renderDiet(s) {
    if (!s || !s.days) {
      return U.el('div', { class: 'card tight' }, [
        U.el('div', {
          style: { fontSize: '12.5px', color: 'var(--text-faint)', textAlign: 'center', padding: '10px 0' },
          text: '这个区间没有饮食记录'
        })
      ]);
    }
    const t = History.targets();
    const box = U.el('div', { class: 'card tight' });
    box.appendChild(kv('日均热量',
      s.avgKcal == null ? '—' : s.avgKcal + ' kcal',
      `目标 ${t.kcalTarget}`));
    box.appendChild(kv('日均蛋白',
      s.avgProtein == null ? '—' : s.avgProtein + ' g',
      `目标 ${t.proteinTarget}（供能比 ${s.proteinPct == null ? '—' : s.proteinPct + '%'}）`));
    box.appendChild(kv('日均脂肪 / 碳水',
      `${s.avgFat == null ? '—' : s.avgFat} g / ${s.avgCarb == null ? '—' : s.avgCarb} g`, ''));
    box.appendChild(kv('有记录的天数',
      `${s.loggedDayCount} 天`,
      `覆盖率 ${Math.round(s.logRate * 100)}%`));
    if (s.skipped) box.appendChild(kv('标记「没吃」的餐次', s.skipped + ' 次', ''));

    /* 三大营养素供能比 —— 减脂期光看热量不够，结构错了也白搭 */
    if (s.avgProtein != null && s.avgKcal) {
      const pK = s.avgProtein * 4, fK = (s.avgFat || 0) * 9, cK = (s.avgCarb || 0) * 4;
      const tot = pK + fK + cK;
      if (tot > 0) {
        const bar = U.el('div', {
          style: { display: 'flex', height: '9px', borderRadius: '6px', overflow: 'hidden', margin: '10px 0 6px' }
        });
        [['蛋白', pK, '#3b6ef6'], ['脂肪', fK, '#f59e0b'], ['碳水', cK, '#0d9488']].forEach(([n, v, c]) => {
          bar.appendChild(U.el('div', {
            style: { width: (v / tot * 100) + '%', background: c },
            title: n + ' ' + Math.round(v / tot * 100) + '%'
          }));
        });
        box.appendChild(bar);
        box.appendChild(U.el('div', {
          style: { display: 'flex', gap: '10px', fontSize: '10.5px', color: 'var(--text-faint)' }
        }, [
          U.el('span', { text: `蛋白 ${Math.round(pK / tot * 100)}%` }),
          U.el('span', { text: `脂肪 ${Math.round(fK / tot * 100)}%` }),
          U.el('span', { text: `碳水 ${Math.round(cK / tot * 100)}%` })
        ]));
      }
    }
    return box;
  }

  function renderWeight(w) {
    if (!w) return null;
    const box = U.el('div', { class: 'card tight' });
    if (w.count === 0) {
      box.appendChild(kv('最近一次', w.current + ' kg', w.latestDate || ''));
      box.appendChild(U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '6px' },
        text: '这个区间内没有称重记录'
      }));
      return box;
    }
    box.appendChild(kv('区间变化',
      (w.delta > 0 ? '+' : '') + w.delta + ' kg',
      `${w.start} → ${w.end} kg`));
    box.appendChild(kv('最低 / 最高', `${w.min} / ${w.max} kg`, ''));
    box.appendChild(kv('称重次数', w.count + ' 次', ''));
    return box;
  }

  function renderMoney(m) {
    if (!m) return null;
    const box = U.el('div', {});

    const grid = U.el('div', { class: 'stat-grid', style: { marginBottom: '10px' } }, [
      App.stat('收入', money(m.income), '元', `生活费 ${money(m.stipend)}`),
      App.stat('支出', money(m.expense), '元', `${m.expenseCount} 笔`),
      App.stat('结余', money(m.balance), '元', ''),
      App.stat('日均支出', money(m.avgPerDay), '元', '')
    ]);
    box.appendChild(grid);

    const card = U.el('div', { class: 'card tight' });
    card.appendChild(kv('额外收入', money(m.extra), `${m.incomeCount - m.stipendCount} 笔`));
    card.appendChild(kv('记账覆盖', Math.round(m.logRate * 100) + '%',
      `${m.range ? '' : ''}${m.txnCount} 笔流水`));
    if (m.incomeWindow && m.incomeWindow.shifted) {
      card.appendChild(U.el('div', {
        style: { fontSize: '10.5px', color: 'var(--text-faint)', marginTop: '7px', lineHeight: '1.6' },
        text: `收入按错位窗口统计：${m.incomeWindow.start} ~ ${m.incomeWindow.end}`
      }));
    }
    box.appendChild(card);

    if (m.byCategory.length) {
      box.appendChild(section('支出分类'));
      const c = U.el('div', { class: 'card tight' });
      m.byCategory.slice(0, 8).forEach(x => {
        c.appendChild(App.barRow(x.category, x.amount, m.byCategory[0].amount, null,
          `${money(x.amount)} (${x.count}笔)`));
      });
      box.appendChild(c);
    }
    if (m.topPeople.length) {
      box.appendChild(section('花钱最多的地方'));
      const c = U.el('div', { class: 'card tight' });
      m.topPeople.forEach(p => {
        c.appendChild(App.barRow(p.name, p.amount, m.topPeople[0].amount, null,
          `${money(p.amount)} (${p.count}次)`));
      });
      box.appendChild(c);
    }
    return box;
  }

  function renderLongterm(lt) {
    if (!lt) return null;
    const box = U.el('div', {});

    const grid = U.el('div', { class: 'stat-grid', style: { marginBottom: '10px' } }, [
      App.stat('在办', lt.active, '项', ''),
      App.stat('本期完成', lt.completed, '项', ''),
      App.stat('本期新增', lt.added, '项', ''),
      App.stat('累计存在', lt.existedCount, '项', '')
    ]);
    box.appendChild(grid);

    if (lt.byCategory.length) {
      const c = U.el('div', { class: 'card tight' });
      lt.byCategory.forEach(x => {
        const pct = x.total ? Math.round(x.done / x.total * 100) : 0;
        c.appendChild(App.barRow(CAT_NAMES[x.cat] || x.cat, x.done, x.total || 1, null,
          `${x.done}/${x.total} 已完成 · 在办 ${x.active}`));
      });
      box.appendChild(c);
    }

    if (lt.completedList.length) {
      box.appendChild(section('本期完成的长期任务'));
      const c = U.el('div', { class: 'card tight' });
      lt.completedList.forEach(t => {
        c.appendChild(U.el('div', {
          style: { display: 'flex', gap: '7px', fontSize: '12.5px', padding: '5px 0', alignItems: 'baseline' }
        }, [
          U.el('span', { style: { color: 'var(--ok)', flexShrink: '0' }, text: '✓' }),
          U.el('span', { style: { flex: '1', minWidth: '0' }, text: t.title }),
          U.el('span', { style: { fontSize: '10.5px', color: 'var(--text-faint)' }, text: t.date.slice(5) })
        ]));
      });
      box.appendChild(c);
    }

    /* 挂了很久没动的 —— 长期任务最怕的就是这个 */
    if (lt.stale.length) {
      box.appendChild(section('挂了很久没动的'));
      const c = U.el('div', { class: 'card tight' });
      lt.stale.forEach(t => {
        c.appendChild(U.el('div', {
          style: { display: 'flex', gap: '7px', fontSize: '12.5px', padding: '5px 0', alignItems: 'baseline' }
        }, [
          U.el('span', { style: { color: 'var(--warn, #f59e0b)', flexShrink: '0' }, text: '⏳' }),
          U.el('span', { style: { flex: '1', minWidth: '0' }, text: t.title }),
          U.el('span', {
            style: { fontSize: '10.5px', color: 'var(--text-faint)', flexShrink: '0' },
            text: t.ageDays + ' 天'
          })
        ]));
      });
      box.appendChild(c);
      box.appendChild(U.el('div', {
        style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '6px', lineHeight: '1.6' },
        text: '这些长期任务挂了一个月以上还没动。要么安排上，要么删掉 —— 一直搁着只会让列表越来越沉。'
      }));
    }
    return box;
  }

  function renderTrend(unit, anchor) {
    const series = History.series(unit, anchor, unit === 'year' ? 5 : 8);
    const have = series.filter(x => x.expense != null || x.healthScore != null);
    if (have.length < 2) return null;

    const box = U.el('div', {});
    const items = series.map(x => ({ label: x.short, value: x.expense || 0 }));
    const hasExpense = items.some(i => i.value > 0);
    if (hasExpense) {
      const cv = U.el('canvas', { width: 660, height: 260,
        style: { width: '100%', height: '130px' } });
      const c = U.el('div', { class: 'card tight' }, [cv]);
      box.appendChild(c);
      setTimeout(() => {
        try { Charts.bars(cv, items, { color: 'var(--danger)', unit: '元' }); }
        catch (e) { console.warn('趋势图画失败', e); }
      }, 0);
      box.appendChild(U.el('div', {
        style: { fontSize: '10.5px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '4px' },
        text: '各期支出'
      }));
    }

    const hp = series.filter(x => x.healthScore != null);
    if (hp.length >= 2) {
      const cv2 = U.el('canvas', { width: 660, height: 260,
        style: { width: '100%', height: '130px' } });
      const c2 = U.el('div', { class: 'card tight', style: { marginTop: '10px' } }, [cv2]);
      box.appendChild(c2);
      /* Charts.line 要的是 {x, y} 点对象，不是裸数字 —— 而且 x 必须可比较
         排序（它内部会 sort + 去重），所以用 range.key 而不是 "9/28" 这种短标签。 */
      const pts = key => series
        .map(x => ({ x: x.key, y: x[key] }))
        .filter(p => p.y != null);
      setTimeout(() => {
        try {
          Charts.line(cv2, [
            { name: '健康度', color: 'var(--brand)', points: pts('healthScore') },
            { name: '作息', color: '#3b6ef6', points: pts('sleepScore') },
            { name: '饮食', color: '#0d9488', points: pts('dietScore') }
          ], { height: 130, zeroLine: true, yFormat: v => String(Math.round(v)) });
        } catch (e) { console.warn('健康度趋势失败', e); }
      }, 0);
      box.appendChild(U.el('div', {
        style: { fontSize: '10.5px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '4px' },
        text: '健康度趋势'
      }));
    }
    return box;
  }

  /* ───────── 主视图 ───────── */

  Views.history = function () {
    const root = U.$('#view-history');
    if (!root) return;
    root.innerHTML = '';

    const s = History.summarize(st.unit, st.anchor);
    const atCurrent = History.isCurrent(st.unit, st.anchor);

    /* 顶部：粒度切换 */
    const seg = U.el('div', {
      style: {
        display: 'flex', background: 'var(--bg-sunken, rgba(0,0,0,.05))',
        borderRadius: '10px', padding: '3px', marginBottom: '12px'
      }
    });
    UNIT_TABS.forEach(t => {
      const on = st.unit === t.id;
      seg.appendChild(U.el('button', {
        style: {
          flex: '1', border: 'none', background: on ? 'var(--card, #fff)' : 'transparent',
          boxShadow: on ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
          borderRadius: '8px', padding: '8px 0', fontSize: '13px',
          fontWeight: on ? '700' : '500',
          color: on ? 'var(--text)' : 'var(--text-dim)', cursor: 'pointer'
        },
        text: t.name,
        onclick: () => {
          st.unit = t.id;
          st.anchor = U.ymd(new Date());     // 切粒度回到本期
          App.go('history');
        }
      }));
    });
    root.appendChild(seg);

    /* 区间导航 */
    root.appendChild(U.el('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'var(--card, #fff)', borderRadius: '12px', padding: '8px 10px'
      }
    }, [
      U.el('button', {
        class: 'btn ghost sm', style: { flexShrink: '0', padding: '6px 11px' },
        text: '‹',
        onclick: () => { st.anchor = History.shift(st.unit, st.anchor, -1); App.go('history'); }
      }),
      U.el('div', { style: { flex: '1', textAlign: 'center', minWidth: '0' } }, [
        U.el('div', { style: { fontSize: '14px', fontWeight: '700' }, text: s.range.label }),
        U.el('div', {
          style: { fontSize: '10.5px', color: 'var(--text-faint)', marginTop: '1px' },
          text: s.range.sub
        })
      ]),
      U.el('button', {
        class: 'btn ghost sm',
        style: { flexShrink: '0', padding: '6px 11px', opacity: atCurrent ? '.35' : '1' },
        text: '›',
        onclick: () => {
          if (atCurrent) return;
          st.anchor = History.shift(st.unit, st.anchor, 1);
          App.go('history');
        }
      })
    ]));

    /* 如果不在本期，给一个「回到现在」 */
    if (!atCurrent) {
      root.appendChild(U.el('button', {
        class: 'btn ghost sm block', style: { marginTop: '8px' },
        text: '回到本期',
        onclick: () => { st.anchor = U.ymd(new Date()); App.go('history'); }
      }));
    }

    /* 健康度总览 */
    root.appendChild(section('健康度'));
    root.appendChild(renderHealth(s));

    /* 和上期比 */
    const cmp = History.compare(st.unit, st.anchor);
    const cmpBox = renderCompare(cmp);
    if (cmpBox) {
      root.appendChild(section('和上一' + s.unitName + '比'));
      root.appendChild(cmpBox);
    }

    /* 作息 */
    root.appendChild(section('作息'));
    root.appendChild(renderSleep(s.sleep));

    /* 饮食 */
    root.appendChild(section('饮食'));
    root.appendChild(renderDiet(s.diet));

    /* 体重 */
    const wBox = renderWeight(s.weight);
    if (wBox) {
      root.appendChild(section('体重'));
      root.appendChild(wBox);
    }

    /* 账本 */
    root.appendChild(section('账本'));
    root.appendChild(renderMoney(s.money));

    /* 长期任务（用户明确要求：日程部分只看长期任务） */
    root.appendChild(section('长期任务', U.el('span', {
      style: { fontSize: '10.5px', color: 'var(--text-faint)' },
      text: '只看长期，不看有截止日的'
    })));
    root.appendChild(renderLongterm(s.longterm));

    /* 其他 */
    const extras = [];
    if (s.tasks && (s.tasks.completed || s.tasks.created)) {
      extras.push(kv('完成任务', s.tasks.completed + ' 项', `本期新建 ${s.tasks.created}`));
    }
    if (s.tasks && s.tasks.overdue) {
      extras.push(kv('逾期未完成', s.tasks.overdue + ' 项', ''));
    }
    if (s.reviews) {
      extras.push(kv('间隔复习', `复习 ${s.reviews.done} 次`, `到期 ${s.reviews.due}`));
    }
    if (extras.length) {
      root.appendChild(section('其他'));
      const c = U.el('div', { class: 'card tight' });
      extras.forEach(e => c.appendChild(e));
      root.appendChild(c);
    }

    /* 趋势 */
    const trend = renderTrend(st.unit, st.anchor);
    if (trend) {
      root.appendChild(section('趋势'));
      root.appendChild(trend);
    }
  };

  Views.historyState = st;
  /* 截图/测试用 */
  Views.historySet = function (unit, anchor) {
    if (unit) st.unit = unit;
    if (anchor) st.anchor = anchor;
  };
  global.Views = Views;
})(window);