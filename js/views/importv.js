/* ═══════════════════════════════════════════════
   views/importv.js — 一键导入 + 智能排期
   ───────────────────────────────────────────────
   流程：粘贴群消息 → 解析任务 → 给每条推荐时间 → 确认归档

   排期逻辑见 js/schedule.js 与 DEVLOG.md 第二节。
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const Views = global.Views || (global.Views = {});

  const st = {
    preview: null,     // [{task, slot}] 排期结果
    raw: null,         // 原始任务数组
    stats: null
  };

  Views.importv = function () {
    const root = U.$('#view-import');

    /* ───── 说明 ───── */
    root.appendChild(U.el('div', {
      class: 'card tight',
      style: { background: 'var(--brand-soft)', border: 'none' }
    }, [
      U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.75', color: 'var(--brand)' } }, [
        U.el('div', { style: { fontWeight: '700', marginBottom: '4px' }, text: '把群消息、通知、聊天记录整段粘进来' }),
        U.el('div', { text: '自动识别要做什么、什么时候截止，并给你推荐一个合适的完成时间。' }),
        U.el('div', { text: '结果先给你确认，不会直接写进去。' })
      ])
    ]));

    /* ───── 输入区 ───── */
    const ta = U.el('textarea', {
      class: 'textarea',
      style: { minHeight: '150px' },
      placeholder: '示例：\n【教务处】本轮选课将于 3月5日 18:00 截止，请务必在此之前完成。\n下周三下午2点 高等数学期末补考 在 A301 教室\n3月20日前提交计算机视觉课程大作业，用YOLO做目标检测\n周六 上午10点 取快递\n复习一下线性代数的特征值'
    });
    ta.id = 'importText';
    root.appendChild(U.el('div', { class: 'field', style: { marginTop: '14px' } }, [ta]));

    /* ───── 排期选项 ───── */
    const optAvoid = U.el('div', { class: 'opt-row' }, [
      U.el('input', { type: 'checkbox', id: 'optAvoidClass', checked: true }),
      U.el('label', { for: 'optAvoidClass', text: '排期时避开我的上课时间' })
    ]);
    root.appendChild(optAvoid);

    /* 课表状态提示 */
    if (!Sch.hasTimetable()) {
      root.appendChild(U.el('div', {
        class: 'card tight',
        style: { background: 'var(--warn-soft, rgba(224,140,0,.12))', border: 'none', marginTop: '10px' }
      }, [
        U.el('div', { style: { fontSize: '12.5px', lineHeight: '1.7', color: 'var(--warn)' } }, [
          U.el('div', { text: '还没导入课表，排期时不会避开上课时间。' }),
          U.el('button', {
            class: 'btn ghost sm', style: { marginTop: '8px' },
            text: '导入课表（拍照识别）',
            onclick: openTimetableImport
          })
        ])
      ]));
    } else {
      const tt = S.settings.timetable;
      root.appendChild(U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '8px' },
        text: `✓ 已导入 ${tt.courses.length} 门课，排期会自动避开上课时间`
      }));
    }

    /* ───── 操作按钮 ───── */
    root.appendChild(U.el('div', { class: 'row', style: { marginTop: '14px' } }, [
      U.el('button', {
        class: 'btn primary grow', text: '解析并推荐时间',
        onclick: () => doParse(ta.value)
      }),
      U.el('button', {
        class: 'btn ghost', style: { flexShrink: '0' },
        text: '从 DSH 导入',
        onclick: openDshImport
      })
    ]));

    /* ───── 粘贴板快捷 ───── */
    root.appendChild(U.el('button', {
      class: 'btn ghost block', style: { marginTop: '9px' },
      text: '从剪贴板粘贴',
      onclick: async () => {
        try {
          const txt = await navigator.clipboard.readText();
          if (!txt) return U.toast('剪贴板是空的');
          ta.value = txt;
          U.toast('已粘贴，点「解析并推荐时间」', 'ok');
        } catch (e) {
          U.toast('浏览器不允许读取剪贴板，请手动长按粘贴', 'err');
        }
      }
    }));

    /* ───── 预览区 ───── */
    if (st.preview && st.preview.length) renderPreview(root);
  };

  /* ═══════════ 解析 + 排期 ═══════════ */
  function doParse(text) {
    if (!text || !text.trim()) return U.toast('先粘贴一些内容', 'err');

    let result;
    try {
      result = Parser.parse(text);
    } catch (e) {
      console.error(e);
      return U.toast('解析出错：' + e.message, 'err');
    }

    if (!result.tasks.length) {
      U.toast('没解析出任何条目，试试换个格式', 'err');
      return;
    }

    st.raw = result.tasks;
    st.stats = result.stats;

    /* 给每条推荐时间 */
    const avoid = U.$('#optAvoidClass');
    const ignoreCourses = avoid ? !avoid.checked : true;
    try {
      st.preview = Sch.plan(result.tasks, { ignoreCourses });
    } catch (e) {
      console.error('排期失败', e);
      st.preview = result.tasks.map(t => ({ task: t, slot: null }));
      U.toast('排期出错，只做解析', 'err');
    }

    App.refresh();
    const n = st.preview.filter(p => p.slot).length;
    U.toast(`解析出 ${result.tasks.length} 条，${n} 条已推荐时间`, 'ok');
  }

  /* ═══════════ 预览 ═══════════ */
  function renderPreview(root) {
    const items = st.preview;
    const kept = items.filter(p => p.task._keep !== false);

    root.appendChild(U.el('div', { class: 'section-label', text: '解析结果（可改分类、改时间、取消勾选）' }));

    /* 统计 */
    const byCat = { study: 0, cv: 0, life: 0 };
    kept.forEach(p => byCat[p.task.cat] = (byCat[p.task.cat] || 0) + 1);
    const nDdl = kept.filter(p => S.kindOf(p.task) === 'deadline').length;
    const nDaily = kept.filter(p => S.kindOf(p.task) === 'daily').length;
    const nLong = kept.filter(p => S.kindOf(p.task) === 'longterm').length;
    const scheduled = kept.filter(p => p.slot && S.kindOf(p.task) === 'deadline').length;

    root.appendChild(U.el('div', { class: 'card tight', style: { marginBottom: '12px' } }, [
      U.el('div', { class: 'stat-inline', style: { marginBottom: '10px' } }, [
        U.el('span', {}, [U.el('b', { text: String(kept.length) }), ' 条待归档']),
        U.el('span', {}, [U.el('b', { text: String(nDdl) }), ' 条有截止']),
        U.el('span', {}, [U.el('b', { text: String(nLong) }), ' 条长期']),
        nDaily ? U.el('span', {}, [U.el('b', { text: String(nDaily) }), ' 条日常']) : null
      ]),
      U.el('div', { class: 'legend' }, Object.keys(S.CATS).map(c =>
        U.el('div', { class: 'legend-item' }, [
          U.el('span', { class: 'legend-dot', style: { background: S.CATS[c].hex } }),
          `${S.CATS[c].short} ${byCat[c] || 0}`
        ])
      )),
      /* 提醒策略说明：让用户明白归档后会发生什么 */
      U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '8px', lineHeight: '1.6' },
        text: nDaily
          ? '提醒：有截止的在截止前一天晚 6 点提醒；日常活动每天晚 6 点提醒；长期任务不提醒。'
          : '提醒：有截止的在截止前一天晚 6 点提醒；没有截止的会进「长期」栏，不提醒。'
      })
    ]));

    if (Sch.hasTimetable()) {
      root.appendChild(U.el('div', {
        style: { fontSize: '11.5px', color: 'var(--ok)', marginBottom: '10px' },
        text: '✓ 排期已避开你的上课时间'
      }));
    }

    /* 条目 */
    const scroll = U.el('div', { style: { maxHeight: '52vh', overflowY: 'auto', marginBottom: '12px' } });

    items.forEach(p => {
      const t = p.task, slot = p.slot;
      const keep = t._keep !== false;

      const toggle = U.el('button', {
        class: 'check' + (keep ? ' on' : ''), style: { flexShrink: '0' }
      }, [U.svg('M20 6L9 17l-5-5', { sw: '3' })]);
      toggle.addEventListener('click', () => { t._keep = !keep; App.refresh(); });

      /* 时间行：区分截止 / 排期 / 长期 / 日常 */
      const meta = [];
      const kk = S.kindOf(t);
      if (t.due) {
        const dd = t.due.slice(0, 10);
        meta.push(U.el('span', { class: 'badge warn', text: '截止 ' + U.friendly(dd) + (t.due.includes('T') ? ' ' + t.due.slice(11, 16) : '') }));
      }
      if (kk === 'daily') {
        meta.push(U.el('span', {
          class: 'badge', style: { color: 'var(--c-cv)' },
          text: '每天晚 6 点提醒'
        }));
      } else if (kk === 'longterm') {
        meta.push(U.el('span', {
          class: 'badge', style: { color: 'var(--text-faint)' },
          text: '长期任务 · 不排期'
        }));
      } else if (slot) {
        const conf = slot.confidence;
        const cls = conf === 'conflict' ? 'danger' : conf === 'urgent' || conf === 'tight' ? 'warn' : 'ok';
        meta.push(U.el('span', {
          class: 'badge ' + cls,
          text: `建议 ${U.friendly(slot.date)} ${slot.fromText}–${slot.toText}`
        }));
      } else {
        meta.push(U.el('span', { class: 'badge', style: { color: 'var(--text-faint)' }, text: '未排期' }));
      }
      if (t.location) meta.push(U.el('span', { text: '📍' + t.location }));

      /* 推荐理由 */
      const reasonRow = slot && (slot.reason || slot.conflicts && slot.conflicts.length)
        ? U.el('div', {
            class: 'm',
            style: {
              marginTop: '4px',
              color: slot.confidence === 'conflict' ? 'var(--danger)' : 'var(--text-faint)'
            },
            text: slot.reason
          })
        : null;

      /* 类型切换：点一下在「有截止 / 日常活动」之间切
         长期任务不用手动选 —— 没截止日又没排期的自动就是长期，
         这里只提供「把它变成日常活动」这个动作（用户说的"特别说明"）。 */
      const kind = S.kindOf(t);
      const isDaily = kind === 'daily';
      const kindBtn = U.el('button', {
        class: 'badge',
        style: {
          cursor: 'pointer', border: 'none', flexShrink: '0',
          color: isDaily ? 'var(--c-cv)' : 'var(--text-faint)',
          background: 'transparent'
        },
        text: isDaily ? '🔁 日常' : '设为日常',
        title: isDaily ? '点击取消日常标记' : '标记为日常活动：每天晚 6 点提醒'
      });
      kindBtn.addEventListener('click', e => {
        e.stopPropagation();
        t.kind = isDaily ? (t.due ? 'deadline' : 'longterm') : 'daily';
        /* 切成日常活动就不该再占一个具体时段了 */
        if (t.kind === 'daily') p.slot = null;
        App.refresh();
      });

      /* 分类切换 */
      const catBtn = U.el('button', {
        class: 'badge ' + t.cat,
        style: { cursor: 'pointer', border: 'none', flexShrink: '0' },
        text: S.CATS[t.cat].short
      });
      catBtn.addEventListener('click', e => {
        e.stopPropagation();
        const keys = Object.keys(S.CATS);
        t.cat = keys[(keys.indexOf(t.cat) + 1) % keys.length];
        App.refresh();
      });

      const row = U.el('div', {
        class: 'prev-item',
        style: Object.assign({ flexWrap: 'wrap' }, keep ? {} : { opacity: '.45' })
      }, [
        toggle,
        U.el('div', { class: 'grow', style: { minWidth: '0' } }, [
          U.el('div', { class: 't', text: t.title }),
          U.el('div', { class: 'm' }, meta),
          reasonRow
        ]),
        kindBtn,
        catBtn
      ]);
      /* 点条目调整时间；日常活动不需要排时间，点了也不open */
      row.addEventListener('click', e => {
        if (e.target === toggle || e.target === catBtn || e.target === kindBtn) return;
        if (S.kindOf(t) === 'daily') return;
        openSlotEditor(p);
      });
      scroll.appendChild(row);
    });

    root.appendChild(scroll);

    /* 操作 */
    root.appendChild(U.el('div', { class: 'row' }, [
      U.el('button', {
        class: 'btn ghost', style: { flexShrink: '0' }, text: '取消',
        onclick: () => { st.preview = null; st.raw = null; App.refresh(); }
      }),
      U.el('button', {
        class: 'btn primary grow',
        text: `归档 ${kept.length} 条`,
        onclick: () => doArchive(kept)
      })
    ]));

    /* 批量操作 */
    root.appendChild(U.el('div', { class: 'row', style: { marginTop: '8px' } }, [
      U.el('button', {
        class: 'btn ghost grow', style: { fontSize: '12.5px' }, text: '全部重新排期',
        onclick: () => { doParse(U.$('#importText').value); }
      }),
      U.el('button', {
        class: 'btn ghost grow', style: { fontSize: '12.5px' }, text: '全部勾选',
        onclick: () => { items.forEach(p => p.task._keep = true); App.refresh(); }
      })
    ]));
  }

  /* ═══════════ 单独调整时间 ═══════════ */
  function openSlotEditor(p) {
    const t = p.task, slot = p.slot;
    const dateIn = App.input('date', slot ? slot.date : U.ymd(U.today()), v => { _d = v; });
    let _d = dateIn.value;
    const fromIn = App.input('time', slot ? slot.fromText : '19:00', v => { _f = v; });
    let _f = fromIn.value;
    const toIn = App.input('time', slot ? slot.toText : '20:30', v => { _t2 = v; });
    let _t2 = toIn.value;

    const avoidIn = U.el('input', { type: 'checkbox', id: 'slotAvoid', checked: true });

    App.sheet('调整时间', U.el('div', {}, [
      U.el('div', { style: { fontSize: '13.5px', fontWeight: '600', marginBottom: '12px', lineHeight: '1.5' }, text: t.title }),
      App.field('日期', dateIn),
      U.el('div', { class: 'row' }, [
        U.el('div', { class: 'grow' }, [App.field('开始', fromIn)]),
        U.el('div', { class: 'grow' }, [App.field('结束', toIn)])
      ]),
      U.el('div', { class: 'opt-row' }, [avoidIn, U.el('label', { for: 'slotAvoid', text: '避开有课时间' })]),
      U.el('div', { class: 'row', style: { marginTop: '16px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
        U.el('button', {
          class: 'btn primary grow', text: '重新推荐',
          onclick: () => {
            const s = Sch.suggest(t, { skipId: t.id, ignoreCourses: avoidIn.checked });
            App.closeSheet();
            if (!s) return U.toast('找不到合适空档', 'err');
            p.slot = s;
            App.refresh();
            U.toast('已重新推荐：' + U.friendly(s.date) + ' ' + s.fromText, 'ok');
          }
        }),
        U.el('button', {
          class: 'btn primary grow', text: '就用这个',
          onclick: () => {
            const f = toMin(_f), e2 = toMin(_t2);
            if (f == null || e2 == null) return U.toast('时间格式不对', 'err');
            if (e2 <= f) return U.toast('结束要晚于开始', 'err');
            const conflict = Sch.busyOn(_d).filter(b => b.to > f && b.from < e2);
            p.slot = {
              date: _d, from: f, to: e2, fromText: _f, toText: _t2,
              window: '', confidence: conflict.length ? 'conflict' : 'manual',
              reason: conflict.length ? `与「${conflict.map(c => c.name).join('、')}」冲突` : '手动设定',
              conflicts: conflict
            };
            App.closeSheet();
            App.refresh();
          }
        })
      ])
    ]), { autofocus: false });
  }

  function toMin(s) {
    const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
    return m ? (+m[1] * 60 + +m[2]) : null;
  }

  /* ═══════════ 归档入库 ═══════════ */
  function doArchive(items) {
    if (!items.length) return U.toast('没有勾选任何条目', 'err');

    let n = 0, skipped = 0;
    items.forEach(p => {
      const t = Object.assign({}, p.task);
      delete t._keep; delete t.raw; delete t.catReason;

      /* 同标题同时间的跳过，避免重复导入 */
      const dup = S.all('tasks').some(x =>
        x.title === t.title && (x.due || x.start || '') === (t.due || t.start || ''));
      if (dup) { skipped++; return; }

      /* 写入推荐时段 */
      if (p.slot) {
        t.start = `${p.slot.date}T${p.slot.fromText}`;
        t.suggested = true;
        t.suggestReason = p.slot.reason || '';
        /* 只有截止没时间的，用结束时刻作为 due */
        if (!t.due) t.due = `${p.slot.date}T${p.slot.toText}`;
      }
      S.bulkAdd('tasks', [t]);
      n++;
    });

    S.db.meta.lastImport = new Date().toISOString();
    S.saveNow();

    st.preview = null; st.raw = null;
    const ta = U.$('#importText');
    if (ta) ta.value = '';
    App.refresh();
    U.toast(`已归档 ${n} 条${skipped ? `（跳过 ${skipped} 条重复）` : ''}`, 'ok');
  }

  /* 供外部（AI 生成）调用 */
  Views.importv.showPreview = function (tasks, sourceLabel) {
    st.raw = tasks;
    st.preview = Sch.plan(tasks, { ignoreCourses: Sch.hasTimetable() });
    App.go('import');
    U.toast(`${sourceLabel}：${tasks.length} 条待确认`, 'ok');
  };

  /* ═══════════ 课表导入（图片 OCR） ═══════════ */
  function openTimetableImport() {
    const body = U.el('div', {});
    const status = U.el('div', { style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7' } });
    const preview = U.el('div', {});

    let picked = null;      // {dataUrl, name}

    function renderStatus() {
      status.innerHTML = '';
      if (!AI.isReady()) {
        status.appendChild(U.el('div', {
          style: { color: 'var(--warn)' },
          text: '⚠ 还没配置 API Key，不能识别图片。可以先手动录入，或到设置里填 Key。'
        }));
      } else {
        status.appendChild(U.el('div', { text: '选择课表截图，AI 会识别出课程、星期、节次和地点。' }));
      }
    }
    renderStatus();

    /* 选图 */
    const fileBtn = U.el('button', {
      class: 'btn ghost block', text: '① 选择课表截图',
      onclick: () => {
        const inp = U.el('input', { type: 'file', accept: 'image/*' });
        inp.addEventListener('change', () => {
          const f = inp.files && inp.files[0];
          if (!f) return;
          if (f.size > 4 * 1024 * 1024) { U.toast('图片太大，请压缩到 4MB 以内', 'err'); return; }
          const fr = new FileReader();
          fr.onload = () => {
            picked = { dataUrl: fr.result, name: f.name };
            thumb.innerHTML = '';
            thumb.appendChild(U.el('img', {
              src: fr.result,
              style: { width: '100%', borderRadius: '10px', marginTop: '10px' }
            }));
            U.toast('已选择，点「识别」', 'ok');
          };
          fr.readAsDataURL(f);
        });
        inp.click();
      }
    });

    const thumb = U.el('div', {});

    const recogBtn = U.el('button', {
      class: 'btn primary block', style: { marginTop: '9px' }, text: '② 识别课表',
      onclick: async () => {
        if (!picked) return U.toast('先选一张截图', 'err');
        if (!AI.isReady()) return U.toast('请先在设置里配置 API Key', 'err');
        recogBtn.textContent = '识别中…';
        recogBtn.disabled = true;
        try {
          const courses = await AI.readTimetable(picked.dataUrl);
          if (!courses.length) throw new Error('没识别出课程');
          preview.innerHTML = '';
          preview.appendChild(renderCourses(courses));
          U.toast(`识别出 ${courses.length} 门课`, 'ok');
        } catch (e) {
          U.toast('识别失败：' + e.message, 'err');
        } finally {
          recogBtn.textContent = '② 识别课表';
          recogBtn.disabled = false;
        }
      }
    });

    body.appendChild(U.el('div', {}, [status, fileBtn, thumb, recogBtn]));
    body.appendChild(preview);

    /* 手动录入入口 */
    body.appendChild(U.el('button', {
      class: 'btn ghost block', style: { marginTop: '12px', fontSize: '12.5px' },
      text: '不想用 AI？手动录入课表',
      onclick: () => { App.closeSheet(); setTimeout(openManualTimetable, 240); }
    }));

    App.sheet('导入课表', body, { autofocus: false });
  }

  function renderCourses(courses) {
    const wrap = U.el('div', {});
    wrap.appendChild(U.el('div', { class: 'section-label', text: `识别结果（${courses.length} 门）` }));

    const list = U.el('div', { style: { maxHeight: '34vh', overflowY: 'auto' } });
    const dows = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    courses.forEach(c => {
      list.appendChild(U.el('div', {
        style: { padding: '8px 0', borderBottom: '1px solid var(--border)' }
      }, [
        U.el('div', { style: { fontSize: '13.5px', fontWeight: '600' }, text: c.name }),
        U.el('div', { style: { fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '2px' },
          text: `${dows[c.weekday] || '?'} 第${c.startPeriod || '?'}-${c.endPeriod || '?'}节`
            + (c.location ? ` · ${c.location}` : '')
            + (c.weeks && c.weeks.length ? ` · ${c.weeks.length}周` : '') })
      ]));
    });
    wrap.appendChild(list);

    /* 学期起点 */
    const termIn = App.input('date',
      S.settings.timetable.termStart || U.ymd(U.startOfWeek(U.today())),
      () => {});

    wrap.appendChild(U.el('div', { style: { marginTop: '12px' } }, [
      App.field('第一周周一（用于计算第几周）', termIn)
    ]));

    wrap.appendChild(U.el('button', {
      class: 'btn primary block', style: { marginTop: '12px' }, text: '保存课表',
      onclick: () => {
        S.settings.timetable = {
          termStart: termIn.value,
          weeks: 16,
          courses: courses,
          importedAt: new Date().toISOString(),
          source: 'ocr'
        };
        S.saveNow();
        App.closeSheet();
        App.refresh();
        U.toast(`已保存 ${courses.length} 门课，排期会避开这些时间`, 'ok');
      }
    }));
    return wrap;
  }

  /* ═══════════ 手动录入课表 ═══════════ */
  function openManualTimetable() {
    const rows = [];

    function makeRow() {
      const nameIn = App.input('text', '', () => {}, '课程名');
      const dowSel = App.selectEl(
        [1, 2, 3, 4, 5, 6, 7].map(d => ({ value: d, label: ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][d] })),
        1, () => {});
      const fromIn = App.input('time', '08:00', () => {});
      const toIn = App.input('time', '09:40', () => {});
      const locIn = App.input('text', '', () => {}, '地点（可选）');

      const row = U.el('div', {
        style: { padding: '10px 0', borderBottom: '1px solid var(--border)' }
      }, [
        App.field('课程名', nameIn),
        U.el('div', { class: 'row' }, [
          U.el('div', { class: 'grow' }, [App.field('星期', dowSel)]),
          U.el('div', { class: 'grow' }, [App.field('开始', fromIn)]),
          U.el('div', { class: 'grow' }, [App.field('结束', toIn)])
        ]),
        App.field('地点', locIn),
        U.el('button', {
          class: 'btn ghost sm', style: { marginTop: '4px' }, text: '删除这门课',
          onclick: () => { row.remove(); const i = rows.indexOf(row); if (i >= 0) rows.splice(i, 1); }
        })
      ]);
      row._read = () => {
        const name = nameIn.value.trim();
        if (!name) return null;
        const fm = fromIn.value.match(/^(\d{1,2}):(\d{2})$/);
        const tm = toIn.value.match(/^(\d{1,2}):(\d{2})$/);
        if (!fm || !tm) return null;
        return {
          name,
          weekday: Number(dowSel.value),
          start: { h: +fm[1], m: +fm[2] },
          end: { h: +tm[1], m: +tm[2] },
          weeks: [],
          location: locIn.value.trim()
        };
      };
      rows.push(row);
      return row;
    }

    const listBox = U.el('div', {});
    listBox.appendChild(makeRow());

    const termIn = App.input('date',
      S.settings.timetable.termStart || U.ymd(U.startOfWeek(U.today())), () => {});

    App.sheet('手动录入课表', U.el('div', {}, [
      U.el('div', { style: { fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.7', marginBottom: '10px' },
        text: '只填有课的时间段就行。课表的作用是让排期避开上课时间，不影响你要做的事。' }),
      App.field('第一周周一', termIn),
      listBox,
      U.el('button', {
        class: 'btn ghost sm block', style: { marginTop: '10px' }, text: '＋ 再加一门',
        onclick: () => listBox.appendChild(makeRow())
      }),
      U.el('div', { class: 'row', style: { marginTop: '16px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
        U.el('button', {
          class: 'btn primary grow', text: '保存',
          onclick: () => {
            const courses = rows.map(r => r._read()).filter(Boolean);
            if (!courses.length) return U.toast('至少填一门课', 'err');
            S.settings.timetable = {
              termStart: termIn.value, weeks: 16, courses,
              importedAt: new Date().toISOString(), source: 'manual'
            };
            S.saveNow();
            App.closeSheet();
            App.refresh();
            U.toast(`已保存 ${courses.length} 门课`, 'ok');
          }
        })
      ])
    ]), { autofocus: false });
  }

  Views.openTimetableImport = openTimetableImport;
  Views.openManualTimetable = openManualTimetable;

  /* ═══════════ 从 DSH 导入 ═══════════ */
  function openDshImport() {
    const ta = U.el('textarea', {
      class: 'textarea', style: { minHeight: '130px' },
      placeholder: '把 DSH 生成的 JSON 粘贴到这里。\n\n格式：\n{"tasks":[{"title":"...","cat":"cv","due":"2026-03-20","priority":2}]}\n\n也可以直接粘贴 LifeHub 的备份 JSON。'
    });

    const box = U.el('div', {}, [
      U.el('p', { style: { fontSize: '13px', color: 'var(--text-dim)', marginTop: 0, lineHeight: '1.65' },
        text: '支持两种内容：DSH 生成的 {tasks:[...]}，或 LifeHub 完整备份 JSON。' }),
      ta,
      U.el('div', { class: 'row', style: { marginTop: '12px' } }, [
        U.el('button', { class: 'btn ghost grow', text: '取消', onclick: () => App.closeSheet() }),
        U.el('button', {
          class: 'btn primary grow', text: '解析导入',
          onclick: () => {
            const txt = ta.value.trim();
            if (!txt) return U.toast('先粘贴内容', 'err');
            try {
              let s = txt;
              const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
              if (fence) s = fence[1].trim();
              const a = s.indexOf('{'), b = s.lastIndexOf('}');
              if (a >= 0 && b > a) s = s.slice(a, b + 1);
              const obj = JSON.parse(s);

              if (Array.isArray(obj.tasks)) {
                const tasks = AI.parseTasksJSON(JSON.stringify(obj));
                if (!tasks.length) throw new Error('没有解析出任务');
                App.closeSheet();
                setTimeout(() => Views.importv.showPreview(tasks, 'DSH 导入'), 260);
              } else if (obj.version || obj.meals || obj.txns) {
                S.importAll(obj, 'merge');
                App.closeSheet();
                U.toast('已合并导入数据', 'ok');
                App.refresh();
              } else {
                throw new Error('无法识别的格式');
              }
            } catch (e) {
              U.toast('解析失败：' + e.message, 'err');
            }
          }
        })
      ])
    ]);

    App.sheet('从 DSH 导入', box, { autofocus: false });
  }

  Views.importState = st;
  global.Views = Views;
})(window);