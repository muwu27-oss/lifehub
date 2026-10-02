#!/usr/bin/env node
/**
 * 账单「截图识别」+「复制文字解析」
 *
 * 背景：用户说「账本获取信息的方式太麻烦了」。导 CSV 要走
 *   钱包→账单→常见问题→下载账单→选月份→填邮箱→解压→粘贴，
 * 七八步。所以补两条短路：
 *   ① 账单页截图 → AI 读（AI.readBillPhoto）
 *   ② 账单页长按复制 → 本地解析（WeChat.parseBillText），不花 token
 *
 * 这两条都汇到 W.finalizeTxn，保证跟 CSV 导入同一套分类/规则口径。
 */
const { load } = require('./harness');
load('js/utils.js', 'js/store.js', 'js/wechat.js', 'js/ai.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const eq = (n, got, want) => ok(n, got === want, `得到 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`);

/* ── 假 AI ── */
let reply = '', lastOpts = {}, lastMessages = null;
AI.chat = async (m, o) => { lastOpts = o || {}; lastMessages = m; return reply; };
AI.isReady = () => true;
AI.visionModel = () => 'qwen-vl-max';
AI.log = () => {};

(async () => {

/* ═══════════════════════════════════
   一、复制文字解析（本地，不花 token）
   ═══════════════════════════════════ */
console.log('\n═══ 账单页复制的文字 ═══');
S.init(); S.reset();

const billText = `2026年10月1日 10:00
转账-来自张三
+2000.00
已收钱

10月2日 12:30
美团外卖
-32.00
支付成功

10月3日 18:05
食堂
-15.00
支付成功`;

const r = WeChat.parseBillText(billText);
eq('解析出 3 笔', r.txns.length, 3);
eq('第一笔日期', r.txns[0].date, '2026-10-01');
eq('第一笔时间', r.txns[0].time, '10:00');
eq('第一笔是收入', r.txns[0].type, 'income');
eq('第一笔金额 2000', r.txns[0].amount, 2000);
eq('对方去掉「来自」', r.txns[0].counterparty, '张三');
eq('第二笔日期', r.txns[1].date, '2026-10-02');
eq('第二笔是支出', r.txns[1].type, 'expense');
eq('第二笔金额 32', r.txns[1].amount, 32);
eq('第二笔对方', r.txns[1].counterparty, '美团外卖');
eq('第二笔自动分类到餐饮', r.txns[1].category, '餐饮');
eq('第三笔分类到餐饮', r.txns[2].category, '餐饮');

console.log('\n═══ 日期不能把金额当日期（踩过的坑）═══');
S.reset();
/* -32.00 曾经被解析成「32月00日」；+2000.00 变成「00月00日」 */
eq('-32.00 不产生 32 月', WeChat.parseBillText('-32.00\n支付成功').txns.length, 0);
const dtest = WeChat.parseBillText(`10月5日
-88.80
支付成功`);
eq('小数金额不污染日期', dtest.txns[0].date.slice(5), '10-05');
ok('日期里没有 88', !/88/.test(dtest.txns[0].date), dtest.txns[0].date);

console.log('\n═══ 各种时间格式 ═══');
S.reset();
[
  ['2026-10-01 08:12:33', '2026-10-01'],
  ['2026/10/1 08:12', '2026-10-01'],
  ['10月2日 12:30', '10-02'],
  ['10/3 09:00', '10-03'],
  ['今天 14:00', U.ymd(U.today())],
  ['昨天 20:00', U.ymd(U.addDays(U.today(), -1))]
].forEach(([line, want]) => {
  const out = WeChat.parseBillText(line + '\n-10.00\n支付成功');
  const got = out.txns.length ? out.txns[0].date : '(无)';
  ok('识别「' + line + '」', want.startsWith('2026') && want.length === 10 ? got === want : got.endsWith(want),
     got);
});

console.log('\n═══ 方向判定 ═══');
S.reset();
const dirs = [
  ['+50.00\n已收钱', 'income'],
  ['-50.00\n支付成功', 'expense'],
  ['收入 50.00\n已到账', 'income'],
  ['支出 50.00\n交易成功', 'expense'],
  ['¥50.00\n已收钱', 'income']
];
dirs.forEach(([body, want]) => {
  const out = WeChat.parseBillText('10月1日\n' + body);
  const got = out.txns.length ? out.txns[0].type : '(无)';
  ok('方向 ' + JSON.stringify(body.split('\n')[1]) + ' → ' + want, got === want, got);
});

console.log('\n═══ 装饰性内容要跳过 ═══');
S.reset();
const noisy = `账单
全部
筛选
2026年10月
10月2日 12:30
美团外卖
-32.00
支付成功
查看更多
统计`;
const nr = WeChat.parseBillText(noisy);
eq('只解析出真实记录', nr.txns.length, 1);
eq('金额正确', nr.txns[0].amount, 32);

console.log('\n═══ 一行里同时有日期和金额（截图 OCR 常见）═══');
S.reset();
const oneLine = WeChat.parseBillText('2026-10-02 12:30 美团外卖 -32.00 支付成功');
eq('单行也能解析', oneLine.txns.length, 1);
eq('日期正确', oneLine.txns[0].date, '2026-10-02');
eq('金额正确', oneLine.txns[0].amount, 32);
eq('方向正确', oneLine.txns[0].type, 'expense');

console.log('\n═══ 借支方向不明的要提示，不能瞎猜 ═══');
S.reset();
const vague = WeChat.parseBillText('10月5日\n50.00');
ok('方向不明时不入库', vague.txns.length === 0, JSON.stringify(vague.txns));
ok('给出可读提示', /没认出是收入还是支出/.test(vague.warnings.join(' ')), vague.warnings.join(' '));

console.log('\n═══ 取消/退款/中性记录 ═══');
S.reset();
/* 真实微信账单里退款是带 + 的 */
const cancel = WeChat.parseBillText('10月5日\n+30.00\n已全额退款');
eq('带 + 的退款算收入', cancel.txns[0].type, 'income');
/* 支付宝有时不带符号，这时靠「已退款」判定 */
S.reset();
const cancel2 = WeChat.parseBillText('10月5日\n30.00\n已全额退款');
eq('无符号时靠状态词判定为收入', cancel2.txns[0].type, 'income');

console.log('\n═══ 空内容 / 垃圾内容 ═══');
S.reset();
eq('空字符串', WeChat.parseBillText('').txns.length, 0);
eq('null', WeChat.parseBillText(null).txns.length, 0);
const junk = WeChat.parseBillText('随便写点什么\n没有金额也没有日期');
eq('垃圾内容零记录', junk.txns.length, 0);
ok('给出可读提示', junk.warnings.length > 0, JSON.stringify(junk.warnings));

console.log('\n═══ 复制文字解析要套用户规则 ═══');
S.init(); S.reset();
S.add('txnRules', { keyword: '张三', direction: 'income', category: '生活费', purpose: '每月家用', hits: 0 });
const ruled = WeChat.parseBillText(`10月1日 10:00
转账-来自张三
+2000.00
已收钱`);
eq('收入张三 → 生活费', ruled.txns[0].category, '生活费');
eq('标记命中规则', ruled.txns[0].ruleKeyword, '张三');
ok('生成稳定 id', typeof ruled.txns[0].id === 'string' && ruled.txns[0].id.startsWith('wx_'), String(ruled.txns[0].id));

/* ═══════════════════════════════════
   二、AI 截图识别
   ═══════════════════════════════════ */
console.log('\n═══ 截图识别 ═══');
S.init(); S.reset();
reply = JSON.stringify({
  txns: [
    { date: '2026-10-02', time: '12:30', type: 'expense', amount: 32.00, counterparty: '美团外卖', product: '午餐', category: '餐饮', status: '支付成功' },
    { date: '2026-10-01', time: '10:00', type: 'income', amount: 2000, counterparty: '张三', product: '转账', category: '生活费', status: '已收钱' },
    { date: '2026-10-03', time: '18:05', type: 'expense', amount: 15, counterparty: '食堂', category: '餐饮' }
  ],
  note: '只认出 3 条'
});
const photo = await AI.readBillPhoto('data:image/jpeg;base64,AAAA');
eq('识别出 3 笔', photo.txns.length, 3);
eq('第一笔日期', photo.txns[0].date, '2026-10-02');
eq('第一笔金额', photo.txns[0].amount, 32);
eq('第一笔对方', photo.txns[0].counterparty, '美团外卖');
eq('整体说明带出', photo.note, '只认出 3 条');
ok('用视觉模型', lastOpts.model === 'qwen-vl-max', String(lastOpts.model));
const parts = lastMessages[1].content || [];
ok('以 image_url 结构发图', parts.some(c => c.type === 'image_url' && /^data:image\//.test(c.image_url.url)));
ok('prompt 要求只抽看得见的', /看不清的不要猜/.test(parts[0].text));

console.log('\n═══ 截图识别的脏数据要兜住 ═══');
S.reset();
reply = JSON.stringify({ txns: [
  { date: '', amount: 50 },                          // 没日期 → 丢
  { date: '2026-10-04', amount: 0 },                 // 金额 0 → 丢
  { date: '2026-10-05', amount: '¥12.50', type: 'expense', counterparty: 'x' },  // 带货币符号 → 要能洗
  { date: '2026-10-06', amount: 8, category: '瞎写的分类' },  // 非法分类 → 归其他
  null
]});
const dirty = await AI.readBillPhoto('data:image/jpeg;base64,AAAA');
eq('留下 2 笔合法记录', dirty.txns.length, 2);
eq('跳过 3 条脏数据', dirty.skipped, 3);
eq('货币符号被洗掉', dirty.txns[0].amount, 12.5);
eq('非法分类归其他', dirty.txns[1].category, '其他');

console.log('\n═══ 截图识别没有 type 时按状态词猜 ═══');
S.reset();
reply = JSON.stringify({ txns: [
  { date: '2026-10-01', amount: 100, status: '已收钱' },
  { date: '2026-10-02', amount: 100, status: '支付成功' }
]});
const guessed = await AI.readBillPhoto('data:image/jpeg;base64,AAAA');
eq('已收钱 → 收入', guessed.txns[0].type, 'income');
eq('支付成功 → 支出', guessed.txns[1].type, 'expense');

console.log('\n═══ 截图识别的错误路径 ═══');
S.reset();
let err = null;
try { await AI.readBillPhoto('不是图片'); } catch (e) { err = e.message; }
ok('非法图片格式被拒', /格式不对/.test(err || ''), String(err));

S.reset();
reply = JSON.stringify({ txns: [] });
err = null;
try { await AI.readBillPhoto('data:image/jpeg;base64,AAAA'); } catch (e) { err = e.message; }
ok('没认出记录给可读提示', /没从截图里认出/.test(err || ''), String(err));

console.log('\n═══ 截图结果要能套上用户规则 ═══');
S.init(); S.reset();
S.add('txnRules', { keyword: '张三', direction: 'income', category: '生活费', purpose: '每月家用', hits: 0 });
reply = JSON.stringify({ txns: [
  { date: '2026-10-01', amount: 2000, type: 'income', counterparty: '张三', category: '其他' }
]});
const fr = await AI.readBillPhoto('data:image/jpeg;base64,AAAA');
eq('AI 说「其他」，规则改成「生活费」',
   WeChat.finalizeTxn(fr.txns[0]).category, '生活费');

/* ═══════════════════════════════════
   三、两条路要和 CSV 走同一套逻辑
   ═══════════════════════════════════ */
console.log('\n═══ finalizeTxn 是共用的（保证口径一致）═══');
S.init(); S.reset();
const same = [{ date: '2026-10-01', time: '10:00', amount: 2000, type: 'income', counterparty: '张三', category: '其他' }];
const a1 = WeChat.finalizeTxn(JSON.parse(JSON.stringify(same[0])));
const a2 = WeChat.finalizeTxn(JSON.parse(JSON.stringify(same[0])));
eq('同样输入 → 同样 id', a1.id, a2.id);
ok('幂等：再 finalize 一次不改分类', WeChat.finalizeTxn(a1).category === a1.category);

console.log('\n═══ 去重：截图重复导入不会重复记账 ═══');
S.init(); S.reset();
reply = JSON.stringify({ txns: [
  { date: '2026-10-02', time: '12:30', amount: 32, type: 'expense', counterparty: '美团外卖' }
]});
const first = await AI.readBillPhoto('data:image/jpeg;base64,AAAA');
const batch1 = first.txns.map(t => WeChat.finalizeTxn(t));
S.bulkAdd('txns', batch1);
const second = await AI.readBillPhoto('data:image/jpeg;base64,AAAA');
const batch2 = second.txns.map(t => WeChat.finalizeTxn(t));
const dd = WeChat.dedupe(S.all('txns'), batch2);
eq('第二次导入全部判为重复', dd.fresh.length, 0);
eq('重复计数正确', dd.dupes.length, 1);


/* ═══════════════════════════════════
   五、导入留痕（每次导入记下时间与覆盖到的日期）

   为什么要有：截图导入是一屏一屏导的，过几天再截很容易忘记
   上次截到哪儿，要么漏一段、要么重复截。所以要留下痕迹。
   ═══════════════════════════════════ */
console.log('\n═══ 导入留痕 ═══');
S.init(); S.reset();

eq('初始没有留痕', S.importLogs().length, 0);
eq('初始 lastImport 为空', S.lastImport(), null);

const rec = S.recordImport({ via: '截图识别', images: 3, txns: [
  { date: '2026-09-29', type: 'expense', amount: 32 },
  { date: '2026-09-30', type: 'income', amount: 200 },
  { date: '2026-09-28', type: 'expense', amount: 18.5 }
]});
eq('留痕计入集合', S.importLogs().length, 1);
eq('笔数正确', rec.count, 3);
eq('图片张数正确', rec.images, 3);
eq('最早日期取自这批流水', rec.from, '2026-09-28');
eq('最晚日期取自这批流水', rec.to, '2026-09-30');
eq('支出合计', rec.expense, 50.5);
eq('收入合计', rec.income, 200);
ok('留痕带 ISO 时间戳', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rec.at), rec.at);
ok('meta.lastImport 同步更新', S.lastImport().at === rec.at);

/* 传入顺序不影响 from/to（内部排过序） */
const rec2 = S.recordImport({ via: 'CSV', txns: [
  { date: '2026-09-05', type: 'expense', amount: 10 },
  { date: '2026-09-01', type: 'expense', amount: 20 }
]});
eq('乱序输入也能取到最早', rec2.from, '2026-09-01');
eq('乱序输入也能取到最晚', rec2.to, '2026-09-05');
eq('没传 images 时为 0', rec2.images, 0);

/* 新的在前 */
const logs = S.importLogs();
eq('importLogs 新的在前', logs[0].via, 'CSV');
eq('importLogs 第二条是旧的', logs[1].via, '截图识别');
eq('lastImport 就是最后写入的那条', S.lastImport().via, 'CSV');
eq('importLogs(1) 只取一条', S.importLogs(1).length, 1);

/* 空批次不该炸：没有流水时 from/to 是 null，而不是 'undefined' */
const rec3 = S.recordImport({ via: '空', txns: [] });
eq('空批次笔数为 0', rec3.count, 0);
eq('空批次 from 为 null', rec3.from, null);
eq('空批次 to 为 null', rec3.to, null);
eq('空批次金额为 0', rec3.expense, 0);

/* 上限：只留最近 50 条，避免一年后越滚越大 */
for (let i = 0; i < 60; i++) {
  S.recordImport({ via: '批量' + i, txns: [{ date: '2026-01-01', type: 'expense', amount: 1 }] });
}
ok('留痕条数被压到 50 以内', S.importLogs().length <= 50, '实际 ' + S.importLogs().length);
eq('留下的是最新的那条', S.lastImport().via, '批量59');

/* 重置后清空 */
S.reset();
eq('reset 后留痕清空', S.importLogs().length, 0);

console.log('\n══════════════');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);

})();