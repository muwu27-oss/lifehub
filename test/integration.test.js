/* ═══════════════════════════════════════════════
   集成测试：用 jsdom 真实加载 index.html，
   逐个渲染所有视图，捕获任何运行时错误。
   ═══════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + '   ' + e)); };

/* 收集页面内的所有脚本，按顺序手动注入（jsdom 默认不执行外部脚本） */
const scripts = [];
const scriptRe = /<script src="([^"]+)"><\/script>/g;
let m;
while ((m = scriptRe.exec(html))) scripts.push(m[1]);

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  resources: undefined
});

const { window } = dom;

/* 补齐 jsdom 缺失的 API */
window.matchMedia = window.matchMedia || (q => ({
  matches: /dark/.test(q) ? false : false,
  media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
}));
window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
window.cancelAnimationFrame = id => clearTimeout(id);

/* canvas getContext 打桩：记录调用，验证图表真的被绘制 */
const drawCalls = [];
function stubCtx() {
  const rec = [];
  const base = {
    __rec: rec,
    canvas: null,
    save() {}, restore() {}, beginPath() {}, closePath() {},
    /* jsdom 里 measureText 不返回 TextMetrics，必须打桩，否则 charts 会崩 */
    measureText(t) { return { width: String(t == null ? '' : t).length * 6.5 }; }
  };
  const handler = {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => { rec.push(k); drawCalls.push(k); };
    },
    set(t, k, v) { t[k] = v; return true; }
  };
  return new Proxy(base, handler);
}
window.HTMLCanvasElement.prototype.getContext = function () { return stubCtx(); };

const errors = [];
window.addEventListener('error', e => errors.push('window.onerror: ' + (e.message || e)));
window.onunhandledrejection = e => errors.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason));

/* 注入脚本 */
const consoleErrors = [];
const origErr = console.error;
console.error = (...a) => { consoleErrors.push(a.map(String).join(' ')); };

try {
  scripts.forEach(src => {
    const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
    window.eval(code);
  });
} catch (e) {
  console.log('脚本注入失败: ' + e.message);
  console.log(e.stack);
  process.exit(1);
}
console.error = origErr;

console.log('=== 1. 脚本加载 ===');
ok('全部脚本注入无异常', true);
ok('全局对象已就绪', !!(window.U && window.S && window.Parser && window.ICS && window.AI &&
  window.Nutrition && window.WeChat && window.Charts && window.Blueprint && window.Views && window.App),
  Object.keys(window).filter(k => ['U','S','Parser','ICS','AI','Nutrition','WeChat','Charts','Blueprint','Views','App'].includes(k)).join(','));

console.log('\n=== 2. 应用启动 ===');
try {
  window.S.init();
  window.Sch && (window.S.settings.timetable = { termStart: null, weeks: 16, courses: [] });
  window.App.start();
  ok('App.start() 无异常', true);
} catch (e) {
  ok('App.start() 无异常', false, e.message + '\n' + e.stack);
}
ok('今日视图已渲染', (window.document.querySelector('#view-today').innerHTML || '').length > 100,
  '长度 ' + window.document.querySelector('#view-today').innerHTML.length);
ok('底部导航有 5 个 tab', window.document.querySelectorAll('.tab').length === 5);

/* ⚠ 关键回归：App.go() 必须给当前视图加 .active
   否则 CSS 的 .view{display:none} 会把整页藏掉 —— 真机上打开就是白屏。
   jsdom 不跑 CSS，所以只能靠这个断言守住。 */
ok('当前视图带 active 类', window.document.querySelector('#view-today').classList.contains('active'),
   window.document.querySelector('#view-today').className);
ok('只有一个视图处于 active', window.document.querySelectorAll('.view.active').length === 1,
   window.document.querySelectorAll('.view.active').length + ' 个');
window.App.go('money');
ok('切换视图后 active 跟着走',
   window.document.querySelector('#view-money').classList.contains('active') &&
   !window.document.querySelector('#view-today').classList.contains('active'));
ok('切换后仍只有一个 active', window.document.querySelectorAll('.view.active').length === 1,
   window.document.querySelectorAll('.view.active').length + ' 个');
