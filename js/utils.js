/* ═══════════════════════════════════════════════
   utils.js — 日期 / DOM / 格式化 工具
   ═══════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const U = {};

  /* ───────── 日期 ───────── */

  U.pad = n => String(n).padStart(2, '0');

  /** Date → "YYYY-MM-DD"（本地时区，不用 toISOString 以免时区偏移） */
  U.ymd = d => {
    d = d instanceof Date ? d : new Date(d);
    return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  };

  /** Date → "YYYY-MM-DDTHH:mm"（datetime-local 输入框格式） */
  U.ymdhm = d => {
    d = d instanceof Date ? d : new Date(d);
    return `${U.ymd(d)}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  };

  /** 今天 00:00 */
  U.today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  /** 解析 "YYYY-MM-DD" 或 "YYYY-MM-DDTHH:mm" 为本地 Date */
  U.parse = s => {
    if (!s) return null;
    if (s instanceof Date) return s;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return new Date(s);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0, 0);
  };

  U.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  U.addMinutes = (d, n) => new Date(new Date(d).getTime() + n * 60000);

  /** 两个日期相差天数（按自然日） */
  U.diffDays = (a, b) => {
    const x = U.parse(a), y = U.parse(b);
    if (!x || !y) return NaN;
    x.setHours(0, 0, 0, 0); y.setHours(0, 0, 0, 0);
    return Math.round((y - x) / 86400000);
  };

  U.isSameDay = (a, b) => U.ymd(a) === U.ymd(b);

  /** 周一为一周之首 */
  U.startOfWeek = d => {
    const x = U.parse(d); x.setHours(0, 0, 0, 0);
    const dow = (x.getDay() + 6) % 7;
    return U.addDays(x, -dow);
  };

  const DOW = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  U.dowName = d => DOW[U.parse(d).getDay()];

  /** 人类友好日期：今天 / 明天 / 昨天 / 3月5日 周三 */
  U.friendly = s => {
    if (!s) return '';
    const d = U.parse(s);
    const n = U.diffDays(U.today(), d);
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === 2) return '后天';
    if (n === -1) return '昨天';
    if (n === -2) return '前天';
    const base = `${d.getMonth() + 1}月${d.getDate()}日`;
    return d.getFullYear() !== new Date().getFullYear()
      ? `${d.getFullYear()}年${base}` : `${base} ${DOW[d.getDay()]}`;
  };

  /** 相对截止："还有3天" / "已逾期2天" / "今天截止" */
  U.untilText = s => {
    if (!s) return '';
    const n = U.diffDays(U.today(), s);
    if (n === 0) return '今天截止';
    if (n === 1) return '明天截止';
    if (n < 0) return `已逾期${-n}天`;
    if (n <= 7) return `还有${n}天`;
    return `${n}天后`;
  };

  U.hm = s => {
    const d = U.parse(s);
    return d ? `${U.pad(d.getHours())}:${U.pad(d.getMinutes())}` : '';
  };

  /** 中文时长："7小时20分" */
  U.durText = mins => {
    mins = Math.max(0, Math.round(mins || 0));
    const h = Math.floor(mins / 60), m = mins % 60;
    if (!h) return `${m}分钟`;
    if (!m) return `${h}小时`;
    return `${h}小时${m}分`;
  };

  /* ───────── 数字 / 文本 ───────── */

  U.money = n => {
    const v = Number(n) || 0;
    return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  U.moneyShort = n => {
    const v = Math.abs(Number(n) || 0);
    if (v >= 10000) return (v / 10000).toFixed(v >= 100000 ? 0 : 1) + 'w';
    return String(Math.round(v));
  };
  U.round = (n, p = 0) => { const k = Math.pow(10, p); return Math.round((Number(n) || 0) * k) / k; };
  U.clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  U.esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /** 简单稳定 hash，用于生成 id */
  U.uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  U.hash = str => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  /* ───────── DOM ───────── */

  U.$ = sel => document.querySelector(sel);
  U.$$ = sel => Array.from(document.querySelectorAll(sel));

  /** 建元素：el('div', {class:'x', onclick:fn}, [child, 'text']) */
  U.el = (tag, attrs, children) => {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
      });
    }
    return node;
  };

  U.svg = (paths, opts = {}) => {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', opts.viewBox || '0 0 24 24');
    s.setAttribute('fill', opts.fill || 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', opts.sw || '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    (Array.isArray(paths) ? paths : [paths]).forEach(d => {
      const isCircle = typeof d === 'object';
      const p = document.createElementNS(ns, isCircle ? 'circle' : 'path');
      if (isCircle) {
        p.setAttribute('cx', d.cx); p.setAttribute('cy', d.cy); p.setAttribute('r', d.r);
      } else p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  };

  /* ───────── Toast ───────── */

  U.toast = (msg, kind = '') => {
    const wrap = U.$('#toastWrap');
    if (!wrap) return;
    const icon = kind === 'ok'
      ? U.svg('M20 6L9 17l-5-5', { sw: '2.6' })
      : kind === 'err' ? U.svg(['M12 8v5', 'M12 16.5v.01', { cx: 12, cy: 12, r: 9 }], { sw: '2' }) : null;
    const t = U.el('div', { class: 'toast ' + kind }, [icon, U.el('span', { text: msg })]);
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 220);
    }, kind === 'err' ? 3200 : 2100);
  };

  /* ───────── 剪贴板（含降级） ───────── */

  U.copy = async text => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 落到降级 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  };

  U.download = (filename, content, mime = 'text/plain;charset=utf-8') => {
    const blob = content instanceof Blob ? content : new Blob(['\ufeff' + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
  };

  U.readFile = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsText(file, 'utf-8');
  });

  /* ───────── 其它 ───────── */

  U.debounce = (fn, ms = 300) => {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  U.groupBy = (arr, keyFn) => arr.reduce((m, x) => {
    const k = keyFn(x); (m[k] = m[k] || []).push(x); return m;
  }, {});

  U.sum = (arr, fn) => arr.reduce((s, x) => s + (Number(fn ? fn(x) : x) || 0), 0);

  /** 归一化文本：全角转半角、去多余空白，用于解析匹配 */
  U.norm = s => String(s || '')
    .replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .replace(/\r\n?/g, '\n');

  global.U = U;
})(window);