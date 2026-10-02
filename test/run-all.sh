#!/bin/bash
# 跑全部测试。需要先起服务器（只有 browser.test.js 需要）。
#   cd ~/lifehub && python3 -m http.server 8777 --bind 127.0.0.1 &
#   ./test/run-all.sh
cd "$(dirname "$0")/.."
total=0
for t in parser schedule schedule2 remind diet income foodai billimport wechat txnrule backup history integration diary diary-browser browser; do
  printf "%-20s " "$t.test.js"
  out=$(node test/$t.test.js 2>&1 | grep -oE '[0-9]+ 通过, [0-9]+ 失败' | tail -1)
  echo "${out:-运行失败}"
  n=$(echo "$out" | grep -oE '^[0-9]+')
  total=$((total + ${n:-0}))
done
echo "─────────────────────────────"
echo "合计 $total 项断言"