window.App.go('today');

/* 浮层默认必须是隐藏的（.sheet 的 display:flex 会盖掉 [hidden]，CSS 里有兜底） */
ok('浮层默认 hidden', window.document.querySelector('#sheet').hasAttribute('hidden'));
ok('遮罩默认 hidden', window.document.querySelector('#scrim').hasAttribute('hidden'));
ok('S.init() 幂等（数据不会被二次重载冲掉）', (() => {
  const t = window.S.add('tasks', { title: '幂等测试', cat: 'life' });
  window.S.init();                       // 再调一次
  const still = !!window.S.find('tasks', t.id);
  window.S.remove('tasks', t.id);
  return still;
})());

console.log('\n=== 3. 逐视图渲染 ===');
const views = ['today', 'plan', 'import', 'body', 'money', 'learn'];
views.forEach(v => {
  const before = consoleErrors.length;
  try {
    window.App.go(v);
    const el = window.document.querySelector('#view-' + v);
    const len = (el.innerHTML || '').length;
    const newErrs = consoleErrors.slice(before);
    ok(`${v} 渲染成功（${len} 字符）`, len > 50 && newErrs.length === 0,
      newErrs.length ? newErrs.join(' | ') : '内容过短 ' + len);
  } catch (e) {
    ok(`${v} 渲染成功`, false, e.message);
  }
});

console.log('\n=== 4. 带数据渲染（真实场景） ===');
/* 灌入一批真实数据 */
window.S.add('tasks', { title: '多目标跟踪双球实验', cat: 'cv', start: window.U.ymd(window.U.today()) + 'T14:00', due: window.U.ymd(window.U.today()) + 'T16:00', priority: 2, location: '实验室D102' });
window.S.add('tasks', { title: '交具身智能论文综述', cat: 'cv', due: window.U.ymd(window.U.addDays(window.U.today(), 2)), priority: 3 });
window.S.add('tasks', { title: '高等数学作业', cat: 'study', due: window.U.ymd(window.U.addDays(window.U.today(), 1)), priority: 1 });
window.S.add('tasks', { title: '取快递', cat: 'life', due: window.U.ymd(window.U.addDays(window.U.today(), -1)), priority: 0 });
window.S.add('tasks', { title: '已完成的事', cat: 'life', due: window.U.ymd(window.U.today()), done: true });

window.S.add('meals', { date: window.U.ymd(window.U.today()), type: 'breakfast', time: '08:00', items: [{ name: '鸡蛋', grams: 110 }, { name: '全麦面包', grams: 70 }, { name: '牛奶', grams: 250 }] });
window.S.add('meals', { date: window.U.ymd(window.U.today()), type: 'lunch', time: '12:30', items: [{ name: '米饭', grams: 200 }, { name: '鸡胸肉', grams: 150 }, { name: '西兰花', grams: 150 }] });
window.S.add('sleep', { date: window.U.ymd(window.U.today()), bedtime: '01:30', wake: '07:00', hours: 5.5, quality: '较差' });
window.S.add('weights', { date: window.U.ymd(window.U.today()), kg: 72.5 });

const wcsv = `交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
2026-09-01 08:12:33,商户消费,肯德基,早餐,支出,¥12.00,零钱,支付成功,9001,8001,/
2026-09-02 12:00:00,商户消费,食堂,午餐,支出,¥15.00,零钱,支付成功,9002,8002,/
2026-09-03 09:00:00,商户消费,京东,树莓派,支出,¥620.00,零钱,支付成功,9003,8003,/`;
try {
  const parsed = window.WeChat.parseCSV(wcsv);
  parsed.txns.forEach(t => { t.source = 'wechat'; window.S.add('txns', t); });
  ok('微信账单入库', window.S.all('txns').length === 3, window.S.all('txns').length);
} catch (e) { ok('微信账单入库', false, e.message); }

window.S.add('reviews', { title: 'Kalman 概念', round: 1, interval: 1, nextDate: window.U.ymd(window.U.today()), retired: false, link: '11_目标跟踪' });

