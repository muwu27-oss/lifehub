const { load } = require('./harness');
load('js/utils.js','js/store.js','js/wechat.js');
S.init();
let pass=0,fail=0;
const ok=(n,c,e='')=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+' '+e));};

const csv = `微信支付账单明细
微信昵称：[测试用户]
起始时间：[2026-09-01 00:00:00] 终止时间：[2026-09-30 23:59:59]
导出类型：[全部]
----------------------微信支付账单明细列表--------------------
交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
2026-09-01 08:12:33,商户消费,肯德基,早餐,支出,¥12.00,零钱,支付成功,4200001001,20001,/
2026-09-01 12:30:00,转账,李四,/,收入,¥200.00,零钱,已存入零钱,4200001002,20002,还款
2026-09-02 19:00:00,商户消费,美团外卖,晚餐,支出,¥28.50,中国银行(1234),支付成功,4200001003,20003,/
2026-09-03 09:00:00,商户消费,京东,树莓派5开发板,支出,¥620.00,零钱,支付成功,4200001004,20004,/
2026-09-04 10:00:00,商户消费,当当网,计算机视觉教材,支出,¥56.00,零钱,支付成功,4200001005,20005,/
2026-09-05 08:00:00,商户消费,北京地铁,乘车码,支出,¥5.00,零钱,支付成功,4200001006,20006,/
2026-09-06 20:00:00,商户消费,万达影城,电影票,支出,¥45.00,零钱,支付成功,4200001007,20007,/
2026-09-07 14:00:00,商户消费,校医院,挂号,支出,¥10.00,零钱,支付成功,4200001008,20008,/
2026-09-08 11:00:00,商户消费,房东,房租,支出,¥1500.00,中国银行(1234),支付成功,4200001009,20009,/
2026-09-09 16:00:00,商户消费,中国移动,话费充值,支出,¥50.00,零钱,支付成功,4200001010,20010,/
2026-09-10 18:00:00,商户消费,沃尔玛,洗发水牙膏,支出,¥38.00,零钱,支付成功,4200001011,20011,/
2026-09-11 19:00:00,商户消费,健身房,月卡,支出,¥199.00,零钱,支付成功,4200001012,20012,/
2026-09-12 12:00:00,商户消费,食堂,午餐,支出,¥15.00,零钱,支付成功,4200001013,20013,/
2026-09-13 21:00:00,商户消费,腾讯视频,会员,支出,¥25.00,零钱,支付成功,4200001014,20014,/
`;

const r = WeChat.parseCSV(csv);
console.log('=== 解析结果 ===');
console.log('meta:', JSON.stringify(r.meta));
console.log('warnings:', JSON.stringify(r.warnings));
r.txns.forEach(t=>console.log(`  ${t.date} ${t.time} [${t.type}] ${t.counterparty} | ${t.product} | ¥${t.amount} | ${t.category} | ${t.method}`));

console.log('\n=== 断言 ===');
ok('解析出 14 笔', r.txns.length===14, r.txns.length);
ok('meta 昵称', r.meta.nickname && r.meta.nickname.includes('测试用户'), JSON.stringify(r.meta.nickname));
ok('meta 起止时间', !!r.meta.startTime && !!r.meta.endTime, JSON.stringify([r.meta.startTime, r.meta.endTime]));

const cnt = s => r.txns.find(t=>t.counterparty.includes(s));
ok('肯德基→餐饮', cnt('肯德基')?.category==='餐饮', cnt('肯德基')?.category);
ok('美团→餐饮', cnt('美团')?.category==='餐饮', cnt('美团')?.category);
ok('京东树莓派→数码', cnt('京东')?.category==='数码', cnt('京东')?.category);
ok('当当教材→学习', cnt('当当')?.category==='学习', cnt('当当')?.category);
ok('地铁→交通', cnt('地铁')?.category==='交通', cnt('地铁')?.category);
ok('影城→娱乐', cnt('影城')?.category==='娱乐', cnt('影城')?.category);
ok('医院→医疗', cnt('医院')?.category==='医疗', cnt('医院')?.category);
ok('房租=1500 未被截断', cnt('房东')?.amount===1500, cnt('房东')?.amount);
ok('话费→通讯', cnt('移动')?.category==='通讯', cnt('移动')?.category);
ok('沃尔玛→日用', cnt('沃尔玛')?.category==='日用', cnt('沃尔玛')?.category);
ok('健身房→运动', cnt('健身房')?.category==='运动', cnt('健身房')?.category);
ok('转账是收入', cnt('李四')?.type==='income', cnt('李四')?.type);

