/* ═══════════════════════════════════════════════
   views/money.js — 钱财管理账本
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const Views = global.Views || (global.Views = {});

  const st = { month: null, tab: 'overview', importPreview: null };

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
        class: 'btn ghost', style: { flexShrink: '0' }, text: '导入微信账单',
        onclick: openWeChatImport
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
        App.stat('收入', U.money(s.income), '元', money.monthlyIncome != null ? '自定义' : '按账单'),
        App.stat('支出', U.money(s.expense), '元'),
        App.stat('笔数', s.count, '笔'),
        App.stat('日均支出', s.count ? U.money(s.expense / new Date(+st.month.slice(0, 4), +st.month.slice(5, 7), 0).getDate()) : '0.00', '元')
      ])
    ]));

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
      root.appendChild(App.empty('本月还没有支出记录', '点下面「导入微信账单」或手动记一笔'));
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
        U.el('div', {
          class: 'grow',
          style: { minWidth: '0' }
        }, [
          U.el('div', { style: { fontSize: '14.5px', fontWeight: '600', wordBreak: 'break-word' },
            text: t.counterparty || t.product || '（无对方）' }),
          U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '3px', display: 'flex', gap: '7px', flexWrap: 'wrap' } }, [
            t.time ? U.el('span', { text: t.time }) : null,
            t.product && t.product !== '/' ? U.el('span', { text: t.product }) : null,
            t.method ? U.el('span', { text: t.method }) : null,
            t.source === 'wechat' ? U.el('span', { class: 'badge', text: '微信' }) : null
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
      row.addEventListener('click', () => openTxnEditor(t));
      root.appendChild(row);
    });
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
        text: '规则按关键词匹配商户名／商品／备注，优先级高于内置分类。修改商户分类后会自动生成规则，下次导入同样的商户就会自动归类。' })
    ]));

    if (rules.length) {
      root.appendChild(U.el('div', { class: 'section-label', text: `我的规则（${rules.length}）` }));
      const card = U.el('div', { class: 'card tight' });
      rules.forEach(r => {
        card.appendChild(U.el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 0', borderBottom: '1px solid var(--border)' }
        }, [
          U.el('div', { class: 'grow' }, [
            U.el('div', { style: { fontSize: '13.5px', fontWeight: '600' }, text: r.keyword }),
            U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: '→ ' + r.category })
          ]),
          U.el('button', {
            class: 'icon-btn sm', onclick: () => {
              S.remove('txnRules', r.id); U.toast('已删除'); App.refresh();
            }
          }, [U.svg(['M6 6l12 12', 'M18 6L6 18'], { sw: '2' })])
        ]));
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
        card.appendChild(U.el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 0', borderBottom: '1px solid var(--border)' }
        }, [
          U.el('div', { class: 'grow' }, [
            U.el('div', { style: { fontSize: '13.5px', fontWeight: '600' }, text: sg.keyword }),
            U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)' }, text: `${sg.count} 笔 · 例如「${sg.sample || ''}」` })
          ]),
          App.selectEl(
            Object.keys(WeChat.CATEGORIES || {}).map(c => ({ value: c, label: c })),
            sg.category,
            v => {
              S.add('txnRules', { keyword: sg.keyword, category: v });
              /* 回填已有记录 */
              let n = 0;
              S.all('txns').forEach(t => {
                if (t.category === '其他' &&
                    ((t.counterparty || '') + (t.product || '') + (t.note || '')).includes(sg.keyword)) {
                  t.category = v; n++;
                }
              });
              S.saveNow();
              U.toast(`已添加规则，回填 ${n} 笔`, 'ok');
              App.refresh();
            }
          )
        ]));
      });
      root.appendChild(card);
    } else if (!rules.length) {
      root.appendChild(App.empty('还没有自定义规则', '导入账单后，未归类的商户会在这里给出建议'));
    }
  }

  /* ═══════════ 记一笔 / 编辑 ═══════════ */
  function openTxnEditor(txn) {
    const isNew = !txn;
    const t = txn ? Object.assign({}, txn) : {
      date: U.ymd(U.today()), time: U.pad(new Date().getHours()) + ':' + U.pad(new Date().getMinutes()),
      type: 'expense', amount: '', counterparty: '', product: '', category: '餐饮', method: '', note: ''
    };

    const cats = Object.keys(WeChat.CATEGORIES || { 其他: 1 });
    const typeSeg = App.seg([
      { value: 'expense', label: '支出' },
      { value: 'income', label: '收入' }
    ], t.type, v => { t.type = v; });

    const amountIn = App.input('number', t.amount, v => { t.amount = v; }, '0.00', '0.01');
    const catChips = App.chips(cats.map(c => ({ value: c, label: c })), t.category,
      v => { t.category = v; rebuild(); });

    const box = U.el('div', {}, []);

    function rebuild() {
      box.innerHTML = '';
      box.appendChild(App.field('类型', App.seg([
        { value: 'expense', label: '支出' }, { value: 'income', label: '收入' }
      ], t.type, v => { t.type = v; rebuild(); })));
      box.appendChild(App.field('金额（元）', amountIn));
      box.appendChild(App.field('分类', App.chips(cats.map(c => ({ value: c, label: c })), t.category,
        v => { t.category = v; rebuild(); })));
      box.appendChild(App.field('商户 / 对方', App.input('text', t.counterparty, v => { t.counterparty = v; }, '如 食堂、美团')));
      box.appendChild(App.field('商品 / 说明', App.input('text', t.product, v => { t.product = v; }, '如 午餐')));
      box.appendChild(App.field('日期', App.input('date', t.date, v => { t.date = v; })));
      box.appendChild(App.field('时间', App.input('time', t.time, v => { t.time = v; })));
      box.appendChild(App.field('支付方式', App.input('text', t.method, v => { t.method = v; }, '零钱 / 银行卡')));
      box.appendChild(App.field('备注', App.input('text', t.note, v => { t.note = v; })));

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

            /* 记住这个商户的分类 → 生成规则 */
            const key = (t.counterparty || t.product || '').trim();
            if (key && key.length >= 2 && t.category) {
              const exists = S.all('txnRules').some(r => r.keyword === key);
              if (!exists) S.add('txnRules', { keyword: key, category: t.category });
            }

            if (isNew) S.add('txns', t);
            else S.update('txns', t.id, t);
            App.closeSheet();
            App.refresh();
            U.toast('已保存', 'ok');
          }
        })
      ]));
    }

    rebuild();
    App.sheet(isNew ? '记一笔' : '编辑记录', box, { autofocus: false });
  }

  /* ═══════════ 微信账单导入 ═══════════ */
  function openWeChatImport() {
    const ta = U.el('textarea', {
      class: 'textarea', style: { minHeight: '120px' },
      placeholder: '把微信账单 CSV 的内容整段粘贴到这里'
    });

    const box = U.el('div', {}, [
      U.el('div', {
        class: 'card tight',
        style: { background: 'var(--ok-soft)', border: 'none', marginBottom: '12px' }
      }, [
        U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.75', color: 'var(--ok)' } }, [
          U.el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: '怎么拿到微信账单（每月一次即可）' }),
          U.el('div', { text: '微信 → 我 → 服务 → 钱包 → 账单 → 右上角「常见问题」' }),
          U.el('div', { text: '→ 下载账单 → 用于个人对账 → 选月份 → 填邮箱' }),
          U.el('div', { text: '→ 收到邮件后解压得到 CSV，用电脑或手机打开，全选复制粘贴到这里' })
        ])
      ]),
      ta,
      U.el('div', { class: 'row', style: { marginTop: '10px' } }, [
        U.el('button', {
          class: 'btn ghost grow', text: '选择 CSV 文件',
          onclick: () => {
            const inp = U.el('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
            inp.addEventListener('change', async () => {
              const f = inp.files && inp.files[0];
              if (!f) return;
              try {
                ta.value = await U.readFile(f);
                U.toast('已读取文件，点「解析」', 'ok');
              } catch (e) { U.toast('读文件失败：' + e.message, 'err'); }
            });
            inp.click();
          }
        }),
        U.el('button', {
          class: 'btn primary grow', text: '解析',
          onclick: () => {
            const txt = ta.value.trim();
            if (!txt) return U.toast('先粘贴或选择文件', 'err');
            try {
              const r = WeChat.parseCSV(txt);
              if (!r.txns.length) return U.toast('没解析出记录，检查格式', 'err');
              App.closeSheet();
              setTimeout(() => App.go('money') || showImportPreview(r), 280);
            } catch (e) {
              U.toast('解析失败：' + e.message, 'err');
            }
          }
        })
      ])
    ]);

    App.sheet('导入微信账单', box, { autofocus: false });
  }

  function showImportPreview(result) {
    /* 去重 */
    let dedup = { fresh: result.txns, dupes: [] };
    try { dedup = WeChat.dedupe(S.all('txns'), result.txns); }
    catch (e) { console.warn('dedupe 失败', e); }

    /* 套用已有规则 + 内置分类 */
    dedup.fresh.forEach(t => {
      t.source = 'wechat';
      let cat = null;
      try { cat = WeChat.applyRules(t, S.all('txnRules')); } catch (e) {}
      if (cat) t.category = cat;
    });

    const sum = WeChat.summary(dedup.fresh);
    const box = U.el('div', {}, [
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
    L.push(`- 月收入基准：${U.money(s.income)} 元${money.monthlyIncome != null ? '（自定义）' : ''}`);
    L.push(`- 总支出：${U.money(s.expense)} 元（${txns.filter(t => t.type === 'expense').length} 笔）`);
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
  global.Views = Views;
})(window);