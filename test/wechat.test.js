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

console.log('\n=== 规则 ===');
const rr = WeChat.applyRules({counterparty:'某小店',product:'x',note:''}, [{keyword:'某小店',category:'购物'}]);
ok('applyRules 命中', rr==='购物', rr);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail?1:0);
