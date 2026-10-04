/**
 * 长期任务删除 · 真浏览器回归测试
 * ═══════════════════════════════════════════
 *
 * 用户报的 bug：「删除长期任务的时候，会把所有任务都删除」。
 * 这是**数据丢失级**的问题，所以单独开一个文件盯着它。
 *
 * 根因不是删除逻辑本身，而是**参数传错了类型**：
 *   Views.editTask(task, defaults) 收的是**任务对象**，
 *   而长期任务那一行写的是 Views.editTask(t.id)（一个字符串）。
 *   Object.assign({}, 'ta_xxx') 于是变成按字符下标排列的对象
 *   —— 既没有 id，也没有 title。
 *   isNew 判定为 false（字符串是真值），所以「删除」按钮照样显示，
 *   而 t.id 是 undefined；删除时 S.remove('tasks', undefined) 里的
 *   `filter(t => t.parentId !== id)` 恰好让**所有顶层任务**都满足，
 *   于是一次「删除一条」把整个任务库清空了。
 *
 * 这个文件只问用户能感知的两件事：
 *   ① 点开一条长期任务，编辑框里**有它自己的标题**吗？（原来是空白）
 *   ② 删掉之后，**别的任务还在吗**？
 *
 * 依赖：一个 chrome-headless-shell + 本地服务器 8777。
 */
const { open } = require('./cdp');

const PAGE = process.env.LIFEHUB_URL
  ? process.env.LIFEHUB_URL + '/harness-plan.html'
  : 'http://127.0.0.1:8777/harness-plan.html';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name, got === want, '得到 ' + JSON.stringify(got) + '，期望 ' + JSON.stringify(want));
}

const FLOW = `(async () => {
  const out = {};
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function btnByText(root, t) {
    return [].slice.call(root.querySelectorAll('button'))
      .filter(b => b.textContent.trim().indexOf(t) >= 0)[0];
  }

  /* 造数据：两条长期 + 一条有截止 + 一条子任务。
     不依赖 harness 里种了什么，免得以后改测试数据把这里弄红。 */
  S.reset(); S.init();
  const a = S.add('tasks', { title: '长期甲', cat: 'cv' });
  S.add('tasks', { title: '长期乙', cat: 'cv' });
  S.add('tasks', { title: '有截止的', cat: 'study', due: '2026-12-01' });
  S.add('tasks', { title: '子任务', cat: 'cv', parentId: a.id });
  out.before = S.all('tasks').length;

  App.go('plan');
  await sleep(450);
  /* 切到「长期」模式 */
  const plan = document.getElementById('view-plan');
  btnByText(plan, '长期').click();
  await sleep(450);

  const v = document.getElementById('view-plan');
  const rows = [].slice.call(v.querySelectorAll('.card'));
  out.rowTexts = rows.map(c => c.textContent.replace(/\\s+/g, ' ').trim().slice(0, 14));

  const row = rows.filter(c => c.textContent.indexOf('长期甲') >= 0)[0];
  out.foundRow = !!row;
  if (!row) return out;
  row.click();
  await sleep(600);

  /* ① 编辑框里必须是这条任务本身 —— 原来这里是**空白** */
  const body = document.getElementById('sheetBody');
  const titleInp = body ? body.querySelector('input.input') : null;
  out.titleValue = titleInp ? titleInp.value : '(没有标题输入框)';
  out.sheetTitle = (document.getElementById('sheetTitle') || {}).textContent;

  /* ② 走「删除 → 确认」 */
  const del = btnByText(body, '删除');
  out.hasDelBtn = !!del;
  if (!del) return out;
  del.click();
  await sleep(500);

  const cbody = document.getElementById('sheetBody');
  out.confirmText = (cbody ? cbody.textContent : '').replace(/\\s+/g, ' ').trim().slice(0, 70);

  const confirmDel = cbody ? btnByText(cbody, '删除') : null;
  out.hasConfirmDel = !!confirmDel;
  if (!confirmDel) return out;
  confirmDel.click();
  await sleep(800);

  out.after = S.all('tasks').map(t => t.title).sort();
  out.afterCount = out.after.length;
  return out;
})()`;

(async function main() {
  console.log('\n=== 长期任务删除 · 真浏览器 ===');
  let s;
  try {
    s = await open(PAGE);
  } catch (e) {
    console.log('  ✗ 起不了浏览器 / 打不开页面：' + e.message);
    console.log('\n长期任务删除浏览器测试: 0 通过, 1 失败');
    process.exit(1);
  }

  try {
    const out = await s.evaluate(FLOW);

    ok('切到「长期」模式后看得到长期任务', out.foundRow,
      JSON.stringify(out.rowTexts));
    /* ★ 这条就是用户报的 bug 的直接体现 */
    ok('★ 点开长期任务，编辑框里有它自己的标题（原来空白）',
      out.titleValue === '长期甲', out.titleValue);
    ok('「删除」按钮确实在编辑框里', out.hasDelBtn);
    ok('确认框里写的是任务名，不是 undefined',
      out.confirmText.indexOf('长期甲') >= 0 && out.confirmText.indexOf('undefined') < 0,
      out.confirmText);

    /* ★ 数据安全：删一条只掉一条（外加它的子任务），不能清库 */
    ok('★ 删除后别的任务还在（没有清空整个库）',
      out.after.indexOf('长期乙') >= 0 && out.after.indexOf('有截止的') >= 0,
      JSON.stringify(out.after));
    ok('被删的那条确实没了', out.after.indexOf('长期甲') < 0, JSON.stringify(out.after));
    ok('它的子任务也跟着走了（原有语义）', out.after.indexOf('子任务') < 0);
    eq('★ 4 条只掉 2 条（自己和子任务），不是全掉光', out.afterCount, 2);
    ok('★ 本来有 4 条，绝不该变成 0 条', out.before === 4 && out.afterCount !== 0,
      out.before + ' → ' + out.afterCount);
  } catch (e) {
    fail++;
    console.log('  ✗ 流程中断：' + e.message);
  } finally {
    if (s) s.close();
  }

  console.log('\n─────────────────────────────');
  console.log('长期任务删除浏览器测试: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();