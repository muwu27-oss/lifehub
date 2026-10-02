/* ═══════════════════════════════════════════════
   txnrule.test.js — 账本分类规则（对方 + 流向）
   ═══════════════════════════════════════════════
   用户要的：「导入微信帐单后我希望可以编辑每一笔明细的类别、用于干什么，
   以及标记这个流向（比如某个特定联系人）。
   例如让系统知道这个人给我转帐就是生活费，给另一个人转帐是固定的其他消费。
   下次导入微信帐单可以按这个标记来划分。」

   核心难点：同一个人可能两个方向都有（他转给我、我也转给他），
   所以规则必须带方向，否则一条规则会把两个方向都吃掉。
*/
const { load } = require('./harness');
load('js/utils.js', 'js/store.js', 'js/wechat.js');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + ' ' + extra); }
}
function fresh() { S.reset(); }

const CSV = [
  '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
  '2026-09-01 10:00:00,转账,张三,转账,收入,¥2000.00,零钱,已收钱,WX001,M001,',
  '2026-09-02 12:00:00,商户消费,食堂,午餐,支出,¥15.00,零钱,支付成功,WX002,M002,',
  '2026-09-03 18:00:00,转账,李四,转账,支出,¥500.00,零钱,支付成功,WX003,M003,',
  '2026-09-04 09:00:00,转账,张三,转账,支出,¥100.00,零钱,支付成功,WX004,M004,'
].join('\n');

console.log('=== 1. 规则带流向：同一人两个方向互不干扰 ===');
fresh();
S.learnRuleFromTxn({ type: 'income', counterparty: '张三', category: '生活费', purpose: '每月家用' });
S.learnRuleFromTxn({ type: 'expense', counterparty: '张三', category: '还钱' });
const R = () => S.all('txnRules');
ok('学出两条规则', R().length === 2, R().length + ' 条');
ok('收入规则', R().some(r => r.keyword === '张三' && r.direction === 'income' && r.category === '生活费'));
ok('支出规则', R().some(r => r.keyword === '张三' && r.direction === 'expense' && r.category === '还钱'));

const m1 = WeChat.matchRule({ type: 'income', counterparty: '张三' }, R());
const m2 = WeChat.matchRule({ type: 'expense', counterparty: '张三' }, R());
ok('收入命中生活费', m1 && m1.category === '生活费', m1 && m1.category);
ok('支出命中还钱', m2 && m2.category === '还钱', m2 && m2.category);

console.log('\n=== 2. 用途跟着规则走 ===');
ok('规则里存了用途', R().find(r => r.direction === 'income').purpose === '每月家用');

console.log('\n=== 3. 没有锁定方向的规则两个方向都吃 ===');
fresh();
S.learnRuleFromTxn({ type: 'expense', counterparty: '美团', category: '餐饮' });
const rule = R()[0];
rule.direction = 'both';
S.saveNow();
ok('支出命中', WeChat.matchRule({ type: 'expense', counterparty: '美团' }, R()).category === '餐饮');
ok('收入也命中', WeChat.matchRule({ type: 'income', counterparty: '美团' }, R()).category === '餐饮');

console.log('\n=== 4. 更具体的关键词优先 ===');
fresh();
S.add('txnRules', { id: 'a', keyword: '张三', direction: 'income', category: '生活费' });
S.add('txnRules', { id: 'b', keyword: '张三 房租', direction: 'income', category: '房租' });
ok('长关键词赢', WeChat.matchRule({ type: 'income', counterparty: '张三', note: '张三 房租' }, R()).category === '房租');
ok('短关键词兜底', WeChat.matchRule({ type: 'income', counterparty: '张三', note: '转账' }, R()).category === '生活费');

console.log('\n=== 5. 锁定方向的规则分数更高 ===');
fresh();
S.add('txnRules', { id: 'a', keyword: '张三', direction: 'both', category: '通用' });
S.add('txnRules', { id: 'b', keyword: '张三', direction: 'income', category: '专用' });
ok('锁定方向的优先', WeChat.matchRule({ type: 'income', counterparty: '张三' }, R()).category === '专用');

console.log('\n=== 6. 没关键词的规则不匹配 ===');
fresh();
S.add('txnRules', { id: 'a', keyword: '', direction: 'income', category: 'X' });
ok('空关键词返回 null', WeChat.matchRule({ type: 'income', counterparty: '张三' }, R()) === null);

console.log('\n=== 7. 重复学习同一「关键词+方向」是更新不是新增 ===');
fresh();
S.learnRuleFromTxn({ type: 'income', counterparty: '张三', category: '生活费' });
S.learnRuleFromTxn({ type: 'income', counterparty: '张三', category: '生活费' });
ok('还是一条', R().length === 1, R().length + ' 条');
S.learnRuleFromTxn({ type: 'income', counterparty: '张三', category: '补助' });
ok('改主意会更新分类', R()[0].category === '补助', R()[0].category);
ok('命中次数累加', R()[0].hits === 3, R()[0].hits);

console.log('\n=== 8. 同关键词不同方向算两条 ===');
fresh();
S.learnRuleFromTxn({ type: 'income', counterparty: '张三', category: '生活费' });
S.learnRuleFromTxn({ type: 'expense', counterparty: '张三', category: '还钱' });
ok('两条并存', R().length === 2, R().length + ' 条');

