#!/bin/bash
# 逐个视图截图（带真实数据）
CHROME=/home/muwu27/.cache/browsers/chrome-headless-shell/linux-154.0.8037.92/chrome-headless-shell-linux64/chrome-headless-shell
OUT=/home/muwu27/lifehub/shots
for spec in "$@"; do
  name="${spec%%:*}"; view="${spec##*:}"
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --window-size=390,844 --screenshot="$OUT/$name.png" --virtual-time-budget=7000 \
    "http://127.0.0.1:8777/harness-$view.html" 2>&1 | grep -i written | sed "s|.*/|  $name.png ← |"
done
