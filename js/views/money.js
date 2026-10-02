/* ═══════════════════════════════════════════════
   views/money.js — 钱财管理账本
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const Views = global.Views || (global.Views = {});

  const st = { month: null, tab: 'overview', importPreview: null, batch: false, sel: {} };

  Views.money = function () {
    const root = U.$('#view-money');
    if (!st.month) st.month = U.ymd(U.today()).slice(0, 7);

    /* ───── 月份切换 ───── */
    root.appendChild(U.el('div', {
      class: 'card tight',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }
    }, [
      U.el('button', { class: 'icon-btn sm', onclick: () => shiftMonth(-1) },
        [U.svg('M15 6l-6 6 6 6', { sw: '2.2' })]),
      U.el('button', {
        style: { flex: '1', textAlign: 'center' },
        onclick: () => { st.month = U.ymd(U.today()).slice(0, 7); App.refresh(); }
      }, [
        U.el('div', { style: { fontSize: '15.5px', fontWeight: '700' }, text: st.month.replace('-', ' 年 ') + ' 月' }),
        U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)' },
          text: S.txnsInMonth(st.month).length + ' 笔记录' })
      ]),
      U.el('button', { class: 'icon-btn sm', onclick: () => shiftMonth(1) },
        [U.svg('M9 6l6 6-6 6', { sw: '2.2' })])
    ]));

    /* ───── Tab ───── */
    root.appendChild(App.seg([
      { value: 'overview', label: '概览' },
      { value: 'list', label: '明细' },
      { value: 'rules', label: '分类规则' }
    ], st.tab, v => { st.tab = v; App.refresh(); }));

    root.appendChild(U.el('div', { style: { height: '14px' } }));

    if (st.tab === 'overview') renderOverview(root);
    else if (st.tab === 'list') renderList(root);
    else renderRules(root);

    /* ───── 操作 ───── */
    root.appendChild(U.el('div', { class: 'row', style: { marginTop: '6px' } }, [
      U.el('button', {
        class: 'btn primary grow', text: '＋ 记一笔',
        onclick: () => openTxnEditor(null)
      }),
      U.el('button', {
        class: 'btn ghost', style: { flexShrink: '0' }, text: '导入账单',
        /* 必须包一层。直接写 onclick: openWeChatImport 的话，
           openWeChatImport 的第一个形参收到的会是 MouseEvent，
           于是 mode 变成个事件对象、匹配不上任何分支、一路掉到 CSV 页。 */
        onclick: () => openWeChatImport()
      })
    ]));
  };

  function shiftMonth(d) {
    let [y, m] = st.month.split('-').map(Number);
    m += d;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    st.month = `${y}-${U.pad(m)}`;
    App.refresh();
  }

  /* ═══════════ 概览 ═══════════ */
  function renderOverview(root) {
    const s = S.monthSummary(st.month);
    const money = S.settings.money;

    /* 核心数字 */
    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { style: { textAlign: 'center', marginBottom: '14px' } }, [
        U.el('div', { style: { fontSize: '12px', color: 'var(--text-dim)' }, text: '本月结余' }),
        U.el('div', {
          style: {
            fontSize: '34px', fontWeight: '700', letterSpacing: '-.03em',
            color: s.balance >= 0 ? 'var(--ok)' : 'var(--danger)'
          },
          text: (s.balance >= 0 ? '+' : '−') + U.money(Math.abs(s.balance))
        }),
        money.savingGoal ? U.el('div', {
          style: { fontSize: '12px', marginTop: '4px', color: s.balance >= money.savingGoal ? 'var(--ok)' : 'var(--text-dim)' },
          text: s.balance >= money.savingGoal
            ? `✓ 已达成储蓄目标 ${U.money(money.savingGoal)}`
            : `距储蓄目标还差 ${U.money(money.savingGoal - s.balance)}`
        }) : null
      ]),
      U.el('div', { class: 'stat-grid' }, [
        App.stat('收入', U.money(s.income), '元', '按账单实收'),
        App.stat('支出', U.money(s.expense), '元'),
        App.stat('笔数', s.count, '笔'),
        App.stat('日均支出', s.count ? U.money(s.expense / new Date(+st.month.slice(0, 4), +st.month.slice(5, 7), 0).getDate()) : '0.00', '元')
      ])
    ]));

    /* 收入拆分：固定生活费 vs 额外收入。
       这两个必须分开——生活费是定额的，额外收入是意外之财，
       混在一起看不清「这个月是不是多赚了」。 */
    const incCard = U.el('div', { class: 'card tight', style: { marginTop: '12px' } });
    incCard.appendChild(U.el('div', { class: 'card-head', style: { marginBottom: '8px' } }, [
      U.el('h3', { text: '💰 收入明细' }),
      U.el('span', { class: 'hint', text: s.incomeWindow.shifted ? '含上月最后一天' : '自然月' })
    ]));
    incCard.appendChild(U.el('div', { class: 'stat-grid' }, [
      App.stat('固定生活费', U.money(s.stipend), '元', `${s.stipendCount} 笔`),
      App.stat('额外收入', U.money(s.extra), '元', `${s.extraCount} 笔`)
    ]));

    /* 收齐了没：用户是每月 1500 分两次。参考值只用来提示，不算进总额。 */
    if (s.referenceIncome != null && s.referenceIncome > 0) {
      const diff = U.round(s.stipend - s.referenceIncome, 2);
      const got = s.stipendCount;
      let msg, tone;
      if (Math.abs(diff) < 0.01) {
        msg = `生活费已收齐 ${U.money(s.stipend)}（${got} 笔）`;
        tone = 'ok';
      } else if (diff < 0) {
        msg = `生活费还差 ${U.money(-diff)}（已收 ${got} 笔，共 ${U.money(s.stipend)}）`;
        tone = 'warn';
      } else {
        msg = `生活费比参考值多 ${U.money(diff)}（${got} 笔）`;
        tone = 'info';
      }
      incCard.appendChild(U.el('div', {
        style: {
          fontSize: '12px', lineHeight: '1.65', marginTop: '10px', padding: '7px 10px', borderRadius: '8px',
          background: tone === 'ok' ? 'var(--ok-soft)' : tone === 'warn' ? 'rgba(245,158,11,.12)' : 'var(--bg-sunken)',
          color: tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn, #f59e0b)' : 'var(--text-dim)'
        },
        text: msg
      }));
    }

    incCard.appendChild(U.el('div', {
      style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '8px', lineHeight: '1.6' },
      text: `收入窗口 ${s.incomeWindow.start} ~ ${s.incomeWindow.end}`
          + `（生活费常在上月底提前到账，所以收入范围比自然月错开一天；支出仍按自然月）`
    }));
    root.appendChild(incCard);

    /* 分类饼图 */
    const txns = S.txnsInMonth(st.month).filter(t => t.type === 'expense');
    if (txns.length) {
      const byCat = {};
      txns.forEach(t => { byCat[t.category || '其他'] = (byCat[t.category || '其他'] || 0) + t.amount; });
      const items = Object.keys(byCat)
        .map(k => ({ label: k, value: U.round(byCat[k], 2) }))
        .sort((a, b) => b.value - a.value);

      const palette = ['#3b6ef6', '#8b5cf6', '#0d9488', '#e08c00', '#e5484d', '#12a150',
                       '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#84cc16', '#06b6d4', '#a855f7'];
      items.forEach((it, i) => it.color = palette[i % palette.length]);

      root.appendChild(U.el('div', { class: 'section-label', text: '支出构成' }));
      const cCard = U.el('div', { class: 'card tight' });
      const canvas = U.el('canvas');
      cCard.appendChild(U.el('div', { class: 'chart-box' }, [canvas]));
      root.appendChild(cCard);

      requestAnimationFrame(() => {
        Charts.donut(canvas, items, {
          centerText: U.moneyShort(s.expense),
          centerSub: '元',
          valueFormat: v => U.money(v) + '元'
        });
      });

      /* 分类排行 */
      root.appendChild(U.el('div', { class: 'section-label', text: '分类排行' }));
      const rCard = U.el('div', { class: 'card tight' });
      const max = items[0].value;
      items.forEach((it, i) => {
        const pct = Math.round(it.value / s.expense * 100);
        rCard.appendChild(App.barRow(
          it.label, it.value, max, it.color,
          `${U.money(it.value)} (${pct}%)`
        ));
      });
      root.appendChild(rCard);
    } else {
      root.appendChild(App.empty('本月还没有支出记录', '点下面「导入账单」或手动记一笔'));
    }

    /* 预算 */
    if (money.monthlyBudget) {
      const pct = U.clamp(s.expense / money.monthlyBudget * 100, 0, 100);
      root.appendChild(U.el('div', { class: 'card tight' }, [
        U.el('div', { class: 'card-head', style: { marginBottom: '9px' } }, [
          U.el('h3', { text: '预算使用' }),
          U.el('span', {
            class: 'hint',
            style: { color: pct > 100 ? 'var(--danger)' : pct > 80 ? 'var(--warn)' : 'var(--ok)', fontWeight: '700' },
            text: Math.round(s.expense / money.monthlyBudget * 100) + '%'
          })
        ]),
        App.barRow('已用', s.expense, money.monthlyBudget,
          pct > 100 ? 'var(--danger)' : pct > 80 ? 'var(--warn)' : 'var(--ok)',
          `${U.money(s.expense)} / ${U.money(money.monthlyBudget)}`)
      ]));
    }

    /* 发给 AI */
    if (txns.length || s.expense > 0) {
      root.appendChild(U.el('button', {
        class: 'btn ghost block', style: { marginTop: '4px' },
        text: '🤖 让 AI 分析本月消费',
        onclick: () => openMoneyAI()
      }));
    }
  }

  /* ═══════════ 明细 ═══════════ */
  function renderList(root) {
    const list = S.txnsInMonth(st.month).slice().sort((a, b) =>
      ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));

    if (!list.length) {
      root.appendChild(App.empty('本月没有记录'));
      return;
    }

    /* 批量模式：一笔笔改太慢，尤其刚导入完几十条未归类的。
       进入后每行出现勾选框，可一次改分类/用途，并顺手沉淀成规则。 */
    if (!st.sel) st.sel = {};                 // id → true
    const selCount = Object.keys(st.sel).filter(id => st.sel[id]).length;

    root.appendChild(U.el('div', { class: 'row', style: { marginBottom: '10px', gap: '8px' } }, [
      U.el('button', {
        class: st.batch ? 'btn primary sm grow' : 'btn ghost sm grow',
        text: st.batch ? `已选 ${selCount} 笔` : '批量整理',
        onclick: () => {
          st.batch = !st.batch;
          if (!st.batch) st.sel = {};
          App.refresh();
        }
      }),
      st.batch ? U.el('button', {
        class: 'btn ghost sm', text: '全选本月',
        onclick: () => {
          list.forEach(t => { st.sel[t.id] = true; });
          App.refresh();
        }
      }) : null,
      st.batch ? U.el('button', {
        class: 'btn ghost sm', text: '清空',
        onclick: () => { st.sel = {}; App.refresh(); }
      }) : null
    ].filter(Boolean)));

    if (st.batch && selCount) {
      root.appendChild(U.el('button', {
        class: 'btn primary block', style: { marginBottom: '12px' },
        text: `整理选中的 ${selCount} 笔`,
        onclick: () => {
          const picked = list.filter(t => st.sel[t.id]);
          openBatchEditor(picked, () => { st.sel = {}; st.batch = false; App.refresh(); });
        }
      }));
    }

    /* 按日分组 */
    let curDate = null;
    list.forEach(t => {
      if (t.date !== curDate) {
        curDate = t.date;
        const dayTotal = list.filter(x => x.date === curDate)
          .reduce((s, x) => s + (x.type === 'expense' ? x.amount : 0), 0);
        root.appendChild(U.el('div', {
          class: 'section-label',
          style: { display: 'flex', justifyContent: 'space-between' },
          text: ''
        }, []));
        const label = root.lastChild;
        label.appendChild(U.el('span', { text: U.friendly(curDate) }));
        label.appendChild(U.el('span', { text: dayTotal ? '−' + U.money(dayTotal) : '' }));
      }

      const isExpense = t.type === 'expense';
      const row = U.el('div', {
        class: 'task',
        style: { paddingLeft: '15px' }
      }, [
        /* 批量模式下的勾选框 */
        st.batch ? U.el('div', {
          style: {
            width: '19px', height: '19px', borderRadius: '5px', flexShrink: '0',
            border: '1.5px solid ' + (st.sel[t.id] ? 'var(--brand)' : 'var(--border)'),
            background: st.sel[t.id] ? 'var(--brand)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '12px', lineHeight: '1'
          },
          text: st.sel[t.id] ? '✓' : ''
        }) : null,
        U.el('div', {
          class: 'grow',
          style: { minWidth: '0' }
        }, [
          U.el('div', { style: { fontSize: '14.5px', fontWeight: '600', wordBreak: 'break-word' },
            text: t.counterparty || t.product || '（无对方）' }),
          /* 用途单独一行——它比时间/支付方式重要，是「这笔钱干了什么」 */
          t.purpose ? U.el('div', {
            style: { fontSize: '12px', color: 'var(--text-dim)', marginTop: '3px' },
            text: '📌 ' + t.purpose
          }) : null,
          U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '3px', display: 'flex', gap: '7px', flexWrap: 'wrap' } }, [
            t.time ? U.el('span', { text: t.time }) : null,
            t.product && t.product !== '/' ? U.el('span', { text: t.product }) : null,
            t.method ? U.el('span', { text: t.method }) : null,
            t.source === 'wechat' ? U.el('span', { class: 'badge', text: '微信' }) : null,
            /* 让用户一眼看出「这条为什么被归成生活费」，而不是对着结果发懵 */
            t.ruleKeyword ? U.el('span', {
              class: 'badge',
              style: { background: 'var(--brand-soft)', color: 'var(--brand)' },
              text: '规则·' + t.ruleKeyword
            }) : null,
            t.edited ? U.el('span', { class: 'badge', text: '已改' }) : null
          ].filter(Boolean))
        ]),
        U.el('div', { style: { textAlign: 'right', flexShrink: '0' } }, [
          U.el('div', {
            style: { fontSize: '15px', fontWeight: '700', color: isExpense ? 'var(--text)' : 'var(--ok)', fontVariantNumeric: 'tabular-nums' },
            text: (isExpense ? '−' : '+') + U.money(t.amount)
          }),
          t.category ? U.el('div', { style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }, text: t.category }) : null
        ])
      ]);
      row.addEventListener('click', () => {
        if (st.batch) { st.sel[t.id] = !st.sel[t.id]; App.refresh(); return; }
        openTxnEditor(t);
      });
      root.appendChild(row);
    });
  }

  /* ═══════════ 批量整理 ═══════════ */
  function openBatchEditor(picked, onDone) {
    /* 只让用户改「选中的这些共同有的」方向；
       混合方向时提示会按各自方向分别学规则。 */
    const dirs = {};
    picked.forEach(t => { dirs[t.type] = (dirs[t.type] || 0) + 1; });
    const mixed = Object.keys(dirs).length > 1;

    const patch = { category: '', purpose: '' };

    const box = U.el('div', {}, []);
    function rebuild() {
      box.innerHTML = '';

      box.appendChild(U.el('div', {
        class: 'card tight',
        style: { background: 'var(--bg-sunken)', border: 'none', marginBottom: '14px' }
      }, [
        U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.7' },
          text: `将修改选中的 ${picked.length} 笔：`
              + (dirs.income ? `收入 ${dirs.income} 笔 ` : '')
              + (dirs.expense ? `支出 ${dirs.expense} 笔` : '') }),
        mixed ? U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '4px' },
          text: '含两个方向，会按各自方向分别记住规则' }) : null
      ].filter(Boolean)));

      box.appendChild(App.field('新分类（留空则不改）', App.chips(
        S.txnCategories().map(c => ({ value: c, label: c })), patch.category,
        v => { patch.category = patch.category === v ? '' : v; rebuild(); })));
      box.appendChild(App.field('新用途（留空则不改）',
        App.input('text', patch.purpose, v => { patch.purpose = v; }, '如 生活费 / 房租')));

      /* 记住规则：批量整理完通常都希望下次自动 */
      const remembers = U.el('input', { type: 'checkbox' });
      remembers.checked = true;
      remembers.style.cssText = 'width:18px;height:18px;flex-shrink:0;accent-color:var(--brand)';
      box.appendChild(U.el('label', {
        style: { display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
          background: 'var(--bg-sunken)', padding: '10px 12px', borderRadius: '10px', marginBottom: '14px' }
      }, [
        remembers,
        U.el('div', { class: 'grow', style: { fontSize: '12.5px', lineHeight: '1.65' } }, [
          U.el('div', { style: { fontWeight: '600' }, text: '按对方记住规则' }),
          U.el('div', { style: { color: 'var(--text-dim)' },
            text: '同一对方下次导入时自动分到这个分类' })
        ])
      ]));

      box.appendChild(U.el('div', { class: 'row', style: { marginTop: '16px' } }, [
        U.el('button', {
          class: 'btn primary grow', text: `应用到 ${picked.length} 笔`,
          onclick: () => {
            if (!patch.category && !patch.purpose) return U.toast('分类和用途至少填一个', 'err');
            let rulesMade = 0;
            picked.forEach(t => {
              if (patch.category) t.category = patch.category;
              if (patch.purpose) t.purpose = patch.purpose;
              t.edited = true;
              S.update('txns', t.id, t);
              if (remembers.checked && patch.category) {
                const got = S.learnRuleFromTxn(t);
                if (got && got.created) rulesMade++;
              }
            });
            App.closeSheet();
            U.toast(`已整理 ${picked.length} 笔`
              + (rulesMade ? `，新增 ${rulesMade} 条规则` : ''), 'ok');
            if (onDone) onDone();
          }
        })
      ]));
    }
    rebuild();
    App.sheet(`批量整理 ${picked.length} 笔`, box, { autofocus: false });
  }

  /* ═══════════ 分类规则 ═══════════ */
  function renderRules(root) {
    const rules = S.all('txnRules');
    const txns = S.all('txns');

    root.appendChild(U.el('div', {
      class: 'card tight',
      style: { background: 'var(--brand-soft)', border: 'none' }
    }, [
      U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.7', color: 'var(--brand)' },
        text: '改任何一笔账的分类，就会自动生成一条规则。规则分收入/支出两个方向——'
            + '「张三转给我=生活费」和「我转给张三=其他」互不干扰。下次导入同样的人就自动分好。' })
    ]));

    const dirLabel = d => d === 'income' ? '收入' : d === 'expense' ? '支出' : '双向';

    if (rules.length) {
      root.appendChild(U.el('div', { class: 'section-label', text: `我的规则（${rules.length}）` }));
      const card = U.el('div', { class: 'card tight' });
      rules.forEach(r => {
        const row = U.el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0', borderBottom: '1px solid var(--border)' }
        }, [
          U.el('div', { class: 'grow', style: { minWidth: '0' } }, [
            U.el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
              U.el('span', { style: { fontSize: '13.5px', fontWeight: '600' }, text: r.keyword }),
              U.el('span', {
                class: 'badge',
                style: r.direction === 'income'
                  ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                  : r.direction === 'expense' ? { background: 'var(--bg-sunken)', color: 'var(--text-dim)' } : {},
                text: dirLabel(r.direction)
              })
            ]),
            U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' },
              text: '→ ' + (r.category || '（未设分类）') + (r.purpose ? ' · ' + r.purpose : '') }),
            U.el('div', { style: { fontSize: '10.5px', color: 'var(--text-faint)', marginTop: '1px' },
              text: r.hits ? `用过 ${r.hits} 次` : '' })
          ]),
          U.el('button', {
            class: 'btn ghost sm', text: '回填',
            title: '把这条规则套用到已有记录上',
            onclick: () => {
              const n = S.applyRuleToHistory(r);
              U.toast(n ? `已回填 ${n} 笔` : '没有可回填的记录', n ? 'ok' : '');
              App.refresh();
            }
          }),
          U.el('button', {
            class: 'icon-btn sm', onclick: () => {
              App.confirm(`删除规则「${r.keyword}」？`, () => {
                S.remove('txnRules', r.id); U.toast('已删除'); App.refresh();
              }, '删除');
            }
          }, [U.svg(['M6 6l12 12', 'M18 6L6 18'], { sw: '2' })])
        ]);
        row.addEventListener('click', () => openRuleEditor(r));
        card.appendChild(row);
      });
      root.appendChild(card);
    }

    /* 建议规则 */
    let suggestions = [];
    try { suggestions = WeChat.suggestRules(txns.filter(t => t.category === '其他')) || []; }
    catch (e) { suggestions = []; }

    if (suggestions.length) {
      root.appendChild(U.el('div', { class: 'section-label', text: '建议添加' }));
      const card = U.el('div', { class: 'card tight' });
      suggestions.slice(0, 12).forEach(sg => {
        /* 建议也带方向：sg.type 来自那批未归类记录的方向 */
        const dir = sg.type === 'income' ? 'income' : 'expense';
        card.appendChild(U.el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 0', borderBottom: '1px solid var(--border)' }
        }, [
          U.el('div', { class: 'grow', style: { minWidth: '0' } }, [
            U.el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
              U.el('span', { style: { fontSize: '13.5px', fontWeight: '600' }, text: sg.keyword }),
              U.el('span', {
                class: 'badge',
                style: dir === 'income' ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : {},
                text: dir === 'income' ? '收入' : '支出'
              })
            ]),
            U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' },
              text: `${sg.count} 笔 · 例如「${sg.sample || ''}」` })
          ]),
          App.selectEl(
            [{ value: '', label: '选分类…' }].concat(
              S.txnCategories().map(c => ({ value: c, label: c }))
            ),
            '',
            v => {
              if (!v) return;
              const rule = { id: U.uid('ru_'), keyword: sg.keyword, direction: dir, category: v, hits: 0 };
              S.add('txnRules', rule);
              const n = S.applyRuleToHistory(rule);
              U.toast(n ? `已添加规则，回填 ${n} 笔` : '已添加规则', 'ok');
              App.refresh();
            }
          )
        ]));
      });
      root.appendChild(card);
    } else if (!rules.length) {
      root.appendChild(App.empty('还没有自定义规则', '导入账单后，未归类的商户会在这里给出建议'));
    }

    /* 手动加一条规则——有时想提前设好，不等导入 */
    root.appendChild(U.el('button', {
      class: 'btn ghost block', style: { marginTop: '12px' },
      text: '＋ 手动加一条规则',
      onclick: () => openRuleEditor(null)
    }));
  }

  /* ═══════════ 规则编辑 ═══════════ */
  function openRuleEditor(rule) {
    const isNew = !rule;
    const r = rule ? Object.assign({}, rule)
      : { keyword: '', direction: 'expense', category: '', purpose: '' };

    const box = U.el('div', {}, []);
    function rebuild() {
      box.innerHTML = '';
      box.appendChild(App.field('关键词', App.input('text', r.keyword, v => { r.keyword = v; },
        '对方名字或商户名，如 张三、美团'), '匹配对方／商品／备注，包含就算命中'));
      box.appendChild(App.field('流向', App.seg([
        { value: 'expense', label: '支出' },
        { value: 'income', label: '收入' },
        { value: 'both', label: '双向' }
      ], r.direction || 'expense', v => { r.direction = v; rebuild(); }),
        '同名对方两个方向可以设两条规则'));
      box.appendChild(App.field('分类', App.chips(
        S.txnCategories().map(c => ({ value: c, label: c })), r.category,
        v => { r.category = v; rebuild(); })));
      box.appendChild(App.field('用途（可空）', App.input('text', r.purpose, v => { r.purpose = v; },
        '如 生活费、房租')));

      box.appendChild(U.el('div', { class: 'row', style: { marginTop: '16px' } }, [
        isNew ? null : U.el('button', {
          class: 'btn danger', text: '删除',
          onclick: () => App.confirm('删除这条规则？', () => {
            S.remove('txnRules', r.id); App.closeSheet(); App.refresh();
          }, '删除')
        }),
        U.el('button', {
          class: 'btn primary grow', text: isNew ? '添加' : '保存',
          onclick: () => {
            if (!r.keyword || r.keyword.trim().length < 2) return U.toast('关键词至少 2 个字', 'err');
            r.keyword = r.keyword.trim();
            if (isNew) S.add('txnRules', r);
            else S.update('txnRules', r.id, r);
            const n = S.applyRuleToHistory(r);
            App.closeSheet();
            App.refresh();
            U.toast(n ? `已保存，回填 ${n} 笔` : '已保存', 'ok');
          }
        })
      ]));
    }
    rebuild();
    App.sheet(isNew ? '新增规则' : '编辑规则', box, { autofocus: false });
  }

  /* ═══════════ 记一笔 / 编辑 ═══════════ */
  function openTxnEditor(txn) {
    const isNew = !txn;
    const t = txn ? Object.assign({}, txn) : {
      date: U.ymd(U.today()), time: U.pad(new Date().getHours()) + ':' + U.pad(new Date().getMinutes()),
      type: 'expense', amount: '', counterparty: '', product: '', category: '餐饮', method: '', note: ''
    };

    /* 用 S.txnCategories() 而不是 Object.keys(WeChat.CATEGORIES)：
       CATEGORIES 是数组，Object.keys 会返回 ["0","1",...] 下标，
       这正是编辑器里分类变成数字的原因。 */
    const cats = S.txnCategories();
    const typeSeg = App.seg([
      { value: 'expense', label: '支出' },
      { value: 'income', label: '收入' }
    ], t.type, v => { t.type = v; });

    const amountIn = App.input('number', t.amount, v => { t.amount = v; }, '0.00', '0.01');

    const box = U.el('div', {}, []);

    function rebuild() {
      box.innerHTML = '';
      box.appendChild(App.field('类型', App.seg([
        { value: 'expense', label: '支出' }, { value: 'income', label: '收入' }
      ], t.type, v => { t.type = v; rebuild(); })));
      box.appendChild(App.field('金额（元）', amountIn));
      box.appendChild(App.field('分类', App.chips(cats.map(c => ({ value: c, label: c })), t.category,
        v => { t.category = v; rebuild(); })));

      /* 用途：自由文本，比分类细一层。
         分类回答「算哪一类」，用途回答「干什么用的」——
         同样是「转账」，一个是房租、一个是给妹妹生活费。 */
      const purposeIn = App.input('text', t.purpose, v => { t.purpose = v; },
        '如 这个月房租 / 给妹妹生活费');
      box.appendChild(App.field('用途（可空）', purposeIn, '分类管「算哪一类」，用途管「干什么用的」'));
      const hist = S.txnPurposes().filter(p => p !== (t.purpose || ''));
      if (hist.length) {
        box.appendChild(U.el('div', { class: 'chips', style: { marginTop: '-6px', marginBottom: '12px' } },
          hist.slice(0, 8).map(p => U.el('button', {
            class: 'chip', type: 'button', text: p,
            onclick: () => { t.purpose = p; rebuild(); }
          }))));
      }

      box.appendChild(App.field('商户 / 对方', App.input('text', t.counterparty, v => { t.counterparty = v; }, '如 食堂、美团')));
      box.appendChild(App.field('商品 / 说明', App.input('text', t.product, v => { t.product = v; }, '如 午餐')));
      box.appendChild(App.field('日期', App.input('date', t.date, v => { t.date = v; })));
      box.appendChild(App.field('时间', App.input('time', t.time, v => { t.time = v; })));
      box.appendChild(App.field('支付方式', App.input('text', t.method, v => { t.method = v; }, '零钱 / 银行卡')));
      box.appendChild(App.field('备注', App.input('text', t.note, v => { t.note = v; })));

      /* 记住规则：这是「下次导入自动分好」的关键。
         默认勾上，因为用户既然手动改了，多半希望以后都这样。 */
      const kwPreview = (t.counterparty || t.product || '').trim();
      const remembers = U.el('input', { type: 'checkbox' });
      remembers.checked = !!(kwPreview && kwPreview.length >= 2 && !isNew);
      remembers.style.cssText = 'width:18px;height:18px;flex-shrink:0;accent-color:var(--brand)';
      if (kwPreview && kwPreview.length >= 2 && !isNew) {
        box.appendChild(U.el('label', {
          style: {
            display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
            background: 'var(--bg-sunken)', padding: '10px 12px',
            borderRadius: '10px', marginBottom: '14px'
          }
        }, [
          remembers,
          U.el('div', { class: 'grow', style: { fontSize: '12.5px', lineHeight: '1.65' } }, [
            U.el('div', { style: { fontWeight: '600' }, text: '记住这条规则' }),
            U.el('div', {
              style: { color: 'var(--text-dim)' },
              text: `以后含「${kwPreview}」的${t.type === 'income' ? '收入' : '支出'}`
                  + `${t.category ? '自动归为「' + t.category + '」' : '自动归类'}`
            })
          ])
        ]));
      }

      box.appendChild(U.el('div', { class: 'row', style: { marginTop: '16px' } }, [
        isNew ? null : U.el('button', {
          class: 'btn danger', text: '删除',
          onclick: () => App.confirm('删除这笔记录？', () => {
            S.remove('txns', t.id); App.closeSheet(); App.refresh();
          }, '删除')
        }),
        U.el('button', {
          class: 'btn primary grow', text: isNew ? '保存' : '更新',
          onclick: () => {
            const amt = Number(t.amount);
            if (!amt || amt <= 0) return U.toast('请输入金额', 'err');
            t.amount = amt;
            t.source = t.source || 'manual';

            /* 人工改过就打标记：规则回填时跳过，不覆盖用户的手动分类 */
            if (!isNew) t.edited = true;

            let learned = null;
            if (!isNew && remembers.checked) {
              learned = S.learnRuleFromTxn(t);
            } else if (isNew && (t.counterparty || t.product || '').length >= 2 && t.category) {
              learned = S.learnRuleFromTxn(t);
            }

            if (isNew) S.add('txns', t);
            else S.update('txns', t.id, t);
            App.closeSheet();
            App.refresh();
            U.toast(learned
              ? `已保存，并记住规则「${learned.rule.keyword}」`
              : '已保存', 'ok');
          }
        })
      ]));
    }

    rebuild();
    App.sheet(isNew ? '记一笔' : '编辑记录', box, { autofocus: false });
  }

  /* ═══════════ 微信账单导入 ═══════════ */
  /* ═══════════ 导入账单：三种方式 ═══════════
     按「省事程度」排：截图 > 复制文字 > CSV。
     三种最终都汇到 showImportPreview，走同一套去重和规则。
     ═══════════════════════════════════════════ */
  /* ── 导入留痕：让「上次截到哪儿」一眼可见 ── */

  /** 把 ISO 时间转成「今天 14:05 / 昨天 09:20 / 10-02 14:05」 */
  function fromNow(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(+d)) return '—';
    const p2 = n => (n < 10 ? '0' : '') + n;
    const hh = p2(d.getHours()) + ':' + p2(d.getMinutes());
    const today = U.ymd(new Date());
    const day = U.ymd(d);
    if (day === today) return '今天 ' + hh;
    if (day === U.ymd(U.addDays(new Date(), -1))) return '昨天 ' + hh;
    return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${hh}`;
  }

  /** 最近几次导入的小卡片（没有记录就不显示） */
  function importLogCard() {
    let logs = [];
    try { logs = S.importLogs(4); } catch (e) { return U.el('div', {}); }
    if (!logs.length) return U.el('div', {});

    const card = U.el('div', { class: 'card tight', style: { marginTop: '4px' } });
    card.appendChild(U.el('div', {
      style: {
        fontSize: '11.5px', fontWeight: '700', color: 'var(--text-dim)',
        marginBottom: '6px', display: 'flex', justifyContent: 'space-between'
      }
    }, [
      U.el('span', { text: '📌 导入记录' }),
      U.el('span', {
        style: { fontWeight: '500', color: 'var(--text-faint)' },
        text: '截图前先看一眼，别漏别重'
      })
    ]));

    logs.forEach(l => {
      const parts = [`${l.count} 笔`];
      if (l.from && l.to) parts.push(l.from === l.to ? l.from : `${l.from} ~ ${l.to}`);
      if (l.images > 1) parts.push(`${l.images} 张图`);
      card.appendChild(U.el('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: '12px', padding: '5px 0', gap: '8px'
        }
      }, [
        U.el('span', { style: { fontWeight: '600', flexShrink: '0' }, text: fromNow(l.at) }),
        U.el('span', {
          style: { color: 'var(--text-dim)', flex: '1', minWidth: '0', textAlign: 'right' },
          text: l.via + ' · ' + parts.join(' · ')
        })
      ]));
    });

    const maxTo = logs.map(l => l.to).filter(Boolean).sort().pop();
    if (maxTo) {
      card.appendChild(U.el('div', {
        style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '6px', lineHeight: '1.6' },
        text: `已覆盖到 ${maxTo}`
      }));
    }
    return card;
  }

  function openWeChatImport(initialMode) {
    const st2 = {
      mode: typeof initialMode === 'string' && initialMode ? initialMode : 'pick'
    };                                             // pick | photo | text | csv
    const bodyBox = U.el('div', {});

    const ta = U.el('textarea', {
      class: 'textarea', style: { minHeight: '130px' },
      placeholder: '把账单页复制的文字，或 CSV 内容，整段粘贴到这里'
    });

    /* 统一的落地：不管哪条路，最后都进预览确认 */
    function finish(txns, warnings, label, extra) {
      if (!txns || !txns.length) {
        U.toast(warnings && warnings[0] ? warnings[0] : '没解析出记录', 'err');
        return;
      }
      App.closeSheet();
      setTimeout(() => {
        App.go('money');
        showImportPreview(Object.assign({ txns, warnings: warnings || [], via: label }, extra || {}));
      }, 280);
    }

    /* ── 路线一：截图识别（最多 5 张一起） ──
      账单页一屏只有 8~10 条，一个月要截好几张。一张一张导太折磨，
      所以允许一次选多张，逐张识别后合并成一批。
      注意不要加 capture:'environment' —— 加了会强制开相机、且不能多选。 */
    const MAX_PHOTOS = 5;

    function doPhoto() {
      const inp = U.el('input', {
        type: 'file', accept: 'image/*', multiple: true
      });
      inp.addEventListener('change', async () => {
        const files = Array.prototype.slice.call(inp.files || []);
        if (!files.length) return;
        const picked = files.slice(0, MAX_PHOTOS);
        if (files.length > MAX_PHOTOS) {
          U.toast(`一次最多 ${MAX_PHOTOS} 张，多余的已忽略`, 'err');
        }
        await runPhotoBatch(picked);
      });
      inp.click();
    }

    async function runPhotoBatch(files) {
      const n = files.length;
      const progress = U.el('div', {
        style: { fontSize: '13px', color: 'var(--text-dim)', padding: '18px 2px', textAlign: 'center' }
      });
      const bar = U.el('div', {
        style: {
          height: '6px', borderRadius: '999px', background: 'var(--bg-sunken)',
          margin: '12px auto 0', maxWidth: '220px', overflow: 'hidden'
        }
      }, [U.el('div', { style: { height: '100%', width: '0%', background: 'var(--brand)' } })]);
      const fill = bar.firstChild;
      const setProgress = (txt, pct) => {
        progress.textContent = txt;
        fill.style.width = Math.round(pct * 100) + '%';
      };

      bodyBox.innerHTML = '';
      setProgress(n > 1 ? `🤖 正在识别 1/${n} 张…` : '🤖 正在识别账单截图…（约 10~30 秒）', 0);
      bodyBox.appendChild(progress);
      bodyBox.appendChild(bar);
      bodyBox.appendChild(U.el('div', {
        style: { fontSize: '11px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '10px' },
        text: n > 1 ? `${n} 张一共要 1~2 分钟，别锁屏` : '别锁屏，识别完会自动跳到确认页'
      }));

      const all = [];
      const problems = [];
      let okCount = 0;

      for (let i = 0; i < n; i++) {
        setProgress(n > 1 ? `🤖 正在识别 ${i + 1}/${n} 张…` : '🤖 正在识别账单截图…', i / n);
        try {
          const dataUrl = await U.readFileAsDataURL(files[i]);
          const r = await AI.readBillPhoto(dataUrl);
          (r.txns || []).forEach(t => all.push(WeChat.finalizeTxn(t)));
          if (r.note) problems.push(`第 ${i + 1} 张：${r.note}`);
          okCount++;
        } catch (e) {
          /* 一张失败不该把整批废掉 —— 剩下几张照样识别 */
          problems.push(`第 ${i + 1} 张识别失败：${e.message}`);
        }
        setProgress(n > 1 ? `🤖 已识别 ${i + 1}/${n} 张…` : '🤖 识别完成', (i + 1) / n);
      }

      if (!all.length) {
        bodyBox.innerHTML = '';
        bodyBox.appendChild(U.el('div', {
          style: { fontSize: '12.5px', color: 'var(--danger)', padding: '10px 2px', lineHeight: '1.6' },
          text: problems.length ? problems.join('\n') : '这几张里没读出交易记录'
        }));
        bodyBox.appendChild(U.el('button', {
          class: 'btn ghost block sm', text: '← 换别的方式',
          onclick: () => render('pick')
        }));
        return;
      }

      if (problems.length) U.toast(`${okCount}/${n} 张识别成功，有 ${problems.length} 条提示`, 'err');
      else U.toast(`识别出 ${all.length} 笔`, 'ok');

      finish(all, problems, '截图识别', { images: n });
    }

    /* ── 路线二：粘贴文字（本地解析，不花 token） ── */
    function runTextParse(txt) {
      if (!txt) return U.toast('先粘贴账单文字', 'err');
      /* 先按 CSV 试（有表头就是 CSV），不行再按账单页文字解析 */
      let txns = [], warnings = [];
      try {
        const csv = WeChat.parseCSV(txt);
        if (csv.txns.length) {
          txns = csv.txns.map(t => WeChat.finalizeTxn(t));
          warnings = csv.warnings || [];
        }
      } catch (e) { /* 不是 CSV，继续走文字解析 */ }

      if (!txns.length) {
        try {
          const bt = WeChat.parseBillText(txt);
          txns = bt.txns;
          warnings = bt.warnings || [];
        } catch (e) {
          return U.toast('解析失败：' + e.message, 'err');
        }
      }
      finish(txns, warnings, '粘贴文字');
    }

    /* ── 路线三：CSV 文件 ── */
    function pickCsv() {
      const inp = U.el('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        try {
          const txt = await U.readFile(f);
          const r = WeChat.parseCSV(txt);
          finish(r.txns.map(t => WeChat.finalizeTxn(t)), r.warnings || [], 'CSV');
        } catch (e) { U.toast('读文件失败：' + e.message, 'err'); }
      });
      inp.click();
    }

    /* ── 入口选择 ── */
    const MODES = ['pick', 'photo', 'text', 'csv'];

    function render(mode) {
      /* 兜底：拿到不认识的值就回主入口。
         下面的分支最后一个是 CSV，没有 else —— 所以任何意外值
         都会「静默地」把用户丢到 CSV 页，而不是报错。 */
      if (MODES.indexOf(mode) < 0) mode = 'pick';
      st2.mode = mode;
      bodyBox.innerHTML = '';

      if (mode === 'pick') {
        const opt = (icon, title, desc, badge, fn) => U.el('button', {
          class: 'btn ghost block', onclick: fn,
          style: {
            display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
            marginBottom: '9px', lineHeight: '1.5'
          }
        }, [
          U.el('div', { style: { fontSize: '14px', fontWeight: '700', marginBottom: '3px' } }, [
            U.el('span', { text: icon + ' ' + title }),
            badge ? U.el('span', {
              style: {
                fontSize: '10px', fontWeight: '600', marginLeft: '7px', padding: '1px 6px',
                borderRadius: '20px', background: 'var(--ok-soft)', color: 'var(--ok)'
              }, text: badge
            }) : null
          ]),
          U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', whiteSpace: 'normal' }, text: desc })
        ]);

        bodyBox.appendChild(opt('📷', '截图识别', '账单页截图，可一次选最多 5 张。最快。', '推荐',
          () => render('photo')));
        bodyBox.appendChild(opt('📋', '粘贴文字', '账单页长按全选复制，粘到下面。不花 token。', '省钱',
          () => render('text')));
        bodyBox.appendChild(opt('📄', '导入 CSV 文件', '官方导出的完整月度账单。最全，但要走邮箱。', '',
          () => render('csv')));

        /* 剪贴板里已经有账单文字的话，直接提示 */
        if (navigator.clipboard && navigator.clipboard.readText) {
          bodyBox.appendChild(U.el('button', {
            class: 'btn grow sm', style: { marginTop: '4px' },
            text: '📎 从剪贴板粘贴',
            onclick: async () => {
              try {
                const txt = await navigator.clipboard.readText();
                if (!txt || !txt.trim()) return U.toast('剪贴板是空的', 'err');
                runTextParse(txt.trim());
              } catch (e) {
                /* 浏览器可能因为没授权而拒绝，让用户手动粘贴 */
                U.toast('读不到剪贴板，请在下面手动粘贴', 'err');
                render('text');
              }
            }
          }));
        }

        bodyBox.appendChild(importLogCard());
        return;
      }

      if (mode === 'photo') {
        /* 让用户知道上次截到哪儿，免得漏一段或重复截 */
        let coverTo = null;
        try {
          const logs = S.importLogs(10);
          coverTo = logs.map(l => l.to).filter(Boolean).sort().pop() || null;
          const last = logs[0];
          if (coverTo && last) {
            bodyBox.appendChild(U.el('div', {
              class: 'card tight',
              style: { background: 'var(--brand-soft)', border: 'none', marginBottom: '12px' }
            }, [
              U.el('div', {
                style: { fontSize: '12.5px', lineHeight: '1.7', color: 'var(--brand)' },
                text: `最近一次导入是 ${fromNow(last.at)}，账目已经覆盖到 ${coverTo}。`
            }),
              U.el('div', {
                style: { fontSize: '12.5px', lineHeight: '1.7', color: 'var(--brand)', marginTop: '4px' },
                text: `这次只截 ${coverTo} 之后（更新）的那部分就行，之前那段不用再截。`
              })
            ]));
          }
        } catch (e) { /* 没有留痕就不提示 */ }
        bodyBox.appendChild(U.el('div', {
          style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7', marginBottom: '10px' },
          text: `在账单页一屏一屏截图，然后一次选最多 ${MAX_PHOTOS} 张。`
              + `逐张识别后合成一批，跳过重复的。`
        }));
        bodyBox.appendChild(U.el('div', { class: 'row' }, [
          U.el('button', { class: 'btn ghost grow', text: '← 返回', onclick: () => render('pick') }),
          U.el('button', {
            class: 'btn primary grow', text: '选择图片',
            onclick: doPhoto
          })
        ]));
        return;
      }


      if (mode === 'text') {
        bodyBox.appendChild(U.el('div', {
          class: 'card tight',
          style: { background: 'var(--ok-soft)', border: 'none', marginBottom: '12px' }
        }, [
          U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.75', color: 'var(--ok)' } }, [
            U.el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: '怎么复制（比导 CSV 少 5 步）' }),
            U.el('div', { text: '微信 → 我 → 服务 → 钱包 → 账单' }),
            U.el('div', { text: '→ 在账单页长按，全选 → 复制' }),
            U.el('div', { text: '→ 回到这里粘贴。只复制到当前屏的内容，多了要翻页再来一次' })
          ])
        ]));
        bodyBox.appendChild(ta);
        bodyBox.appendChild(U.el('div', { class: 'row', style: { marginTop: '10px' } }, [
          U.el('button', { class: 'btn ghost grow', text: '← 返回', onclick: () => render('pick') }),
          U.el('button', {
            class: 'btn primary grow', text: '解析',
            onclick: () => runTextParse(ta.value.trim())
          })
        ]));
        return;
      }

      /* CSV */
      bodyBox.appendChild(U.el('div', {
        class: 'card tight',
        style: { background: 'var(--ok-soft)', border: 'none', marginBottom: '12px' }
      }, [
        U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.75', color: 'var(--ok)' } }, [
          U.el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: '官方导出路径' }),
          U.el('div', { text: '微信 → 我 → 服务 → 钱包 → 账单 → 右上角「常见问题」' }),
          U.el('div', { text: '→ 下载账单 → 用于个人对账 → 选月份 → 填邮箱' }),
          U.el('div', { text: '→ 收到邮件解压得到 CSV，粘贴到下面或选文件' })
        ])
      ]));
      bodyBox.appendChild(ta);
      bodyBox.appendChild(U.el('div', { class: 'row', style: { marginTop: '10px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '选择 CSV 文件', onclick: pickCsv }),
        U.el('button', {
          class: 'btn primary grow', text: '解析',
          onclick: () => runTextParse(ta.value.trim())
        })
      ]));
      bodyBox.appendChild(U.el('button', {
        class: 'btn ghost block sm', style: { marginTop: '8px' },
        text: '← 返回', onclick: () => render('pick')
      }));
    }

    render(st2.mode);
    App.sheet('导入账单', bodyBox, { autofocus: false });
  }

  function showImportPreview(result) {
    /* 去重 */
    let dedup = { fresh: result.txns, dupes: [] };
    try { dedup = WeChat.dedupe(S.all('txns'), result.txns); }
    catch (e) { console.warn('dedupe 失败', e); }

    /* 兜底：万一调用方没 finalize（分类/规则/id），这里补一遍。
       正常情况下各路导入已经调过，重复调用是幂等的。 */
    dedup.fresh.forEach(t => {
      t.source = t.source || 'wechat';
      try { WeChat.finalizeTxn(t); } catch (e) { console.warn('finalize 失败', e); }
    });

    const sum = WeChat.summary(dedup.fresh);
    const box = U.el('div', {}, [
      result.via ? U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--text-faint)', marginBottom: '8px' },
        text: '来自：' + result.via + (result.images > 1 ? ` · ${result.images} 张` : '')
      }) : null,
      U.el('div', { class: 'stat-grid', style: { marginBottom: '14px' } }, [
        App.stat('新增', dedup.fresh.length, '笔'),
        App.stat('重复跳过', dedup.dupes.length, '笔'),
        App.stat('支出合计', U.money(sum.expense), '元'),
        App.stat('收入合计', U.money(sum.income), '元')
      ])
    ]);

    if (result.warnings && result.warnings.length) {
      box.appendChild(U.el('div', {
        style: { fontSize: '12px', color: 'var(--warn)', marginBottom: '12px', lineHeight: '1.6' },
        text: result.warnings.slice(0, 3).join('；')
      }));
    }

    if (sum.byCategory && sum.byCategory.length) {
      box.appendChild(U.el('div', { class: 'section-label', text: '分类预览' }));
      const card = U.el('div', { class: 'card tight' });
      sum.byCategory.slice(0, 8).forEach(c => {
        card.appendChild(App.barRow(c.category, c.amount, sum.byCategory[0].amount, null,
          `${U.money(c.amount)} (${c.count}笔)`));
      });
      box.appendChild(card);
    }

    box.appendChild(U.el('div', { class: 'row', style: { marginTop: '14px' } }, [
      U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
      U.el('button', {
        class: 'btn primary grow', text: `导入 ${dedup.fresh.length} 笔`,
        onclick: () => {
          if (!dedup.fresh.length) return U.toast('没有新增记录');
          S.bulkAdd('txns', dedup.fresh);
          /* 留痕：记下这次是什么时候、走哪条路、覆盖了哪段日期。
             下次再截账单图之前，回来瞄一眼就知道该从哪儿接着截。 */
          try {
            S.recordImport({
              txns: dedup.fresh, via: result.via,
              images: result.images || 0
            });
          } catch (e) { console.warn('记录导入留痕失败', e); }
          S.saveNow();
          App.closeSheet();
          App.refresh();
          U.toast(`已导入 ${dedup.fresh.length} 笔`, 'ok');
        }
      })
    ]));

    App.sheet('导入确认', box, { autofocus: false });
  }

  /* ═══════════ AI 分析消费 ═══════════ */
  function openMoneyAI() {
    if (!AI.isReady()) return U.toast('请先在设置里配置 AI', 'err');
    const txns = S.txnsInMonth(st.month);
    const s = S.monthSummary(st.month);
    const money = S.settings.money;

    const byCat = {};
    txns.filter(t => t.type === 'expense').forEach(t => {
      byCat[t.category || '其他'] = (byCat[t.category || '其他'] || 0) + t.amount;
    });

    const L = [];
    L.push(`# 请求：分析我 ${st.month} 的消费`);
    L.push('');
    L.push('## 本月概况');
    L.push(`- 实际总收入：${U.money(s.income)} 元（统计窗口 ${s.incomeWindow.start} ~ ${s.incomeWindow.end}）`);
    L.push(`  · 其中固定生活费：${U.money(s.stipend)} 元（${s.stipendCount} 笔，每笔约 ${U.money(S.settings.money.stipendAmount)}）`);
    L.push(`  · 额外收入：${U.money(s.extra)} 元（${s.extraCount} 笔）`);
    if (s.referenceIncome != null) {
      const d = U.round(s.stipend - s.referenceIncome, 2);
      L.push(`- 生活费参考值：${U.money(s.referenceIncome)} 元`
        + (Math.abs(d) < 0.01 ? '（已收齐）' : d < 0 ? `（还差 ${U.money(-d)}）` : `（多出 ${U.money(d)}）`));
    }
    L.push(`- 总支出：${U.money(s.expense)} 元（${txns.filter(t => t.type === 'expense').length} 笔，按自然月）`);
    L.push(`- 结余：${U.money(s.balance)} 元`);
    if (money.savingGoal) L.push(`- 储蓄目标：${U.money(money.savingGoal)} 元`);
    L.push('');
    L.push('## 分类支出');
    Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).forEach(k => {
      L.push(`- ${k}：${U.money(byCat[k])} 元（${Math.round(byCat[k] / s.expense * 100)}%）`);
    });
    L.push('');
    L.push('## 金额最大的 10 笔');
    txns.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 10).forEach(t => {
      L.push(`- ${t.date} ${t.counterparty || ''} ${t.product || ''}：${U.money(t.amount)} 元（${t.category || '未分类'}）`);
    });
    L.push('');
    L.push('## 请你做的事');
    L.push('1. 指出消费结构里最不该花的 2~3 类，给具体金额依据');
    L.push('2. 按我当前收入，判断这个月能否达成储蓄目标，差多少');
    L.push('3. 给 3 条这个月就能执行的省钱建议（要具体，不要说"少喝奶茶"这种空话）');
    L.push('4. 我是学生，正在减脂，注意饮食类支出要兼顾营养');

    const out = U.el('div', { class: 'ai-out', style: { marginTop: '12px' }, text: '分析中…' });
    const box = U.el('div', {}, [out]);
    App.sheet('AI 分析消费', box, { autofocus: false });

    const prompt = L.join('\n');
    let acc = '';
    AI.chat([
      { role: 'system', content: '你是一个务实的学习生活管理助手，服务对象是中国大学生。说人话，给具体可执行建议。' },
      { role: 'user', content: prompt }
    ], {
      onDelta: (d, full) => { acc = full; out.innerHTML = App.md(full); out.scrollTop = out.scrollHeight; }
    }).then(() => AI.log('money', prompt, acc))
      .catch(e => { out.textContent = '出错：' + e.message; });
  }

  Views.moneyState = st;
  /* 暴露给截图/测试用：直接打开某笔的编辑面板、批量面板、规则面板 */
  Views.moneyEdit = openTxnEditor;
  Views.moneyBatch = openBatchEditor;
  Views.moneyRule = openRuleEditor;
  Views.moneyImport = openWeChatImport;
  global.Views = Views;
})(window);