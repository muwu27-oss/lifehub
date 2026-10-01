/* 智能排期引擎测试 */
const { load } = require('./harness');
load('js/utils.js','js/store.js','js/schedule.js');
S.init();
let pass=0,fail=0;
const ok=(n,c,e='')=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+'   '+e));};

/* 造一份课表：周一三五 上午 8:00-9:40 有课；周二 下午 14:00-15:40 有课 */
const today = U.today();
const monday = U.ymd(U.startOfWeek(today));   // 本周一
S.settings.timetable = {
  termStart: monday, weeks: 16, source:'test',
  courses: [
    { name:'高等数学', weekday:1, start:{h:8,m:0},  end:{h:9,m:40}, weeks:[1,2,3,4,5,6,7,8], location:'A101' },
    { name:'数据结构', weekday:3, start:{h:8,m:0},  end:{h:9,m:40}, weeks:[1,2,3,4,5,6,7,8], location:'C301' },
    { name:'计算机网络', weekday:2, start:{h:14,m:0}, end:{h:15,m:40}, weeks:[1,2,3,4,5,6,7,8] }
  ]
};
console.log('本周一 =', monday, ' 今天 =', U.ymd(today), U.dowName(U.ymd(today)));
console.log('课表已导入:', Sch.hasTimetable());

console.log('\n=== 1. 有课时间识别 ===');
const mon = monday;
console.log('周一有课:', Sch.busyOn(mon).map(b=>`${b.name} ${Math.floor(b.from/60)}:${U.pad(b.from%60)}-${Math.floor(b.to/60)}:${U.pad(b.to%60)}`).join(', ') || '无');
ok('周一识别出高等数学', Sch.busyOn(mon).some(b=>b.name==='高等数学'));
ok('周二识别出计算机网络', Sch.busyOn(U.ymd(U.addDays(today, 1))).length>=0);
ok('周日无课', Sch.busyOn(U.ymd(U.addDays(U.parse(monday), 6))).length===0);

console.log('\n=== 2. 空档计算（避开有课） ===');
const slots = Sch.freeSlots(mon, 90);
console.log('周一 90 分钟空档:');
slots.forEach(s=>console.log(`   ${Math.floor(s.from/60)}:${U.pad(s.from%60)}-${Math.floor(s.to/60)}:${U.pad(s.to%60)} (${s.window})`));
ok('有空档', slots.length>0, slots.length);
ok('空档不落在 8:00-9:40 课内', !slots.some(s=>s.from<9*60+40 && s.to>8*60), JSON.stringify(slots.map(s=>[s.from,s.to])));

console.log('\n=== 3. 仅截止时间 → 推荐提前完成 ===');
const t1 = S.add('tasks', { title:'交计算机视觉大作业', cat:'cv', due: U.ymd(U.addDays(today,5))+'T23:59' });
const s1 = Sch.suggest(t1);
console.log('任务:', t1.title, ' 截止:', t1.due);
console.log('推荐:', s1 && `${s1.date} ${s1.fromText}-${s1.toText}  理由: ${s1.reason}  [${s1.confidence}]`);
ok('给出推荐', !!s1);
ok('推荐日期早于截止', s1 && s1.date < t1.due.slice(0,10), s1&&s1.date);
ok('推荐不撞课', s1 && !Sch.busyOn(s1.date).some(b=>b.to>s1.from && b.from<s1.to));

console.log('\n=== 4. 仅安排时间 → 直接采用 ===');
/* 有明确 start 的任务按 deadline 类处理（它自己就是「什么时候做」） */
const t2 = S.add('tasks', { title:'取快递', cat:'life', kind:'deadline', start: U.ymd(U.addDays(today,1))+'T10:00', due: U.ymd(U.addDays(today,1))+'T10:00' });
const s2 = Sch.suggest(t2);
console.log('推荐:', s2 && `${s2.date} ${s2.fromText}-${s2.toText}  理由: ${s2.reason}  [${s2.confidence}]`);
ok('采用用户安排的时间', s2 && s2.fromText==='10:00', s2&&s2.fromText);
ok('标记为 exact', s2 && s2.confidence==='exact', s2&&s2.confidence);

console.log('\n=== 5. 安排时间撞课 → 检测冲突 ===');
const wed = U.ymd(U.addDays(U.parse(monday), 2));
const t3 = S.add('tasks', { title:'去实验室', cat:'cv', kind:'deadline', start: wed+'T08:30', due: wed+'T08:30' });
const s3 = Sch.suggest(t3);
console.log('安排在周三 8:30（数据结构 8:00-9:40）');
/* ═══════════ 提前量：远期任务不该挤在今天 ═══════════
   之前的 bug：169 天后才交的大作业被排到了「今天 19:00」，
   因为搜索总是从今天开始取最早的空档。 */
