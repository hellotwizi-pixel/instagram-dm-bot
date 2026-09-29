#!/bin/zsh
# 더블클릭 한 번으로 Hermes Desk + Hermes Office 를 같이 켭니다. 이 창을 닫으면 둘 다 꺼집니다.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 가 없어요. https://nodejs.org 에서 LTS 를 설치한 뒤 다시 더블클릭하세요."
  open "https://nodejs.org"
  read -k1 "?아무 키나 누르면 닫힙니다."
  exit 1
fi
node dev.mjs
read -k1 "?끝났어요. 아무 키나 누르면 닫힙니다."
