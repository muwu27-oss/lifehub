/**
 * 真浏览器渲染测试
 * ─────────────────
 * 为什么需要这个：jsdom 不执行 CSS，所以「页面被 CSS 藏起来」这类 bug
 * jsdom 测不出来。实际踩过的坑：App.go() 只从所有 .view 上移除 active，
 * 却没有给当前视图加回 active，导致 .view{display:none} 把整页藏掉，
 * 真机上打开就是一片空白。
 *
 * 依赖：需要一个 chrome-headless-shell 和一个跑着的本地服务器。
 *   node test/browser.test.js            # 服务器已在 8777 运行时
 * 若缺环境会自动跳过（不算失败），不阻塞其它测试。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_BIN ||
  '/home/muwu27/.cache/browsers/chrome-headless-shell/linux-154.0.8037.92/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.LIFEHUB_URL || 'http://127.0.0.1:8777';

/* 环境不全就跳过，避免在别的机器上跑测试时直接红 */
const hasChrome = fs.existsSync(CHROME);
let hasServer = false;
try {
  execFileSync('curl', ['-s', '-m', '2', '-o', '/dev/null', BASE + '/index.html']);
  hasServer = true;
} catch (e) { hasServer = false; }

if (!hasChrome || !hasServer) {
  console.log('跳过浏览器测试：' + (!hasChrome ? '找不到 chrome-headless-shell' : '本地服务器未运行'));
  console.log('  启动服务器：cd ~/lifehub && python3 -m http.server 8777 --bind 127.0.0.1');
  process.exit(0);
}

let pass=0, fail=0;
function ok(name,cond,extra=''){ if(cond){pass++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name+' '+extra);} }

function dom(url){
  return execFileSync(CHROME,['--headless','--disable-gpu','--no-sandbox','--dump-dom',
    '--virtual-time-budget=7000',url],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
}

/* harness 测试页是截图/验证用的带数据页面，先确保它们存在 */
try {
  execFileSync('python3', [path.join(__dirname, '..', 'shots', 'make_harness.py')],
    { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
} catch (e) {
  console.log('提示：生成 harness 页面失败（' + e.message + '），部分用例可能失败');
}

console.log('=== 真浏览器渲染验证（Chrome headless）===');

/* 1. 首页必须真的有可见内容 */
const home = dom('http://127.0.0.1:8777/index.html');
ok('首页 section 带 active 类（否则 CSS 会藏掉整页）',
   /<section class="view active" id="view-today"/.test(home));
ok('今日视图渲染出圆环', /class="ring"/.test(home));
ok('今日视图渲染出内容', home.length > 5000, home.length+' 字节');
ok('浮层默认隐藏', /id="scrim" hidden/.test(home) || /scrim"[^>]*hidden/.test(home));
const tabCount = (home.match(/data-view="[a-z]+"/g)||[]).length;
ok('底部导航有 5 个 tab', tabCount === 5, tabCount + ' 个');
ok('标题正确', /<title>LifeHub/.test(home));

/* 2. 各视图都能渲染出内容（不是空白） */
const views=[['plan','视图'],['import','一键导入'],['body','饮食作息'],['money','账本'],['learn','学习蓝图']];
views.forEach(([v,expect])=>{
  const d=dom('http://127.0.0.1:8777/harness-'+v+'.html');
  ok(v+' 视图渲染成功', d.includes(expect), '未找到「'+expect+'」');
  ok(v+' 视图 section 激活', new RegExp('<section class="view active" id="view-'+v+'"').test(d));
});

/* 3. 导入流程真的跑通了 */
const imp=dom('http://127.0.0.1:8777/harness-import-parse-scroll.html');
ok('解析出任务预览', /归档 \d+ 条/.test(imp), '未找到归档按钮');
ok('显示排期建议', /建议 \d{4}-\d{2}-\d{2}/.test(imp) || /建议 (今天|明天)/.test(imp));
ok('显示避开课表提示', /避开/.test(imp));
ok('推荐时间格式合法（没有 08:37.5）', !/\d{2}:\d{2}\.\d/.test(imp), (imp.match(/\d{2}:\d{2}\.\d/g)||[]).join(','));

console.log('\n══════════════');
console.log('结果: '+pass+' 通过, '+fail+' 失败');
process.exit(fail?1:0);
