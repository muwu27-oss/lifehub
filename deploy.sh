#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
#  deploy.sh — 把 LifeHub 发布到 GitHub Pages
#
#  用法（在 ~/lifehub 下）：
#     export GITHUB_TOKEN=github_pat_xxxxx
#     ./deploy.sh
#
#  或者把 token 存到文件里（脚本会自动读）：
#     echo 'github_pat_xxxxx' > .gh-token     # 已在 .gitignore 里
#     ./deploy.sh
#
#  脚本做的事：
#     1. 初始化 git 仓库并提交当前代码
#     2. 用 GitHub API 创建仓库（已存在就跳过）
#     3. 推送代码
#     4. 打开 GitHub Pages（用 Actions 或 gh-pages 分支）
#     5. 打印最终网址
# ═══════════════════════════════════════════════════
set -euo pipefail

REPO_NAME="${REPO_NAME:-lifehub}"
USER_NAME="${GITHUB_USER:-muwu27-oss}"
BRANCH="${BRANCH:-main}"

# ── 取 token：环境变量优先，其次 .gh-token 文件 ──
if [ -z "${GITHUB_TOKEN:-}" ] && [ -f .gh-token ]; then
  GITHUB_TOKEN="$(tr -d '[:space:]' < .gh-token)"
fi
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "✗ 没有找到 token。"
  echo "  请先执行：export GITHUB_TOKEN=github_pat_xxxxx"
  echo "  或：     echo 'github_pat_xxxxx' > .gh-token"
  exit 1
fi

API="https://api.github.com"
AUTH="Authorization: Bearer ${GITHUB_TOKEN}"

echo "▶ 检查 token 有效性..."
ME_JSON="$(curl -sS -H "$AUTH" -H 'Accept: application/vnd.github+json' "$API/user")"
ME_LOGIN="$(printf '%s' "$ME_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("login",""))' 2>/dev/null || true)"
if [ -z "$ME_LOGIN" ]; then
  echo "✗ token 无效或没有权限。GitHub 返回："
  printf '%s\n' "$ME_JSON" | head -5
  exit 1
fi
echo "  ✓ 已认证为：$ME_LOGIN"

# 默认用真实登录名建仓库（比猜用户名可靠）
[ "$USER_NAME" = "muwu27-oss" ] && USER_NAME="$ME_LOGIN"

# ── 1. git 初始化与提交 ──
if [ ! -d .git ]; then
  echo "▶ 初始化 git 仓库..."
  git init -q
  git branch -M "$BRANCH" 2>/dev/null || git checkout -q -b "$BRANCH"
fi

echo "▶ 提交代码..."
git add -A
if git diff --cached --quiet; then
  echo "  （没有新改动，跳过提交）"
else
  git -c user.name="LifeHub Deploy" -c user.email="deploy@lifehub.local" \
      commit -q -m "LifeHub: 学习生活管理 PWA

- 日程/待办/学习规划，父子任务层级
- 一键导入：群消息解析 → 自动归档排期
- 三类提醒：有截止→前一天18:00；日常活动→每天18:00；长期任务→只列表不提醒
- 饮食作息记录 + 营养计算
- 微信账单导入 + 分类统计
- 学习蓝图（对齐 Obsidian 路线）"
  echo "  ✓ 已提交"
fi

# ── 2. 创建远端仓库 ──
echo "▶ 检查仓库 $USER_NAME/$REPO_NAME ..."
CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H "$AUTH" "$API/repos/$USER_NAME/$REPO_NAME")"
if [ "$CODE" = "200" ]; then
  echo "  ✓ 仓库已存在，直接推送"
else
  echo "  创建中..."
  CREATE_JSON="$(curl -sS -X POST -H "$AUTH" -H 'Accept: application/vnd.github+json' \
    "$API/user/repos" \
    -d "{\"name\":\"$REPO_NAME\",\"description\":\"个人学习生活管理 PWA\",\"private\":false,\"has_issues\":true,\"auto_init\":false}")"
  if printf '%s' "$CREATE_JSON" | grep -q '"full_name"'; then
    echo "  ✓ 仓库已创建"
  else
    echo "  ✗ 创建失败："
    printf '%s\n' "$CREATE_JSON" | head -8
    exit 1
  fi
fi

# ── 3. 推送 ──
echo "▶ 推送代码..."
REMOTE="https://${USER_NAME}:${GITHUB_TOKEN}@github.com/${USER_NAME}/${REPO_NAME}.git"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git push -q -u origin "$BRANCH" --force
echo "  ✓ 已推送"

# 立刻把带 token 的远端换掉，避免 token 留在 .git/config 里
git remote set-url origin "https://github.com/${USER_NAME}/${REPO_NAME}.git"

# ── 4. 打开 GitHub Pages ──
echo "▶ 启用 GitHub Pages..."
curl -sS -o /dev/null -X POST -H "$AUTH" -H 'Accept: application/vnd.github+json' \
  "$API/repos/$USER_NAME/$REPO_NAME/pages" \
  -d "{\"source\":{\"branch\":\"$BRANCH\",\"path\":\"/\"}}" 2>/dev/null || true

# 若已存在会返回 409，改成 PUT 更新
curl -sS -o /dev/null -X PUT -H "$AUTH" -H 'Accept: application/vnd.github+json' \
  "$API/repos/$USER_NAME/$REPO_NAME/pages" \
  -d "{\"source\":{\"branch\":\"$BRANCH\",\"path\":\"/\"}}" 2>/dev/null || true

URL="https://${USER_NAME}.github.io/${REPO_NAME}/"
echo
echo "═══════════════════════════════════════════"
echo "  ✓ 部署完成"
echo
echo "  网址（可能要等 1-3 分钟生效）："
echo "    $URL"
echo
echo "  仓库："
echo "    https://github.com/${USER_NAME}/${REPO_NAME}"
echo "═══════════════════════════════════════════"
echo
echo "下一步：手机浏览器打开上面的网址 → 添加到主屏幕"