console.log('\n=== 9. 回填历史：只回填没人工改过的，且方向要对 ===');
fresh();
S.add('txns', { date: '2026-09-01', type: 'income', counterparty: '张三', amount: 2000, category: '其他' });
S.add('txns', { date: '2026-09-05', type: 'income', counterparty: '张三', amount: 1500, category: '其他' });
S.add('txns', { date: '2026-09-06', type: 'expense', counterparty: '张三', amount: 100, category: '其他' });
S.add('txns', { date: '2026-09-07', type: 'income', counterparty: '张三', amount: 50, category: '我改过', edited: true });
const n = S.applyRuleToHistory({ id: 'z', keyword: '张三', direction: 'income', category: '生活费', purpose: '家用' });
ok('回填 2 笔', n === 2, n + ' 笔');
const inc = S.all('txns').filter(t => t.type === 'income' && !t.edited);
ok('收入都被回填', inc.every(t => t.category === '生活费'));
ok('用途也回填了', inc.every(t => t.purpose === '家用'));
ok('支出没被动', S.all('txns').find(t => t.type === 'expense').category === '其他');
ok('人工改过的不被覆盖', S.all('txns').find(t => t.edited).category === '我改过');

console.log('\n=== 10. 端到端：编辑一次，下次导入自动分好 ===');
fresh();
const first = WeChat.parseCSV(CSV);
ok('第一次导入 4 笔', first.txns.length === 4, first.txns.length);
const zhang = first.txns.find(t => t.counterparty === '张三' && t.type === 'income');
zhang.category = '生活费'; zhang.purpose = '每月家用'; zhang.edited = true;
S.learnRuleFromTxn(zhang);
const li = first.txns.find(t => t.counterparty === '李四');
li.category = '人情往来'; li.edited = true;
S.learnRuleFromTxn(li);

const second = WeChat.parseCSV([
  '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
  '2026-10-01 10:00:00,转账,张三,转账,收入,¥2000.00,零钱,已收钱,WX101,M101,',
  '2026-10-02 12:00:00,商户消费,食堂,午餐,支出,¥18.00,零钱,支付成功,WX102,M102,',
  '2026-10-03 18:00:00,转账,李四,转账,支出,¥500.00,零钱,支付成功,WX103,M103,',
  '2026-10-04 09:00:00,转账,张三,转账,支出,¥100.00,零钱,支付成功,WX104,M104,'
].join('\n'));

const byCp = {};
second.txns.forEach(t => { byCp[t.counterparty + t.type] = t; });
ok('张三收入 → 生活费', byCp['张三income'].category === '生活费', byCp['张三income'].category);
ok('李四支出 → 人情往来', byCp['李四expense'].category === '人情往来', byCp['李四expense'].category);
ok('张三支出不被收入规则影响', byCp['张三expense'].category !== '生活费', byCp['张三expense'].category);
ok('命中标记写进了记录', byCp['张三income'].ruleKeyword === '张三', byCp['张三income'].ruleKeyword);
ok('食堂仍走内置分类', byCp['食堂expense'].category === '餐饮', byCp['食堂expense'].category);

console.log('\n=== 11. 用途历史（去重 + 按频次排）===');
fresh();
S.add('txns', { date: '2026-09-01', type: 'expense', counterparty: 'A', amount: 1, purpose: '房租' });
S.add('txns', { date: '2026-09-02', type: 'expense', counterparty: 'B', amount: 1, purpose: '房租' });
S.add('txns', { date: '2026-09-03', type: 'expense', counterparty: 'C', amount: 1, purpose: '买菜' });
ok('去重后 2 个', S.txnPurposes().length === 2, JSON.stringify(S.txnPurposes()));
ok('高频在前', S.txnPurposes()[0] === '房租', S.txnPurposes()[0]);
ok('空用途不进列表', !S.txnPurposes().includes(''));

console.log('\n=== 12. 分类列表含自定义 ===');
fresh();
S.add('txns', { date: '2026-09-01', type: 'expense', counterparty: 'A', amount: 1, category: '我的自定义分类' });
ok('自定义分类出现在列表', S.txnCategories().includes('我的自定义分类'));
ok('内置分类也在', S.txnCategories().includes('餐饮'));

console.log('\n=== 13. 分类列表不能是下标（回归）===');
fresh();
/* 踩过的坑：WeChat.CATEGORIES 是数组，用 Object.keys() 会拿到
   ["0","1","2",...] 下标，编辑器里的分类按钮就变成数字了。 */
ok('不是数字下标', !S.txnCategories().every(c => /^\d+$/.test(c)),
   JSON.stringify(S.txnCategories().slice(0, 5)));
ok('第一个是真实分类名', S.txnCategories()[0] === '餐饮', S.txnCategories()[0]);
ok('分类数 > 10', S.txnCategories().length > 10, S.txnCategories().length);

console.log('\n=== 14. 建议规则包含收入（原来只筛支出）===');
fresh();
S.add('txns', { date: '2026-09-01', type: 'income', counterparty: '王五', amount: 800, category: '其他' });
S.add('txns', { date: '2026-09-02', type: 'income', counterparty: '王五', amount: 800, category: '其他' });
const sg = WeChat.suggestRules(S.all('txns'));
ok('收入也进建议', sg.some(x => x.keyword === '王五'), JSON.stringify(sg.map(x => x.keyword)));
ok('建议带方向', sg.find(x => x.keyword === '王五').type === 'income');

console.log('\n══════════════');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
