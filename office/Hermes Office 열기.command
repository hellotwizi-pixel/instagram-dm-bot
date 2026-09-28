#!/bin/zsh
# 더블클릭으로 오피스를 켭니다. 켜져 있는 Hermes Desk 를 자동으로 찾아 실시간 모드로 붙고,
# 못 찾으면 시나리오 모드로 엽니다. 이 창을 닫으면 오피스도 꺼집니다.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 가 없어요. https://nodejs.org 에서 LTS 를 설치한 뒤 다시 더블클릭하세요."
  open "https://nodejs.org"
  read -k1 "?아무 키나 누르면 닫힙니다."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "처음 실행이라 필요한 파일을 내려받아요 (1~2분)…"
  npm install || { read -k1 "?설치 실패. 아무 키나 누르면 닫힙니다."; exit 1; }
fi

# 켜져 있는 Hermes Desk 찾기: 파이썬이 열어 둔 포트 중 /api/connect 가 토큰을 주는 곳
PORT=""
for p in $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'tolower($1) ~ /python/ {print $9}' | sed 's/.*://' | sort -u); do
  if curl -s -m 1 -H "X-Desk-Bootstrap: 1" "http://127.0.0.1:$p/api/connect" | grep -q token; then
    PORT="$p"; break
  fi
done

if [ -n "$PORT" ]; then
  echo "Hermes Desk 발견 · 포트 $PORT · 실시간 모드로 엽니다."
  export HERMES_DESK_URL="http://127.0.0.1:$PORT"
else
  echo "켜져 있는 Hermes Desk 를 못 찾았어요. 시나리오 모드로 엽니다."
  echo "실시간으로 보려면 먼저 'Hermes Desk 열기.command' 를 실행한 뒤 이 파일을 다시 더블클릭하세요."
fi

(sleep 4; open "http://localhost:3000") &
echo "브라우저가 곧 열립니다. 이 창을 닫으면 오피스가 꺼집니다."
npx vite --port 3000 --strictPort