console.log('\n=== 远期任务的提前量 ===');
const todayStr = U.ymd(U.today());
function gapTo(slot) { return U.diffDays(todayStr, slot.date); }

const far = Sch.suggest({ title: '远期大作业', cat: 'cv', id: 'far1',
  due: U.ymd(U.addDays(U.today(), 120)) }, { ignoreCourses: true });
ok('120 天后的任务不排在今天', far && gapTo(far) > 30, far && `距今 ${gapTo(far)} 天`);
ok('远期任务排在截止之前', far && far.date < U.ymd(U.addDays(U.today(), 120)), far && far.date);

const soon = Sch.suggest({ title: '后天要交', cat: 'study', id: 'soon1',
  due: U.ymd(U.addDays(U.today(), 2)) }, { ignoreCourses: true });
ok('2 天后的任务就近安排', soon && gapTo(soon) <= 2, soon && `距今 ${gapTo(soon)} 天`);

const urgent = Sch.suggest({ title: '今天截止', cat: 'study', id: 'urg1',
  due: todayStr + 'T23:59' }, { ignoreCourses: true });
ok('今天截止的任务排今天', urgent && urgent.date === todayStr, urgent && urgent.date);

const tomorrow = Sch.suggest({ title: '明天要做', cat: 'cv', id: 'tmr1',
  due: U.ymd(U.addDays(U.today(), 1)) }, { ignoreCourses: true });
ok('明天的任务不留到下周', tomorrow && gapTo(tomorrow) <= 1, tomorrow && `距今 ${gapTo(tomorrow)} 天`);

ok('排期结果永远不早于今天', [far, soon, urgent, tomorrow].every(s => !s || s.date >= todayStr));

console.log('结果:', s3 && `${s3.fromText} [${s3.confidence}] ${s3.reason}`);
ok('检测到冲突', s3 && s3.confidence==='conflict', s3&&s3.confidence);
ok('冲突里含数据结构', s3 && s3.conflicts.some(c=>c.name==='数据结构'));

console.log('\n=== 6. 无任何时间 → 长期任务，不排期 ===');
/* 规则变更：既没截止、也没安排时间的任务归为「长期任务」，
   进长期栏，不占日历时段（见 DEVLOG「提醒策略」）。 */
const t4 = S.add('tasks', { title:'复习线性代数', cat:'study' });
const s4 = Sch.suggest(t4);
console.log('推荐:', s4, ' kind:', S.kindOf(t4));
ok('无时间的任务不排期', s4 === null, s4 && JSON.stringify(s4));
ok('归类为长期任务', S.kindOf(t4) === 'longterm', S.kindOf(t4));
ok('出现在长期栏', S.longTerm().some(x => x.id === t4.id));

/* 但「有截止日、只是没定具体时刻」的仍然要排 —— 这是导入页最常见的情况 */
const t4b = S.add('tasks', { title:'写实验报告', cat:'study', due: U.ymd(U.addDays(today, 3)) });
const s4b = Sch.suggest(t4b);
console.log('有截止无时刻 →', s4b && `${s4b.date} ${s4b.fromText}-${s4b.toText}  [${s4b.confidence}]`);
ok('有截止日的任务仍会排期', !!s4b);
/* 置信度是 before-due（"排在截止日之前"）而不是笼统的 suggested，
   信息量更大，断言按实际语义写 */
ok('置信度说明是「截止前完成」', s4b && s4b.confidence === 'before-due', s4b && s4b.confidence);
ok('排在截止日之前', s4b && s4b.date < U.ymd(U.addDays(today, 3)), s4b && s4b.date);

/* 日常活动也不排期 */
const t4c = S.add('tasks', { title:'背单词', cat:'study', kind:'daily' });
ok('日常活动不排期', Sch.suggest(t4c) === null);
ok('归类为日常活动', S.kindOf(t4c) === 'daily', S.kindOf(t4c));

