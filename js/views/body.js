/* ═══════════════════════════════════════════════
   views/body.js — 饮食作息
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const Views = global.Views || (global.Views = {});

  const st = { date: null, tab: 'diet' };

  Views.body = function () {
    const root = U.$('#view-body');
    if (!st.date) st.date = U.ymd(U.today());

    /* ───── 日期切换 ───── */
    root.appendChild(U.el('div', {
      class: 'card tight',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }
    }, [
      U.el('button', { class: 'icon-btn sm', onclick: () => { shiftDay(-1); } },
        [U.svg('M15 6l-6 6 6 6', { sw: '2.2' })]),
      U.el('button', {
        style: { textAlign: 'center', flex: '1' },
        onclick: () => { st.date = U.ymd(U.today()); App.refresh(); }
      }, [
        U.el('div', { style: { fontSize: '15.5px', fontWeight: '700' }, text: U.friendly(st.date) }),
        U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)' }, text: st.date + ' ' + U.dowName(st.date) })
      ]),
      U.el('button', {
        class: 'icon-btn sm',
        onclick: () => { shiftDay(1); }
      }, [U.svg('M9 6l6 6-6 6', { sw: '2.2' })])
    ]));

    /* ───── Tab ───── */
    root.appendChild(App.seg([
      { value: 'diet', label: '饮食' },
      { value: 'sleep', label: '作息' },
      { value: 'trend', label: '趋势' }
    ], st.tab, v => { st.tab = v; App.refresh(); }));

    root.appendChild(U.el('div', { style: { height: '14px' } }));

    if (st.tab === 'diet') renderDiet(root);
    else if (st.tab === 'sleep') renderSleep(root);
    else renderTrend(root);
  };

  function shiftDay(d) {
    st.date = U.ymd(U.addDays(U.parse(st.date), d));
    App.refresh();
  }

  /* ═══════════ 饮食 ═══════════ */
  function renderDiet(root) {
    const meals = S.mealsOn(st.date);
    const totals = Nutrition.dayTotals(meals);
    const body = S.settings.body;
    const mr = Nutrition.macroRatio(totals);

    /* 汇总卡 */
    const targetKcal = body.dailyKcal || 0;
    const pct = targetKcal ? U.clamp(totals.kcal / targetKcal * 100, 0, 100) : 0;

    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('div', { class: 'ring-wrap' }, [
        App.ring(pct, 88, totals.kcal > targetKcal * 1.1 && targetKcal ? 'var(--danger)' : 'var(--ok)',
          totals.kcal || '—',
          targetKcal ? `/${targetKcal} kcal` : 'kcal'),
        U.el('div', { class: 'grow' }, [
          App.barRow('蛋白', totals.p, body.proteinTarget || Math.max(totals.p, 1), 'var(--c-cv)', Math.round(totals.p) + 'g'),
          App.barRow('脂肪', totals.f, Math.max(totals.f, 1), 'var(--warn)', Math.round(totals.f) + 'g'),
          App.barRow('碳水', totals.c, Math.max(totals.c, 1), 'var(--c-study)', Math.round(totals.c) + 'g')
        ])
      ]),
      totals.kcal ? U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '10px', textAlign: 'center' },
        text: `供能比  蛋白 ${mr.p}% · 脂肪 ${mr.f}% · 碳水 ${mr.c}%　|　纤维 ${totals.fib}g`
      }) : null
    ]));

    /* 健康评估 */
    if (totals.kcal) {
      const sleepRec = S.sleepOn(st.date);
      const assess = Nutrition.assess(totals, sleepRec, body, body.sleepTarget);
      const levelColor = { good: 'var(--ok)', ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', unknown: 'var(--text-dim)' }[assess.level];
      const levelText = { good: '很健康', ok: '基本健康', warn: '有几点要注意', bad: '问题较多', unknown: '未设目标' }[assess.level];

      const card = U.el('div', { class: 'card tight' });
      card.appendChild(U.el('div', { class: 'card-head', style: { marginBottom: '9px' } }, [
        U.el('h3', { text: '健康评估' }),
        U.el('span', { class: 'badge', style: { background: levelColor + '22', color: levelColor }, text: levelText })
      ]));

      const ul = U.el('div', { style: { fontSize: '13px', lineHeight: '1.75' } });
      assess.good.forEach(g => ul.appendChild(U.el('div', { style: { color: 'var(--ok)' }, text: '✓ ' + g })));
      assess.issues.forEach(i => ul.appendChild(U.el('div', { style: { color: 'var(--warn)', marginTop: '4px' }, text: '⚠ ' + i })));
      assess.facts.forEach(f => ul.appendChild(U.el('div', {
        style: { color: 'var(--text-dim)', fontSize: '12px', marginTop: '3px' }, text: '· ' + f
      })));
      card.appendChild(ul);
      root.appendChild(card);

      /* 给 AI 评价 */
      root.appendChild(U.el('button', {
        class: 'btn primary block', style: { marginBottom: '14px' },
        text: '🤖 发给 AI 评价这一天',
        onclick: () => App.aiRun('body')
      }));
    }

    /* 三餐 */
    const types = [
      { id: 'breakfast', name: '早餐', icon: '🌅' },
      { id: 'lunch', name: '午餐', icon: '☀️' },
      { id: 'dinner', name: '晚餐', icon: '🌙' },
      { id: 'snack', name: '加餐', icon: '🍎' }
    ];

    types.forEach(ty => {
      const list = meals.filter(m => m.type === ty.id);
      const status = S.mealStatus(st.date, ty.id);          // eaten | skipped | none
      const eaten = list.filter(m => !m.skipped);
      const card = U.el('div', { class: 'card tight' });

      const sub = eaten.reduce((s, m) => s + Nutrition.dayTotals([m]).kcal, 0);
      card.appendChild(U.el('div', {
        class: 'card-head',
        style: { marginBottom: (eaten.length || status === 'skipped') ? '10px' : '0' }
      }, [
        U.el('h3', { text: ty.icon + ' ' + ty.name }),
        U.el('span', {
          class: 'hint',
          style: status === 'skipped' ? { color: 'var(--warn, #f59e0b)' } : {},
          text: status === 'skipped' ? '没吃'
              : eaten.length ? `${Math.round(sub)} kcal`
              : '未记录'
        })
      ]));

      /* 明确「没吃」的餐：显示成一条可撤销的记录，而不是空白 */
      if (status === 'skipped') {
        const row = U.el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '9px 0', borderBottom: '1px solid var(--border)'
          }
        }, [
          U.el('span', { style: { fontSize: '15px' }, text: '🚫' }),
          U.el('div', { class: 'grow' }, [
            U.el('div', { style: { fontSize: '13.5px', fontWeight: '500' }, text: '这餐没吃' }),
            U.el('div', {
              style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' },
              text: 'AI 评价时会按「真没吃」处理'
            })
          ]),
          U.el('button', {
            class: 'btn ghost sm', text: '撤销',
            onclick: e => {
              e.stopPropagation();
              S.setMealSkipped(st.date, ty.id, false);
              App.refresh();
            }
          })
        ]);
        card.appendChild(row);
      }

      eaten.forEach(m => {
        const row = U.el('div', {
          style: { padding: '9px 0', borderBottom: '1px solid var(--border)' }
        });
        const mt = Nutrition.dayTotals([m]);
        row.appendChild(U.el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' } }, [
          U.el('div', { class: 'grow', style: { fontSize: '13.5px', wordBreak: 'break-word' },
            text: (m.items || []).map(i => i.name).join('、') || '（空）' }),
          U.el('span', { style: { fontSize: '12px', color: 'var(--text-dim)', flexShrink: '0' }, text: Math.round(mt.kcal) + ' kcal' })
        ]));
        if (m.time) {
          row.appendChild(U.el('div', { style: { fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }, text: m.time }));
        }
        row.addEventListener('click', () => openMealEditor(m, ty.id));
        card.appendChild(row);
      });

      /* 两个按钮并排：加记录 / 标没吃。
         「没吃」是常用操作，藏进编辑页里太深了。 */
      card.appendChild(U.el('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } }, [
        U.el('button', {
          class: 'btn ghost sm grow',
          text: '＋ 添加' + ty.name,
          onclick: () => openMealEditor(null, ty.id)
        }),
        status === 'skipped'
          ? null
          : U.el('button', {
              class: 'btn ghost sm',
              style: { flexShrink: '0', color: 'var(--text-dim)' },
              text: '没吃',
              title: '标记这餐没吃（区别于「忘了记」）',
              onclick: () => {
                S.setMealSkipped(st.date, ty.id, true);
                App.refresh();
                U.toast(ty.name + '已标记为「没吃」', 'ok');
              }
            })
      ]));
      root.appendChild(card);
    });
  }

  /* ═══════════ 餐次编辑 ═══════════ */
  function openMealEditor(meal, type) {
    const isNew = !meal;
    const m = meal ? JSON.parse(JSON.stringify(meal)) : { date: st.date, type, items: [], time: '' };
    if (!m.items) m.items = [];
    const typeNames = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

    const listBox = U.el('div', {});
    const searchIn = App.input('text', '', () => {}, '搜食物，如「鸡胸肉」「米饭」');
    const resultBox = U.el('div', {
      style: { maxHeight: '180px', overflowY: 'auto', marginTop: '6px' }
    });

    function calcTotals() { return Nutrition.dayTotals([m]); }

    function renderList() {
      listBox.innerHTML = '';
      if (!m.items.length) {
        listBox.appendChild(U.el('div', {
          style: { fontSize: '12.5px', color: 'var(--text-faint)', padding: '10px 0' }, text: '还没添加食物'
        }));
        return;
      }
      const tot = calcTotals();
      listBox.appendChild(U.el('div', { class: 'stat-grid', style: { marginBottom: '8px' } }, [
        App.stat('热量', Math.round(tot.kcal), 'kcal'),
        App.stat('蛋白', U.round(tot.p, 1), 'g')
      ]));
      m.items.forEach((it, i) => {
        const r = Nutrition.calc(it);
        listBox.appendChild(U.el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid var(--border)' }
        }, [
          U.el('div', { class: 'grow' }, [
            U.el('div', { style: { fontSize: '13.5px', fontWeight: '600' }, text: it.name }),
            U.el('div', { style: { fontSize: '11px', color: 'var(--text-dim)' },
              text: `${Math.round(r.grams)}g · ${Math.round(r.kcal)}kcal · 蛋白${U.round(r.p, 1)}g${r.unknown ? ' · 估算' : ''}` })
          ]),
          U.el('button', {
            class: 'icon-btn sm', onclick: () => { m.items.splice(i, 1); renderList(); }
          }, [U.svg(['M6 6l12 12', 'M18 6L6 18'], { sw: '2' })])
        ]));
      });
    }

    function addItem(food, grams) {
      /* AI 查到的食物带上每 100g 营养值一起存，
         这样以后即使断网、换设备，这笔的热量也不会走「通用估算」。
         同时记进本地库，下次能直接搜到。 */
      const it = { name: food.n, grams: grams || food.photoGrams || food.gram, unit: food.unit };
      if (food.ai && (food.k || food.p || food.c)) {
        it.nut = { k: food.k, p: food.p, f: food.f, c: food.c, fib: food.fib };
        it.ai = true;
        if (food.note) it.note = food.note;
        try { Nutrition.learn(food); } catch (e) { console.warn('记住食物失败', e); }
      }
      m.items.push(it);
      renderList();
      searchIn.value = '';
      resultBox.innerHTML = '';
    }

    /** 用 AI 查一个内置库没有的食物 */
    function aiLookup(q) {
      resultBox.innerHTML = '';
      const loading = U.el('div', {
        style: { fontSize: '12.5px', color: 'var(--text-dim)', padding: '8px 2px' },
        text: `🤖 正在查「${q}」…`
      });
      resultBox.appendChild(loading);

      AI.lookupFood(q).then(foods => {
        resultBox.innerHTML = '';
        foods.forEach((f, i) => {
          resultBox.appendChild(U.el('button', {
            class: 'btn ghost sm block',
            style: { marginBottom: '5px', justifyContent: 'space-between', textAlign: 'left' },
            onclick: () => addItem(f)
          }, [
            U.el('span', {}, [
              U.el('span', { text: f.n }),
              U.el('span', { style: { fontSize: '10px', color: 'var(--accent)', marginLeft: '5px' }, text: i === 0 ? 'AI' : '' })
            ]),
            U.el('span', { style: { fontSize: '11.5px', color: 'var(--text-dim)' },
              text: `${Math.round(f.k)}kcal/100g · 1${f.unit}≈${f.gram}g` })
          ]));
          if (f.note) {
            resultBox.appendChild(U.el('div', {
              style: { fontSize: '11px', color: 'var(--text-faint)', margin: '-3px 0 7px 2px' }, text: f.note
            }));
          }
        });
        resultBox.appendChild(U.el('div', {
          style: { fontSize: '10.5px', color: 'var(--text-faint)', marginTop: '4px' },
          text: 'AI 估算，仅供参考；已自动记进你的食物库，下次不用再查'
        }));
      }).catch(e => {
        resultBox.innerHTML = '';
        resultBox.appendChild(U.el('div', {
          style: { fontSize: '12px', color: 'var(--danger)', padding: '6px 2px' }, text: 'AI 查询失败：' + e.message
        }));
        /* AI 挂了也别把人卡住，给个手动估算的退路 */
        resultBox.appendChild(U.el('button', {
          class: 'btn ghost sm block',
          text: `仍按通用估算添加「${q}」`,
          onclick: () => addItem({ n: q, gram: 100, unit: '份' }, 100)
        }));
      });
    }

    /** 照片识别：拍一张 → AI 认出有哪些食物、各多少克 */
    function photoRecognize() {
      const inp = U.el('input', { type: 'file', accept: 'image/*', capture: 'environment' });
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        resultBox.innerHTML = '';
        resultBox.appendChild(U.el('div', {
          style: { fontSize: '12.5px', color: 'var(--text-dim)', padding: '8px 2px' },
          text: '🤖 正在识别照片里的食物…（约 10~30 秒）'
        }));
        try {
          const dataUrl = await U.readFileAsDataURL(f);
          const r = await AI.readFoodPhoto(dataUrl);
          resultBox.innerHTML = '';
          (r.items || []).forEach(fd => {
            resultBox.appendChild(U.el('button', {
              class: 'btn ghost sm block',
              style: { marginBottom: '5px', justifyContent: 'space-between', textAlign: 'left' },
              onclick: () => addItem(fd)
            }, [
              U.el('span', {}, [
                U.el('span', { text: fd.n }),
                fd.confidence === 'low'
                  ? U.el('span', { style: { fontSize: '10px', color: 'var(--warn,#f59e0b)', marginLeft: '5px' }, text: '不确定' })
                  : null
              ]),
              U.el('span', { style: { fontSize: '11.5px', color: 'var(--text-dim)' },
                text: `约 ${fd.photoGrams}g · ${Math.round(fd.k * fd.photoGrams / 100)}kcal` })
            ]));
          });
          if (r.note) {
            resultBox.appendChild(U.el('div', {
              class: 'ai-out', style: { fontSize: '11.5px', marginTop: '6px' }, text: r.note
            }));
          }
          if ((r.items || []).length > 1) {
            resultBox.appendChild(U.el('button', {
              class: 'btn primary sm block', style: { marginTop: '8px' },
              text: `全部添加（${r.items.length} 项）`,
              onclick: () => { r.items.forEach(fd => addItem(fd, fd.photoGrams)); }
            }));
          }
          resultBox.appendChild(U.el('div', {
            style: { fontSize: '10.5px', color: 'var(--text-faint)', marginTop: '4px' },
            text: '点单项可单独调整；重量识别是估算，可以改'
          }));
        } catch (e) {
          resultBox.innerHTML = '';
          resultBox.appendChild(U.el('div', {
            style: { fontSize: '12px', color: 'var(--danger)', padding: '6px 2px' }, text: '识别失败：' + e.message
          }));
        }
      });
      inp.click();
    }

    searchIn.addEventListener('input', () => {
      const q = searchIn.value.trim();
      resultBox.innerHTML = '';
      if (!q) return;
      const found = Nutrition.search(q, 8);

      found.forEach(f => {
        resultBox.appendChild(U.el('button', {
          class: 'btn ghost sm block',
          style: { marginBottom: '5px', justifyContent: 'space-between', textAlign: 'left' },
          onclick: () => addItem(f)
        }, [
          U.el('span', {}, [
            U.el('span', { text: f.n }),
            f.ai ? U.el('span', { style: { fontSize: '10px', color: 'var(--accent)', marginLeft: '5px' }, text: '我的' }) : null
          ]),
          U.el('span', { style: { fontSize: '11.5px', color: 'var(--text-dim)' },
            text: `${Math.round(f.k)}kcal/100g · 1${f.unit}≈${f.gram}g` })
        ]));
      });

      /* 永远给一个「用 AI 查」的入口，不管本地库有没有命中。
         因为「宫保鸡丁」可能命中「鸡丁」，但那个营养值差很远，
         用户需要能强制走 AI 拿准确值。 */
      resultBox.appendChild(U.el('button', {
        class: 'btn ghost sm block',
        style: { marginTop: found.length ? '4px' : '0', color: 'var(--accent)' },
        text: `🤖 用 AI 查「${q}」的营养`,
        onclick: () => aiLookup(q)
      }));

      if (!found.length) {
        resultBox.appendChild(U.el('button', {
          class: 'btn ghost sm block',
          style: { marginTop: '4px' },
          text: '按通用估算添加（不花 token）',
          onclick: () => addItem({ n: q, gram: 100, unit: '份' }, 100)
        }));
      }
    });

    renderList();

    const box = U.el('div', {}, [
      U.el('div', { class: 'row', style: { gap: '8px', marginBottom: '10px' } }, [
        App.field('吃什么（搜索添加）', searchIn),
        U.el('button', {
          class: 'btn ghost', style: { flexShrink: '0', alignSelf: 'flex-end', height: '38px' },
          text: '📷 拍照', onclick: photoRecognize
        })
      ]),
      resultBox,
      U.el('div', { style: { marginTop: '12px' } }, [listBox]),
      App.field('时间（可选）', App.input('time', m.time || '', v => { m.time = v; })),
      U.el('div', { class: 'row', style: { marginTop: '16px' } }, [
        isNew ? null : U.el('button', {
          class: 'btn danger', text: '删除',
          onclick: () => App.confirm('删除这条记录？', () => {
            S.remove('meals', m.id); App.closeSheet(); App.refresh();
          }, '删除')
        }),
        U.el('button', {
          class: 'btn primary grow', text: isNew ? '保存' : '更新',
          onclick: () => {
            if (!m.items.length) return U.toast('至少添加一样食物', 'err');
            if (isNew) S.add('meals', m);
            else S.update('meals', m.id, m);
            App.closeSheet();
            App.refresh();
            U.toast('已保存', 'ok');
          }
        })
      ].filter(Boolean))
    ]);

    App.sheet(typeNames[type] || '记录饮食', box, { autofocus: false });
  }

  /* ═══════════ 作息 ═══════════ */
  function renderSleep(root) {
    const rec = S.sleepOn(st.date) || { date: st.date, bedtime: '', wake: '', nap: '', quality: '' };
    const body = S.settings.body;

    const hoursEl = U.el('div', { style: { fontSize: '30px', fontWeight: '700', letterSpacing: '-.02em' } });
    function refreshHours() {
      const h = calcHours();
      hoursEl.textContent = h != null ? h + ' 小时' : '—';
      hoursEl.style.color = h == null ? 'var(--text-faint)'
        : h < 6 ? 'var(--danger)' : h < (body.sleepTarget || 7.5) - 0.5 ? 'var(--warn)' : 'var(--ok)';
    }
    function calcHours() {
      const b = parseHM(bedtimeIn.value), w = parseHM(wakeIn.value);
      if (b == null || w == null) return null;
      let h = w - b;
      if (h <= 0) h += 24;                 // 跨零点
      return U.round(h, 1);
    }

    const bedtimeIn = App.input('time', rec.bedtime || '', () => refreshHours());
    const wakeIn = App.input('time', rec.wake || '', () => refreshHours());
    const napIn = App.input('number', rec.nap || '', () => {}, '30');
    const qualityChips = App.chips([
      { value: '', label: '未评' },
      { value: '很好', label: '很好' },
      { value: '还行', label: '还行' },
      { value: '较差', label: '较差' },
      { value: '失眠', label: '失眠' }
    ], rec.quality || '', v => { m.quality = v; });

    const m = { quality: rec.quality || '' };
    refreshHours();

    root.appendChild(U.el('div', { class: 'card', style: { textAlign: 'center' } }, [
      U.el('div', { style: { fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }, text: '昨晚睡眠时长' }),
      hoursEl,
      U.el('div', {
        style: { fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' },
        text: body.sleepTarget ? `目标 ${body.sleepTarget} 小时` : '未设目标'
      })
    ]));

    root.appendChild(U.el('div', { class: 'card' }, [
      App.field('入睡时间', bedtimeIn),
      App.field('起床时间', wakeIn),
      App.field('午睡（分钟）', napIn),
      App.field('睡眠质量', qualityChips),
      U.el('button', {
        class: 'btn primary block', style: { marginTop: '6px' },
        text: '保存作息',
        onclick: () => {
          const payload = {
            date: st.date,
            bedtime: bedtimeIn.value,
            wake: wakeIn.value,
            hours: calcHours(),
            nap: napIn.value ? Number(napIn.value) : null,
            quality: m.quality
          };
          if (!payload.bedtime && !payload.wake) return U.toast('至少填一个时间', 'err');
          const exist = S.sleepOn(st.date);
          if (exist) S.update('sleep', exist.id, payload);
          else S.add('sleep', payload);
          U.toast('已保存', 'ok');
          App.refresh();
        }
      })
    ]));

    /* 体重记录 */
    const w = S.weightLatest();
    root.appendChild(U.el('div', { class: 'section-label', text: '体重' }));
    root.appendChild(U.el('div', { class: 'card tight' }, [
      U.el('div', { class: 'card-head', style: { marginBottom: '8px' } }, [
        U.el('h3', { text: w ? w.kg + ' kg' : '未记录' }),
        U.el('span', {
          class: 'hint',
          text: w ? w.date + (body.targetWeight ? ` · 距目标 ${U.round(w.kg - body.targetWeight, 1)}kg` : '') : ''
        })
      ]),
      U.el('div', { class: 'row' }, [
        App.input('number', '', v => { /* 用下面的按钮提交 */ window.__w = v; }, w ? String(w.kg) : '65', '0.1'),
        U.el('button', {
          class: 'btn primary', style: { flexShrink: '0' }, text: '记录',
          onclick: () => {
            const v = Number(window.__w);
            if (!v || v < 20 || v > 300) return U.toast('请输入合理体重', 'err');
            S.add('weights', { date: U.ymd(U.today()), kg: v });
            U.toast('已记录', 'ok');
            App.refresh();
          }
        })
      ])
    ]));
  }

  function parseHM(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{1,2}):(\d{2})$/);
    return m ? (+m[1] + (+m[2]) / 60) : null;
  }

  /* ═══════════ 趋势 ═══════════ */
  function renderTrend(root) {
    const days = 14;
    const today = U.today();

    /* 热量趋势 */
    const kcalSeries = [];
    const sleepSeries = [];
    for (let i = days - 1; i >= 0; i--) {
      const ds = U.ymd(U.addDays(today, -i));
      const tot = Nutrition.dayTotals(S.mealsOn(ds));
      kcalSeries.push({ x: ds, y: tot.kcal });
      const sl = S.sleepOn(ds);
      sleepSeries.push({ x: ds, y: sl && sl.hours != null ? sl.hours : 0 });
    }

    root.appendChild(U.el('div', { class: 'section-label', text: '最近 14 天热量' }));
    const kcalCard = U.el('div', { class: 'card tight' });
    const kcalCanvas = U.el('canvas');
    kcalCard.appendChild(U.el('div', { class: 'chart-box' }, [kcalCanvas]));
    if (S.settings.body.dailyKcal) {
      kcalCard.appendChild(U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '8px', textAlign: 'center' },
        text: `目标线 ${S.settings.body.dailyKcal} kcal`
      }));
    }
    root.appendChild(kcalCard);

    root.appendChild(U.el('div', { class: 'section-label', text: '最近 14 天睡眠' }));
    const sleepCard = U.el('div', { class: 'card tight' });
    const sleepCanvas = U.el('canvas');
    sleepCard.appendChild(U.el('div', { class: 'chart-box' }, [sleepCanvas]));
    root.appendChild(sleepCard);

    /* 体重趋势 */
    const weights = S.all('weights').slice(-20);
    if (weights.length >= 2) {
      root.appendChild(U.el('div', { class: 'section-label', text: '体重变化' }));
      const wCard = U.el('div', { class: 'card tight' });
      const wCanvas = U.el('canvas');
      wCard.appendChild(U.el('div', { class: 'chart-box' }, [wCanvas]));
      const first = weights[0], last = weights[weights.length - 1];
      const delta = U.round(last.kg - first.kg, 1);
      wCard.appendChild(U.el('div', {
        style: {
          fontSize: '12.5px', marginTop: '8px', textAlign: 'center',
          color: delta <= 0 ? 'var(--ok)' : 'var(--warn)'
        },
        text: `${first.date} ${first.kg}kg → ${last.date} ${last.kg}kg（${delta >= 0 ? '+' : ''}${delta}kg）`
      }));
      root.appendChild(wCard);

      requestAnimationFrame(() => {
        Charts.line(wCanvas, [{
          name: '体重', color: Charts.theme().brand,
          points: weights.map(x => ({ x: x.date, y: x.kg }))
        }], { height: 180, showArea: true, showDots: true, yFormat: v => v.toFixed(1) });
      });
    }

    requestAnimationFrame(() => {
      Charts.bars(kcalCanvas, kcalSeries.map(s => ({
        label: s.x.slice(5).replace('-', '/'),
        value: s.y,
        color: S.settings.body.dailyKcal && s.y > S.settings.body.dailyKcal ? Charts.theme().danger : Charts.theme().brand
      })), { height: 180, valueFormat: v => Math.round(v) });

      Charts.bars(sleepCanvas, sleepSeries.map(s => ({
        label: s.x.slice(5).replace('-', '/'),
        value: s.y,
        color: s.y < 6 ? Charts.theme().danger : s.y < 7 ? Charts.theme().warn : Charts.theme().ok
      })), { height: 180, max: Math.max(10, ...sleepSeries.map(s => s.y)), valueFormat: v => v.toFixed(1) });
    });
  }

  Views.bodyState = st;
  /* 暴露给截图/测试用 */
  Views.mealEditor = openMealEditor;
  global.Views = Views;
})(window);