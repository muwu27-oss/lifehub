/* Node 测试脚手架：把浏览器全局脚本加载进来 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

global.window = global;
global.document = {
  createElement: () => ({ style:{}, setAttribute(){}, appendChild(){}, addEventListener(){}, classList:{add(){},remove(){}}, remove(){} }),
  createElementNS: () => ({ setAttribute(){}, appendChild(){} }),
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild(){} }
};
global.navigator = {};
global.localStorage = (() => { let m={}; return {
  getItem:k=>m[k]??null, setItem:(k,v)=>{m[k]=String(v)}, removeItem:k=>{delete m[k]}, clear:()=>{m={}}
};})();
global.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
global.Blob = class { constructor(){} };
global.TextEncoder = require('util').TextEncoder;
global.setTimeout = setTimeout; global.clearTimeout = clearTimeout;

function load(...files) {
  files.forEach(f => {
    const p = path.join(ROOT, f);
    eval(fs.readFileSync(p, 'utf8'));
  });
}
module.exports = { load, ROOT };