const s = WeChat.summary(r.txns);
console.log('\n=== 汇总 ===');
console.log('支出:', s.expense, '收入:', s.income, '结余:', s.net);
console.log('分类:', s.byCategory.map(c=>`${c.category}:${c.amount}(${c.count})`).join(' '));
ok('支出合计 2603.5', Math.abs(s.expense-(12+28.5+620+56+5+45+10+1500+50+38+199+15+25))<0.01, s.expense);
ok('byCategory 非空', s.byCategory.length>0);

console.log('\n=== 去重 ===');
const d = WeChat.dedupe(r.txns, r.txns);
ok('自我去重 fresh=0', d.fresh.length===0, d.fresh.length);
ok('自我去重 dupes=14', d.dupes.length===14, d.dupes.length);

console.log('\n=== 容错 ===');
[['空字符串',''],['null',null],['垃圾文本','hello world 这不是账单']].forEach(([n,v])=>{
  try { const rr = WeChat.parseCSV(v); ok(`${n} 不抛异常`, true, ''); }
  catch(e){ ok(`${n} 不抛异常`, false, e.message); }
});

console.log('\n=== 分类改名：人情 → 借还钱（用户要求，免得 AI 误会）===');
/* 转账/还款是「过手」的钱，不是消费。原来归到「人情」，
   AI 读账本时会理解成「人情往来（送礼）」—— 这是实打实的误判。 */
const cat = t => WeChat.categorize(t);
[['李四','转账','还款'],['家里','转账','生活费'],['王五','红包',''],['张三','垫付','']]
  .forEach(([cp,prod,note]) => {
    const c = cat({counterparty:cp, product:prod, note:note});
    ok(`「${prod||note}」判成借还钱（原人情）`, c === '借还钱', c);
  });
/* 红包默认算还钱（用户说真人情红包他手动改） */
ok('红包默认算借还钱，不是人情往来',
   cat({counterparty:'王五', product:'红包'}) === '借还钱',
   cat({counterparty:'王五', product:'红包'}));
/* 真送礼的词还认得出，省得他每次手点 */
[['某店','礼物'],['某店','礼金'],['某店','中秋礼盒']].forEach(([cp,prod]) => {
  const c = cat({counterparty:cp, product:prod});
  ok(`「${prod}」判成人情往来`, c === '人情往来', c);
});
ok('分类表里有借还钱', WeChat.CATEGORIES.indexOf('借还钱') >= 0);
ok('分类表里有人情往来（留给他手动改的备选）', WeChat.CATEGORIES.indexOf('人情往来') >= 0);
ok('分类表里不再有「人情」', WeChat.CATEGORIES.indexOf('人情') < 0,
   '还有人情，AI 会继续误会');

console.log('\n=== 老数据里的「人情」要一起改掉 ===');
/* 光改词表不够：他之前记下的账和学到的规则里还写着「人情」 */
S.db.txns.length = 0; S.db.txnRules.length = 0;
S.add('txns', {date:'2026-09-01', type:'expense', amount:200, category:'人情', counterparty:'李四'});
S.add('txns', {date:'2026-09-02', type:'expense', amount:30, category:'餐饮', counterparty:'食堂'});
S.add('txnRules', {keyword:'李四', category:'人情'});
S.db.settings.money.catRename = undefined;      // 让闸门重新打开
localStorage.setItem('lifehub.v1', JSON.stringify(S.db));
S.init(true);
const byCp = {}; S.db.txns.forEach(t => { byCp[t.counterparty] = t; });
ok('旧账「人情」→ 借还钱', byCp['李四'] && byCp['李四'].category === '借还钱',
   byCp['李四'] && byCp['李四'].category);
ok('旧规则「人情」→ 借还钱', S.db.txnRules[0].category === '借还钱', S.db.txnRules[0].category);
ok('别的分类没被误伤', byCp['食堂'].category === '餐饮', byCp['食堂'].category);
ok('下拉框里不会再冒出「人情」', S.txnCategories().indexOf('人情') < 0, S.txnCategories().join('/'));
/* 闸门：只跑一次。他哪天手动改回「人情」，不该下次启动又被改掉 */
byCp['李四'].category = '人情';
localStorage.setItem('lifehub.v1', JSON.stringify(S.db));
S.init(true);
const byCp2 = {}; S.db.txns.forEach(t => { byCp2[t.counterparty] = t; });
ok('改动只做一次，不会反复覆盖他的手动修改', byCp2['李四'].category === '人情', byCp2['李四'].category);
byCp2['李四'].category = '借还钱';

console.log('\n=== 规则 ===');
const rr = WeChat.applyRules({counterparty:'某小店',product:'x',note:''}, [{keyword:'某小店',category:'购物'}]);
ok('applyRules 命中', rr==='购物', rr);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail?1:0);