views.forEach(v => {
  const before = consoleErrors.length;
  try {
    window.App.go(v);
    const el = window.document.querySelector('#view-' + v);
    const len = (el.innerHTML || '').length;
    const newErrs = consoleErrors.slice(before);
    ok(`${v} 带数据渲染（${len} 字符）`, len > 100 && newErrs.length === 0,
      newErrs.length ? newErrs.join(' | ') : '内容过短 ' + len);
  } catch (e) {
    ok(`${v} 带数据渲染`, false, e.message);
  }
});

console.log('\n=== 5. 子视图切换（日历 / 趋势 / 规则等） ===');
const subTabs = [
  ['plan', () => { window.Views.planState.mode = 'calendar'; window.App.go('plan'); }],
  ['plan-list', () => { window.Views.planState.mode = 'list'; window.App.go('plan'); }],
  ['body-sleep', () => { window.Views.bodyState.tab = 'sleep'; window.App.go('body'); }],
  ['body-trend', () => { window.Views.bodyState.tab = 'trend'; window.App.go('body'); }],
  ['money-list', () => { window.Views.moneyState.tab = 'list'; window.App.go('money'); }],
  ['money-rules', () => { window.Views.moneyState.tab = 'rules'; window.App.go('money'); }],
  ['learn-modules', () => { window.Views.learnState.tab = 'modules'; window.App.go('learn'); }],
  ['learn-projects', () => { window.Views.learnState.tab = 'projects'; window.App.go('learn'); }],
  ['learn-actions', () => { window.Views.learnState.tab = 'actions'; window.App.go('learn'); }],
  ['import-manual-timetable', () => { window.Views.openManualTimetable(); window.App.closeSheet(); }]
];
subTabs.forEach(([name, fn]) => {
  const before = consoleErrors.length;
  try {
    fn();
    const newErrs = consoleErrors.slice(before);
    ok(`${name} 切换`, newErrs.length === 0, newErrs.join(' | '));
  } catch (e) { ok(`${name} 切换`, false, e.message); }
});

