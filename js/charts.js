/* ═══════════════════════════════════════════════
   charts.js — 轻量 Canvas 图表（无第三方依赖）
   适配小米 / Android 高 DPI 屏幕，跟随明暗主题。
   用法：<script src="js/charts.js"></script> → window.Charts
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const C = {};

  /* ───────── 基础常量 ───────── */

  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, sans-serif';
  const EMPTY_TEXT = '暂无数据';
  const DEFAULT_HEIGHT = 200;          // 移动端默认高度（CSS 像素）
  const LEGEND_ROW_H = 20;             // 图例每行高度
  const PAD = { top: 12, right: 12, bottom: 22, left: 34 };

  /* ───────── 主题 ───────── */

  let _themeCache = null;              // 缓存已解析的主题色
  const THEME_VARS = ['text', 'text-dim', 'text-faint', 'border', 'bg-elev', 'bg-sunken', 'brand', 'ok', 'danger', 'warn'];

  /** 读取 CSS 变量；变量为空时回退到默认值 */
  function cssVar(name, fallback) {
    try {
      const v = global.getComputedStyle(document.documentElement).getPropertyValue('--' + name);
      const s = (v || '').trim();
      return s || fallback;
    } catch (e) {
      return fallback;
    }
  }

  /** 取当前主题的解析结果（带缓存） */
  C.theme = function () {
    if (_themeCache) return _themeCache;
    const t = {};
    THEME_VARS.forEach(function (n) { t[n] = cssVar(n, FALLBACK[n]); });
    // 级联回退：faint / dim 缺失时退到较浅的通用灰
    t['text-faint'] = t['text-faint'] || t['text-dim'] || t.text;
    t['text-dim'] = t['text-dim'] || t.text;
    t['bg-sunken'] = t['bg-sunken'] || t['bg-elev'] || t.text;
    _themeCache = t;
    return t;
  };

  const FALLBACK = {
    text: '#14161a', 'text-dim': '#626873', 'text-faint': '#9aa1ad',
    border: '#e3e6ea', 'bg-elev': '#ffffff', 'bg-sunken': '#eaecf0',
    brand: '#3b6ef6', ok: '#12a150', danger: '#e5484d', warn: '#e08c00'
  };

  /** 让主题缓存失效，下次取色重新读取 DOM */
  C.invalidateTheme = function () { _themeCache = null; };

  // data-theme 变化时自动失效（MutationObserver 不可用时静默跳过）
  try {
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      new MutationObserver(function () { C.invalidateTheme(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    }
  } catch (e) { /* 忽略环境不支持 */ }

  /* ───────── 通用工具 ───────── */

  /** 颜色 + 透明度 → rgba()；支持 #rgb / #rrggbb / rgb() */
  C.alpha = function (color, a) {
    const c = String(color || '').trim();
    let r = 0, g = 0, b = 0;
    if (c.charAt(0) === '#') {
      let h = c.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length >= 6) {
        r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
      }
    } else {
      const m = c.match(/rgba?\(([^)]+)\)/i);
      if (m) {
        const p = m[1].split(',').map(function (s) { return parseFloat(s); });
        r = p[0] || 0; g = p[1] || 0; b = p[2] || 0;
      }
    }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };

  /** 圆角矩形路径；优先用原生 ctx.roundRect */
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, rr);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }
  C.roundRect = roundRect;

  /** 轴最大值向上取整到 1/2/2.5/5/10 × 10^n 的可读数字 */
  function niceMax(v) {
    const n = Math.abs(Number(v) || 0);
    if (!isFinite(n) || n <= 0) return 1;
    const exp = Math.floor(Math.log10(n));
    const pow = Math.pow(10, exp);
    const f = n / pow;
    let m;
    if (f <= 1) m = 1;
    else if (f <= 2) m = 2;
    else if (f <= 2.5) m = 2.5;
    else if (f <= 5) m = 5;
    else m = 10;
    return m * pow;
  }
  C.niceMax = niceMax;

  /** 数字简写：1200 → 1.2k */
  function shortNum(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 10000) return (n / 10000).toFixed(Math.abs(n) >= 100000 ? 0 : 1) + 'w';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1) + 'k';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
  C.shortNum = shortNum;

  /** 按像素宽度截断文本，超宽加省略号 */
  function fitText(ctx, text, maxW) {
    const s = String(text == null ? '' : text);
    if (maxW <= 0) return '';
    if (ctx.measureText(s).width <= maxW) return s;
    const ell = '…';
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(s.slice(0, mid) + ell).width <= maxW) lo = mid; else hi = mid - 1;
    }
    return lo <= 0 ? '' : s.slice(0, lo) + ell;
  }
  C.fitText = fitText;

  /** 创建一组已按 DPR 缩放的绘图上下文 */
  function surface(canvas, hCss, widthFallback) {
    if (!canvas) return null;
    const dpr = Number(global.devicePixelRatio) || 1;
    let cw = (typeof canvas.clientWidth === 'number' && canvas.clientWidth > 0)
      ? canvas.clientWidth : (Number(canvas.width) || widthFallback || 320) / dpr;
    const height = Number(hCss) > 0 ? Number(hCss)
      : ((typeof canvas.clientHeight === 'number' && canvas.clientHeight > 0) ? canvas.clientHeight : DEFAULT_HEIGHT);
    const w = Math.max(1, cw), h = Math.max(1, height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (canvas.style) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);   // 幂等：重置上一轮残留的 scale
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.textBaseline = 'middle';
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  /** 居中绘制「暂无数据」 */
  function drawEmpty(ctx, w, h) {
    const t = C.theme();
    ctx.save();
    ctx.fillStyle = t['text-faint'];
    ctx.font = '500 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(EMPTY_TEXT, w / 2, h / 2);
    ctx.restore();
  }

  /** 空数据判定 */
  function isEmpty(items) {
    return !items || !items.length;
  }

  /* ───────── 1. 环形图 ───────── */

  /**
   * C.donut(canvas, items, opts)
   * items: [{ label, value, color }]
   * opts:  { thickness, centerText, centerSub, showLegend }
   */
  C.donut = function (canvas, items, opts) {
    const o = opts || {};
    const list = (items || []).filter(function (d) { return d && Number(d.value) > 0; });
    const showLegend = o.showLegend !== false;
    const legendRows = showLegend ? list.length : 0;
    const thickness = Number(o.thickness) > 0 ? Number(o.thickness) : 18;

    // 依据图例行数推算合理高度
    const ringH = Number(o.height) > 0 ? Number(o.height) : 150;
    const totalH = ringH + (legendRows ? legendRows * LEGEND_ROW_H + 8 : 0);

    const s = surface(canvas, totalH);
    if (!s) return;
    const ctx = s.ctx, t = C.theme();

    if (isEmpty(list)) { drawEmpty(ctx, s.w, s.h); return; }

    const total = list.reduce(function (a, d) { return a + (Number(d.value) || 0); }, 0);
    if (total <= 0) { drawEmpty(ctx, s.w, s.h); return; }

    const cx = s.w / 2;
    const cy = ringH / 2 + 2;
    const outer = Math.max(12, Math.min(s.w / 2 - 8, ringH / 2 - 8));
    const r = outer - thickness / 2;
    const gap = list.length > 1 ? Math.min(0.05, 2.2 / Math.max(r, 1)) : 0;  // 弧间空隙（弧度）

    ctx.save();
    ctx.lineCap = 'round';

    // 底环
    ctx.beginPath();
    ctx.strokeStyle = t['bg-sunken'];
    ctx.lineWidth = thickness;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    let a0 = -Math.PI / 2;
    list.forEach(function (d, i) {
      const frac = (Number(d.value) || 0) / total;
      const sweep = frac * Math.PI * 2;
      const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] || t.brand;
      const start = a0 + gap / 2;
      const end = a0 + sweep - gap / 2;
      if (end > start) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.arc(cx, cy, r, start, end);
        ctx.stroke();
      }
      a0 += sweep;
    });

    // 中心文字
    const centerText = o.centerText != null ? String(o.centerText) : '';
    const centerSub = o.centerSub != null ? String(o.centerSub) : '';
    if (centerText) {
      ctx.fillStyle = t.text;
      ctx.font = '700 ' + Math.max(15, Math.min(26, r * 0.55)) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(fitText(ctx, centerText, r * 1.7), cx, cy - (centerSub ? 8 : 0));
    }
    if (centerSub) {
      ctx.fillStyle = t['text-dim'];
      ctx.font = '500 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(fitText(ctx, centerSub, r * 1.7), cx, cy + (centerText ? 11 : 0));
    }
    ctx.restore();

    if (!showLegend) return;

    // 图例：色点 + 「label  value」两列
    ctx.save();
    let ly = ringH + 10;
    const dotR = 4;
    const leftX = 10;
    const valRight = s.w - 10;
    ctx.font = '500 12px ' + FONT;
    list.forEach(function (d, i) {
      const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] || t.brand;
      const valStr = o.valueFormat ? o.valueFormat(d.value) : shortNum(d.value);
      const valW = ctx.measureText(valStr).width;

      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(leftX + dotR, ly + LEGEND_ROW_H / 2 - 1, dotR, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = t['text-dim'];
      ctx.fillText(fitText(ctx, d.label || '', s.w - 40 - valW - 12), leftX + dotR * 2 + 8, ly + LEGEND_ROW_H / 2 - 1);

      ctx.textAlign = 'right';
      ctx.fillStyle = t.text;
      ctx.font = '600 12px ' + FONT;
      ctx.fillText(valStr, valRight, ly + LEGEND_ROW_H / 2 - 1);
      ctx.font = '500 12px ' + FONT;

      ly += LEGEND_ROW_H;
    });
    ctx.restore();
  };

  const DEFAULT_COLORS = ['#3b6ef6', '#12a150', '#e08c00', '#e5484d', '#8b5cf6', '#0d9488'];

  /* ───────── 2. 柱状图 ───────── */

  /**
   * C.bars(canvas, items, opts)
   * items: [{ label, value, color }]
   * opts:  { max, showValues, valueFormat, height, barRadius, highlightIndex }
   */
  C.bars = function (canvas, items, opts) {
    const o = opts || {};
    const list = items || [];
    const s = surface(canvas, Number(o.height) > 0 ? Number(o.height) : 190);
    if (!s) return;
    const ctx = s.ctx, t = C.theme();

    if (isEmpty(list)) { drawEmpty(ctx, s.w, s.h); return; }

    const pad = { top: PAD.top + (o.showValues === false ? 0 : 12), right: PAD.right, bottom: PAD.bottom + 8, left: PAD.left };

    // 轴上限
    let maxVal = 0;
    list.forEach(function (d) { maxVal = Math.max(maxVal, Number(d.value) || 0); });
    const top = Number(o.max) > 0 ? Number(o.max) : niceMax(maxVal || 1);

    const plotX = pad.left;
    const plotY = pad.top;
    const plotW = Math.max(10, s.w - pad.left - pad.right);
    const plotH = Math.max(10, s.h - pad.top - pad.bottom);

    ctx.save();

    // 横向网格线（4 条）+ 左侧数值
    const GRID = 4;
    ctx.font = '500 10px ' + FONT;
    ctx.textAlign = 'right';
    for (let i = 0; i <= GRID; i++) {
      const ratio = i / GRID;
      const y = Math.round(plotY + plotH - ratio * plotH) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = t.border;
      ctx.lineWidth = 1;
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotW, y);
      ctx.stroke();
      ctx.fillStyle = t['text-faint'];
      ctx.fillText(shortNum(top * ratio), plotX - 6, y);
    }

    // 柱体
    const n = list.length;
    const slot = plotW / n;
    const barW = Math.max(3, Math.min(slot * 0.62, 40));
    const radius = Number(o.barRadius) >= 0 ? Number(o.barRadius) : 4;
    const valueFont = '600 10px ' + FONT;
    const showValues = o.showValues !== false;

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX, 0, plotW, s.h);
    ctx.clip();                          // 防止溢出

    list.forEach(function (d, i) {
      const v = Number(d.value) || 0;
      const ratio = top > 0 ? Math.max(0, Math.min(1, v / top)) : 0;
      const h = ratio * plotH;
      const x = plotX + slot * i + (slot - barW) / 2;
      const y = plotY + plotH - h;
      const color = d.color || (i === o.highlightIndex ? t.brand : DEFAULT_COLORS[0]);
      const dim = o.highlightIndex != null && i !== o.highlightIndex;

      ctx.globalAlpha = dim ? 0.42 : 1;
      ctx.fillStyle = color;
      if (h > 0.5) {
        roundRect(ctx, x, y, barW, h, radius);
        ctx.fill();
      }

      if (showValues && slot > 26) {
        const txt = o.valueFormat ? o.valueFormat(v) : shortNum(v);
        ctx.globalAlpha = 1;
        ctx.fillStyle = dim ? t['text-faint'] : t.text;
        ctx.font = valueFont;
        ctx.textAlign = 'center';
        ctx.fillText(fitText(ctx, txt, slot - 2), x + barW / 2, y - 7);
      }
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // x 轴标签：过多则旋转，永不重叠
    const labelFont = '500 10px ' + FONT;
    ctx.font = labelFont;
    let maxLabelW = 0;
    list.forEach(function (d) { maxLabelW = Math.max(maxLabelW, ctx.measureText(String(d.label || '')).width); });
    const rotate = maxLabelW > slot - 2 || n > 10;

    if (rotate) {
      ctx.save();
      ctx.fillStyle = t['text-faint'];
      ctx.font = labelFont;
      ctx.textAlign = 'right';
      list.forEach(function (d, i) {
        const cx2 = plotX + slot * i + slot / 2;
        ctx.save();
        ctx.translate(cx2, plotY + plotH + 6);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(fitText(ctx, String(d.label || ''), 34), 0, 0);
        ctx.restore();
      });
      ctx.restore();
    } else {
      ctx.fillStyle = t['text-faint'];
      ctx.font = labelFont;
      ctx.textAlign = 'center';
      list.forEach(function (d, i) {
        const cx2 = plotX + slot * i + slot / 2;
        ctx.fillText(fitText(ctx, String(d.label || ''), slot - 2), cx2, plotY + plotH + 10);
      });
    }

    ctx.restore();
  };

  /* ───────── 3. 折线图 ───────── */

  /** 提取 series 中所有点，按 x 升序排列 */
  function flattenPoints(series) {
    const out = [];
    (series || []).forEach(function (se) {
      (se && se.points ? se.points : []).forEach(function (p) {
        if (p && p.x != null) out.push({ x: String(p.x), y: Number(p.y) || 0 });
      });
    });
    out.sort(function (a, b) { return a.x < b.x ? -1 : (a.x > b.x ? 1 : 0); });
    // 去重（同一日期只保留一个）
    const uniq = [];
    out.forEach(function (p) { if (!uniq.length || uniq[uniq.length - 1].x !== p.x) uniq.push(p); });
    return uniq;
  }

  /** "YYYY-MM-DD" → "M/D" */
  function mdLabel(x) {
    const m = String(x).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(x);
    return Number(m[2]) + '/' + Number(m[3]);
  }

  /**
   * C.line(canvas, series, opts)
   * series: [{ name, color, points: [{ x: "YYYY-MM-DD", y: Number }] }]
   * opts:   { height, showArea, showDots, yFormat, zeroLine }
   */
  C.line = function (canvas, series, opts) {
    const o = opts || {};
    const list = (series || []).filter(function (se) {
      return se && se.points && se.points.length;
    });
    const s = surface(canvas, Number(o.height) > 0 ? Number(o.height) : 200);
    if (!s) return;
    const ctx = s.ctx, t = C.theme();

    if (isEmpty(list)) { drawEmpty(ctx, s.w, s.h); return; }

    const all = flattenPoints(list);
    if (!all.length) { drawEmpty(ctx, s.w, s.h); return; }

    const pad = { top: PAD.top + 6, right: PAD.right + 2, bottom: PAD.bottom + 10, left: PAD.left + 6 };
    const plotX = pad.left;
    const plotY = pad.top;
    const plotW = Math.max(10, s.w - pad.left - pad.right);
    const plotH = Math.max(10, s.h - pad.top - pad.bottom);

    // y 轴范围（含 0 基线）
    let lo = Infinity, hi = -Infinity;
    all.forEach(function (p) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
    if (lo === hi) { hi = lo + 1; lo = Math.min(lo, 0); }
    if (o.zeroLine) lo = Math.min(lo, 0);
    const span = hi - lo || 1;
    const maxV = niceMax(hi);
    const minV = lo < 0 ? -niceMax(-lo) : 0;
    const range = maxV - minV || 1;

    const n = all.length;
    const idx = {};
    all.forEach(function (p, i) { idx[p.x] = i; });

    const X = function (i) {
      if (n === 1) return plotX + plotW / 2;
      return plotX + (i / (n - 1)) * plotW;
    };
    const Y = function (v) {
      return plotY + plotH - ((v - minV) / range) * plotH;
    };
    void span;

    ctx.save();
    // 裁剪，保证不溢出画布
    ctx.beginPath();
    ctx.rect(0, plotY - 4, s.w, plotH + 8);
    ctx.clip();

    // 网格 + y 轴刻度（4 格）
    const GRID = 4;
    ctx.font = '500 10px ' + FONT;
    ctx.textAlign = 'right';
    for (let i = 0; i <= GRID; i++) {
      const v = minV + (range * i) / GRID;
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = t.border;
      ctx.lineWidth = 1;
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotW, y);
      ctx.stroke();
      ctx.fillStyle = t['text-faint'];
      const lbl = o.yFormat ? o.yFormat(v) : shortNum(v);
      ctx.fillText(fitText(ctx, lbl, pad.left - 8), plotX - 6, y);
    }

    // 零线（虚线）
    if (o.zeroLine && minV < 0 && maxV > 0) {
      const zy = Math.round(Y(0)) + 0.5;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = t['text-faint'];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, zy);
      ctx.lineTo(plotX + plotW, zy);
      ctx.stroke();
      ctx.restore();
    }

    const showDots = o.showDots !== false && n <= 40;

    list.forEach(function (se, si) {
      const color = se.color || DEFAULT_COLORS[si % DEFAULT_COLORS.length] || t.brand;
      const pts = [];
      (se.points || []).forEach(function (p) {
        if (!p || p.x == null) return;
        const i = idx[String(p.x)];
        if (i == null) return;
        pts.push({ x: X(i), y: Y(Number(p.y) || 0) });
      });
      if (!pts.length) return;
      pts.sort(function (a, b) { return a.x - b.x; });

      // 面积渐变
      if (o.showArea) {
        const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
        grad.addColorStop(0, C.alpha(color, 0.26));
        grad.addColorStop(1, C.alpha(color, 0.01));
        ctx.beginPath();
        ctx.moveTo(pts[0].x, plotY + plotH);
        pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
        ctx.lineTo(pts[pts.length - 1].x, plotY + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // 折线
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();

      // 数据点
      if (showDots) {
        ctx.fillStyle = color;
        pts.forEach(function (p) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, n > 20 ? 2 : 2.6, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    });
    ctx.restore();

    // x 轴标签：均匀取 2~4 个
    const want = Math.min(4, n);
    const picked = [];
    if (n === 1) picked.push(0);
    else {
      for (let i = 0; i < want; i++) {
        picked.push(Math.round((i * (n - 1)) / (want - 1)));
      }
    }
    const uniqIdx = picked.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    ctx.save();
    ctx.font = '500 10px ' + FONT;
    ctx.fillStyle = t['text-faint'];
    uniqIdx.forEach(function (i, k) {
      const isFirst = k === 0, isLast = k === uniqIdx.length - 1;
      ctx.textAlign = isFirst ? 'left' : (isLast ? 'right' : 'center');
      let px = X(i);
      if (isFirst) px = plotX;
      if (isLast && uniqIdx.length > 1) px = plotX + plotW;
      ctx.fillText(mdLabel(all[i].x), px, plotY + plotH + 12);
    });
    ctx.restore();
  };

  /* ───────── 4. 热力图 ───────── */

  /** "YYYY-MM-DD" → 本地 Date */
  function parseYmd(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /**
   * C.heatmap(canvas, data, opts)
   * data: [{ date: "YYYY-MM-DD", value: Number }]
   * opts: { weeks, cellSize, gap, levels, levelColors }
   */
  C.heatmap = function (canvas, data, opts) {
    const o = opts || {};
    const t = C.theme();

    // 默认 5 级色阶：--bg-sunken → --brand
    const defaultLevels = [0, 1, 2, 4, 7];
    const ramp = o.levelColors || [
      t['bg-sunken'],
      C.alpha(t.brand, 0.28),
      C.alpha(t.brand, 0.5),
      C.alpha(t.brand, 0.75),
      t.brand
    ];
    const levels = o.levels || defaultLevels;
    const rampLen = ramp.length;

    const cell = Number(o.cellSize) > 0 ? Number(o.cellSize) : 11;
    const gap = Number(o.gap) >= 0 ? Number(o.gap) : 2.5;
    const weeks = Number(o.weeks) > 0 ? Number(o.weeks) : 26;
    const leftPad = 6;
    const topPad = 14;                       // 月份标签
    const step = cell + gap;
    const width = leftPad * 2 + weeks * step - gap;
    const height = topPad + 7 * step - gap + 4;

    const s = surface(canvas, height, width);
    if (!s) return;
    const ctx = s.ctx;

    if (isEmpty(data)) { drawEmpty(ctx, s.w, s.h); return; }

    // 日期 → 数值
    const map = {};
    data.forEach(function (d) {
      if (!d || d.date == null) return;
      map[String(d.date).slice(0, 10)] = Number(d.value) || 0;
    });

    // 结束于今天，回溯 weeks 列；列以周一为起点
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dowMon = (today.getDay() + 6) % 7;                 // 今天在本周中的位置（周一=0）
    const endOfGrid = new Date(today); endOfGrid.setDate(today.getDate() + (6 - dowMon));  // 本周周日

    const start = new Date(endOfGrid);
    start.setDate(endOfGrid.getDate() - (weeks * 7 - 1));

    const colorFor = function (v) {
      if (v <= levels[0]) return ramp[0];
      let lv = 1;
      for (let i = 1; i < levels.length; i++) { if (v >= levels[i]) lv = i; }
      return ramp[Math.min(lv, rampLen - 1)];
    };

    ctx.save();
    ctx.font = '500 9px ' + FONT;
    ctx.textBaseline = 'middle';

    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const x = leftPad + w * step;
      for (let d = 0; d < 7; d++) {
        const cur = new Date(start);
        cur.setDate(start.getDate() + w * 7 + d);
        const y = topPad + d * step;
        if (cur > today) continue;                            // 未来格子不画

        const key = cur.getFullYear() + '-' +
          String(cur.getMonth() + 1).padStart(2, '0') + '-' +
          String(cur.getDate()).padStart(2, '0');
        const v = map[key] || 0;

        ctx.fillStyle = colorFor(v);
        roundRect(ctx, x, y, cell, cell, Math.min(3, cell / 3));
        ctx.fill();

        // 月份变化时在上方标注
        if (d === 0 && cur.getMonth() !== lastMonth && w > 0) {
          lastMonth = cur.getMonth();
          ctx.fillStyle = t['text-faint'];
          ctx.textAlign = 'left';
          ctx.fillText((cur.getMonth() + 1) + '月', x, topPad - 8);
        }
      }
    }
    ctx.restore();
  };

  /* ───────── 5. 圆形进度环 ───────── */

  /**
   * C.progress(canvas, value, opts)
   * opts: { size, thickness, color, trackColor, label, sub }
   */
  C.progress = function (canvas, value, opts) {
    const o = opts || {};
    const size = Number(o.size) > 0 ? Number(o.size) : 96;
    const thickness = Number(o.thickness) > 0 ? Number(o.thickness) : 8;
    const s = surface(canvas, size, size);
    if (!s) return;
    const ctx = s.ctx, t = C.theme();

    const v = Number(value);
    const pct = isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
    const cx = size / 2, cy = size / 2;
    const r = Math.max(4, size / 2 - thickness / 2 - 2);

    ctx.save();
    // 轨道
    ctx.beginPath();
    ctx.strokeStyle = o.trackColor || t['bg-sunken'];
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 进度
    const color = o.color || t.brand;
    if (pct > 0) {
      const start = -Math.PI / 2;
      const end = start + (pct / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.arc(cx, cy, r, start, Math.min(end, start + Math.PI * 2 - 0.0001), false);
      ctx.stroke();
    }

    // 中心百分比
    ctx.fillStyle = t.text;
    ctx.font = '700 ' + Math.max(12, Math.round(size * 0.2)) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(fitText(ctx, Math.round(pct) + '%', size - 8), cx, cy - (o.sub || o.label ? 6 : 0));

    if (o.label) {
      ctx.fillStyle = t['text-dim'];
      ctx.font = '500 10px ' + FONT;
      ctx.fillText(fitText(ctx, String(o.label), size - 6), cx, cy + 11);
    }
    if (o.sub) {
      ctx.fillStyle = t['text-faint'];
      ctx.font = '500 9px ' + FONT;
      ctx.fillText(fitText(ctx, String(o.sub), size - 6), cx, cy + (o.label ? 23 : 11));
    }
    ctx.restore();
  };

  /* ───────── 导出 ───────── */

  C.version = '1.0.0';
  C.EMPTY_TEXT = EMPTY_TEXT;

  global.Charts = C;
})(window);