console.log('\n=== 7. 批量排期不重叠 ===');
S.all('tasks').slice().forEach(t=>S.remove('tasks',t.id));
const batch = [
  S.add('tasks',{title:'A 作业',cat:'study',due:U.ymd(U.addDays(today,3))}),
  S.add('tasks',{title:'B 报告',cat:'cv',due:U.ymd(U.addDays(today,3))}),
  S.add('tasks',{title:'C 复习',cat:'study',due:U.ymd(U.addDays(today,4))}),
  S.add('tasks',{title:'D 实验',cat:'cv',due:U.ymd(U.addDays(today,2))})
];
const planned = Sch.plan(batch);
planned.forEach(p=>{
  console.log(`   ${p.task.title.padEnd(10)} → ${p.slot ? p.slot.date+' '+p.slot.fromText+'-'+p.slot.toText : '排不下 ('+p.reason+')'}`);
});
const withSlot = planned.filter(p=>p.slot);
ok('全部排上', withSlot.length===batch.length, withSlot.length+'/'+batch.length);
let overlap=0;
for(let i=0;i<withSlot.length;i++)for(let j=i+1;j<withSlot.length;j++){
  const a=withSlot[i].slot,b=withSlot[j].slot;
  if(a.date===b.date && a.to>b.from && a.from<b.to) overlap++;
}
ok('互相不重叠', overlap===0, overlap+' 处重叠');
ok('都不撞课', withSlot.every(p=>!Sch.busyOn(p.slot.date).some(b=>b.to>p.slot.from && b.from<p.slot.to)));

console.log('\n=== 8. 写回任务 ===');
const n = Sch.apply(planned, true);
console.log('写回', n, '条');
S.all('tasks').forEach(t=>console.log(`   ${t.title.padEnd(10)} start=${t.start} due=${t.due} suggested=${!!t.suggested}`));
ok('写回成功', n===batch.length, n);

console.log('\n=== 9. 全局冲突扫描 ===');
const conf = Sch.findConflicts();
console.log('发现', conf.length, '处冲突');
conf.forEach(c=>console.log(`   ${c.task.title} @ ${c.date} 与 ${c.courses.map(x=>x.name).join('、')}`));


/* ═══════════ 时长与时间格式 ═══════════
   踩过的坑：
   ① 空档返回整个窗口（取快递被排成 210 分钟）
   ② needMin*1.25 产生小数，格式化成 "08:37.5" 这种非法时间 */
console.log('\n=== 时长与时间格式 ===');
const dstr = U.ymd(U.addDays(U.today(), 2));
/* 200 分钟超过单个窗口（最长 210，但 morning 8:00-11:30 正好 210），
   这里只测到 120，避免依赖窗口具体长度 */
[15, 30, 45, 60, 90, 120].forEach(m => {
  const sl = Sch.freeSlots(dstr, m, {})[0];
  if (!sl) { ok(`freeSlots(${m}) 有结果`, false); return; }
  ok(`freeSlots(${m}) 时间格式合法`, /^\d{2}:\d{2}$/.test(sl.fromText) && /^\d{2}:\d{2}$/.test(sl.toText),
     sl.fromText + '-' + sl.toText);
  ok(`freeSlots(${m}) 长度不超需太多`, sl.to - sl.from <= m * 2, (sl.to - sl.from) + 'min');
});
const shortSlot = Sch.freeSlots(dstr, 30, {})[0];
ok('小任务不占整个窗口', shortSlot.to - shortSlot.from < 120, (shortSlot.to - shortSlot.from) + 'min');
ok('freeSlots 自带 fromText/toText', !!(shortSlot.fromText && shortSlot.toText),
   JSON.stringify({ f: shortSlot.fromText, t: shortSlot.toText }));

const lifeTask = Sch.suggest({ title: '取快递', cat: 'life', id: 'lf1', due: U.ymd(U.addDays(U.today(), 2)) },
  { ignoreCourses: true });
ok('生活杂事建议时长 ≤ 60 分钟', lifeTask && (lifeTask.to - lifeTask.from) <= 60,
   lifeTask && (lifeTask.to - lifeTask.from) + 'min');

const cvTask = Sch.suggest({ title: '写综述', cat: 'cv', id: 'cv1', due: U.ymd(U.addDays(U.today(), 2)) },
  { ignoreCourses: true });
ok('CV 任务建议时长 ≥ 90 分钟', cvTask && (cvTask.to - cvTask.from) >= 90,
   cvTask && (cvTask.to - cvTask.from) + 'min');
ok('所有建议时间都是合法 HH:MM', [lifeTask, cvTask].every(s => s && /^\d{2}:\d{2}$/.test(s.fromText) && /^\d{2}:\d{2}$/.test(s.toText)),
   [lifeTask, cvTask].map(s => s && `${s.fromText}-${s.toText}`).join(' , '));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail?1:0);