(async () => {
console.log('\n=== 6. 图表是否真的绘制 ===');
/* charts 用 requestAnimationFrame 延迟绘制，测试里要把队列跑完再断言 */
await new Promise(r => setTimeout(r, 120));
ok('canvas 上有绘制调用', drawCalls.length > 0, '调用 ' + drawCalls.length + ' 次');
console.log('     → 绘制调用: ' + [...new Set(drawCalls)].slice(0, 12).join(', '));

console.log('\n=== 7. 关键交互 ===');
try {
  /* 勾选任务 */
  const check = window.document.querySelector('#view-today .check');
  ok('找到任务勾选框', !!check);
  if (check) {
    const before = window.S.all('tasks').filter(t => t.done).length;
    check.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const after = window.S.all('tasks').filter(t => t.done).length;
    ok('点击可切换完成状态', after !== before, `${before} → ${after}`);
  }
  /* 打开设置浮层 */
  window.App.openSettings();
  ok('设置浮层打开', window.document.querySelector('#sheet').hidden === false);
  ok('设置里有 AI 配置项', (window.document.querySelector('#sheetBody').innerHTML || '').includes('API Key'));
  window.App.closeSheet();
  ok('设置浮层关闭', window.document.querySelector('#sheet').hidden === true);
} catch (e) { ok('关键交互', false, e.message + ' ' + e.stack); }

console.log('\n=== 8. ICS 日历导出 ===');
try {
  const gen = window.ICS.generate({ days: 30 });
  ok('生成 ICS 文本', gen.text.length > 100, gen.text.length);
  ok('ICS 有正确头尾', gen.text.startsWith('BEGIN:VCALENDAR') && gen.text.trim().endsWith('END:VCALENDAR'));
  /* 新提醒策略（见 DEVLOG）：只有两类事件
       ① 日常活动 → 每天 18:00
       ② 有截止日的 → 截止前一天 18:00
     长期任务不产生任何事件。 */
  ok('包含截止前一天提醒', gen.text.includes('明天截止'));
  ok('包含 VALARM 提醒', gen.text.includes('BEGIN:VALARM'));
  ok('事件数与预览一致', gen.count > 0, gen.count);
  ok('不再生成「今日待办检查」噪音事件', !gen.text.includes('今日待办检查'));
  /* 截止提醒必须落在 18:00 而不是早上 9:00 */
  const ddlBlocks = gen.text.split('BEGIN:VEVENT').filter(b => b.includes('明天截止'));
  if (ddlBlocks.length) {
    const dt = (ddlBlocks[0].match(/DTSTART[^:]*:(\d{8})T(\d{4})/) || []);
    ok('截止提醒在 18:00', dt[2] === '1800', dt[2]);
  }
  console.log(`     → 共 ${gen.count} 个事件，${Math.round(gen.text.length / 1024)} KB`);
} catch (e) { ok('ICS 导出', false, e.message + ' ' + e.stack); }

console.log('\n=== 9. 营养计算 ===');
try {
  const meals = window.S.mealsOn(window.U.ymd(window.U.today()));
  const tot = window.Nutrition.dayTotals(meals);
  console.log(`     → 今日 ${tot.kcal} kcal / 蛋白 ${tot.p}g / 脂肪 ${tot.f}g / 碳水 ${tot.c}g`);
  ok('热量计算合理（400~1200）', tot.kcal > 400 && tot.kcal < 1200, tot.kcal);
  ok('蛋白质计算合理', tot.p > 30 && tot.p < 80, tot.p);
  const assess = window.Nutrition.assess(tot, window.S.sleepOn(window.U.ymd(window.U.today())), window.S.settings.body, 7.5);
  ok('健康评估生成', !!assess.level, assess.level);
  ok('指出睡眠不足问题', assess.issues.some(i => i.includes('睡眠')), JSON.stringify(assess.issues));
} catch (e) { ok('营养计算', false, e.message + ' ' + e.stack); }

console.log('\n=== 10. 导入解析端到端 ===');
try {
  const msg = '下周三下午2点 高等数学期末补考 在 A301 教室\n3月20日前提交计算机视觉课程大作业，用YOLO做目标检测\n今天 晚上 8:00 跑步 5 公里';
  const p = window.Parser.parse(msg);
  ok('解析出 3 条', p.tasks.length === 3, p.tasks.length);
  p.tasks.forEach(t => console.log(`     → [${t.cat}] ${t.title} @ ${t.due || t.start || '无日期'}`));
  const courses = window.Parser.parseSchedule('周一 第1-2节 高等数学 A101 1-16周');
  const expanded = window.Parser.expandSchedule(courses.tasks, { termStart: window.U.ymd(window.U.startOfWeek(window.U.today())), weeks: 16 });
  ok('课表展开出日程', expanded.length > 0, expanded.length);
} catch (e) { ok('导入解析', false, e.message + ' ' + e.stack); }

console.log('\n=== 11. 智能排期（导入页核心能力） ===');
try {
  /* 造课表：周一 8:00-9:40 有课 */
  const monday = window.U.ymd(window.U.startOfWeek(window.U.today()));
  window.S.settings.timetable = {
    termStart: monday, weeks: 16, source: 'test',
    courses: [{ name: '高等数学', weekday: 1, start: { h: 8, m: 0 }, end: { h: 9, m: 40 }, weeks: [] }]
  };
  ok('课表已导入', window.Sch.hasTimetable());
  ok('周一识别出有课', window.Sch.busyOn(monday).length === 1);

  const slots = window.Sch.freeSlots(monday, 90);
  ok('空档避开上课时段', !slots.some(s => s.from < 9 * 60 + 40 && s.to > 8 * 60),
     JSON.stringify(slots.map(s => [s.from, s.to])));

  /* 只有截止时间 */
  const t1 = window.S.add('tasks', { title: '交大作业', cat: 'cv', due: window.U.ymd(window.U.addDays(window.U.today(), 5)) });
  const s1 = window.Sch.suggest(t1);
  ok('仅截止 → 推荐提前完成', s1 && s1.date < t1.due, s1 && s1.date);
  ok('推荐不撞课', s1 && !window.Sch.busyOn(s1.date).some(b => b.to > s1.from && b.from < s1.to));

  /* 只有安排时间 */
  const t2 = window.S.add('tasks', { title: '取快递', cat: 'life', kind: 'deadline', start: window.U.ymd(window.U.addDays(window.U.today(), 1)) + 'T10:00', due: window.U.ymd(window.U.addDays(window.U.today(), 1)) + 'T10:00' });
  const s2 = window.Sch.suggest(t2);
  ok('仅安排 → 直接采用', s2 && s2.fromText === '10:00' && s2.confidence === 'exact', s2 && s2.fromText);

  /* 撞课检测 */
  const t3 = window.S.add('tasks', { title: '去实验室', cat: 'cv', kind: 'deadline', start: monday + 'T08:30', due: monday + 'T08:30' });
  const s3 = window.Sch.suggest(t3);
  ok('安排撞课 → 检测冲突', s3 && s3.confidence === 'conflict', s3 && s3.confidence);

  /* 无任何时间 → 现在是「长期任务」，不排期 */
  const t4 = window.S.add('tasks', { title: '复习线代', cat: 'study' });
  ok('无时间 → 不排期', window.Sch.suggest(t4) === null);
  ok('无时间 → 进长期栏', window.S.longTerm().some(x => x.id === t4.id));

  /* 批量不重叠 */
  const batch = [
    window.S.add('tasks', { title: '批量A', cat: 'study', due: window.U.ymd(window.U.addDays(window.U.today(), 3)) }),
    window.S.add('tasks', { title: '批量B', cat: 'cv', due: window.U.ymd(window.U.addDays(window.U.today(), 3)) }),
    window.S.add('tasks', { title: '批量C', cat: 'cv', due: window.U.ymd(window.U.addDays(window.U.today(), 4)) })
  ];
  const planned = window.Sch.plan(batch);
  const ws = planned.filter(p => p.slot);
  ok('批量全部排上', ws.length === batch.length, ws.length + '/' + batch.length);
  let ov = 0;
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    const a = ws[i].slot, b = ws[j].slot;
    if (a.date === b.date && a.to > b.from && a.from < b.to) ov++;
  }
  ok('批量排期互不重叠', ov === 0, ov + ' 处重叠');
  ok('批量排期都不撞课', ws.every(p => !window.Sch.busyOn(p.slot.date).some(b => b.to > p.slot.from && b.from < p.slot.to)));

  /* 父子任务 */
  const parent = window.S.add('tasks', { title: '高数复习', cat: 'study' });
  const k1 = window.S.add('tasks', { title: '子1', cat: 'study', parentId: parent.id });
  const k2 = window.S.add('tasks', { title: '子2', cat: 'study', parentId: parent.id });
  window.S.toggleDone(k1.id, true);
  ok('子任务进度 1/2', window.S.progress(parent.id).pct === 50, window.S.progress(parent.id).pct);
  window.S.toggleDone(k2.id, true);
  ok('子任务全完成 → 父任务自动完成', window.S.find('tasks', parent.id).done === true);
  window.S.toggleDone(k1.id, false);
  ok('取消子任务 → 父任务回退', window.S.find('tasks', parent.id).done === false);
  window.S.remove('tasks', parent.id);
  ok('删父任务级联删除子任务', !window.S.find('tasks', k1.id) && !window.S.find('tasks', k2.id));

  /* 重置课表，避免影响后续 */
  window.S.settings.timetable = { termStart: null, weeks: 16, courses: [] };
} catch (e) { ok('智能排期', false, e.message + '\n' + e.stack); }

console.log('\n=== 12. 运行时错误汇总 ===');
if (errors.length) {
  errors.slice(0, 10).forEach(e => console.log('  ⚠ ' + e));
}
ok('无未捕获运行时错误', errors.length === 0, errors.length + ' 个');
ok('无 console.error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n═══════════════════════════════════`);
console.log(`结果: ${pass} 通过, ${fail} 失败`);
console.log(`═══════════════════════════════════`);
process.exit(fail ? 1 : 0);
})();
