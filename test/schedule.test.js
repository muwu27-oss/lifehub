const { load } = require('./harness');
load('js/utils.js','js/store.js','js/parser.js');
S.init();
let pass=0,fail=0;
const ok=(n,c,e='')=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+' '+e));};

const schedule = `
周一 第1-2节 高等数学 A101 1-16周
周一 第3-4节 线性代数 B203 1-16周
周二 第5-6节 数据结构 实验楼C301 1-16周
周三 下午 计算机视觉导论 报告厅 3-14周
周四 第9-10节 大学物理 A205 1-16周
周五 第3-4节 具身智能导论 实验室D102 5-12周
`;
const r = Parser.parseSchedule(schedule);
console.log('=== 课表解析 ===');
r.tasks.forEach(c=>console.log(`  ${c.title} | 周${c.weekday} 第${c.periods.join(',')}节 | ${c.weeks?c.weeks.from+'-'+c.weeks.to+'周':'?'} | ${c.location} | cat=${c.cat} | ${c.startTime.hour}:${String(c.startTime.minute).padStart(2,'0')}`));
console.log('  统计:', JSON.stringify(r.stats));

ok('解析出 6 门课', r.tasks.length===6, r.tasks.length);
ok('高数归 study', r.tasks[0].cat==='study', r.tasks[0].cat);
ok('具身智能导论归 cv', r.tasks.find(t=>t.title.includes('具身智能'))?.cat==='cv');
ok('计算机视觉导论归 cv', r.tasks.find(t=>t.title.includes('计算机视觉'))?.cat==='cv');
ok('周次范围正确 3-14', r.tasks.find(t=>t.title.includes('计算机视觉'))?.weeks?.from===3);
ok('节次 1,2 提取正确', JSON.stringify(r.tasks[0].periods)==='[1,2]', JSON.stringify(r.tasks[0].periods));
ok('第1节=8:00', r.tasks[0].startTime.hour===8, r.tasks[0].startTime.hour);
ok('第5节=14:00', r.tasks.find(t=>t.title.includes('数据结构'))?.startTime.hour===14);

// 展开周次
const termStart = U.ymd(U.startOfWeek(U.today()));
const expanded = Parser.expandSchedule(r.tasks, { termStart, weeks: 16 });
console.log('\n=== 展开为具体日程 ===');
console.log('  生成任务数:', expanded.length);
expanded.slice(0,4).forEach(t=>console.log(`  ${t.start} ${t.title} @${t.location} (${t.note})`));
ok('展开出任务', expanded.length>0, expanded.length);
ok('展开任务都有具体日期', expanded.every(t=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t.start)));
ok('只保留今天及以后', expanded.every(t=>t.start.slice(0,10) >= U.ymd(U.today())));
ok('同周同课程不重复', new Set(expanded.map(t=>t.title+t.start)).size===expanded.length);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail?1:0);
