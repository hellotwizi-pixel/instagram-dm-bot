# Hermes Dashboard — 통합 개발 폴더

Hermes Desk(미미르 대시보드, 파이썬)와 Hermes Office(3D 오피스, Vite+Three.js)를 한 폴더에서 같이 켜고 같이 고칩니다.

```
hermes-dashboard/
├── 대시보드 열기.command   ← Mac 더블클릭: Desk + Office 동시 실행
├── dev.mjs                 ← 실행기 (node dev.mjs / --office / --desk)
├── package.json            ← npm run dev · build · check
├── hermes-desk/            ← Hermes Desk 소스 (server.py, 관측 플러그인, 보고체계 기준.md)
└── office/                 ← Hermes Office (company.config.ts, src/game/*, 3D 에셋)
```

## 켜기

**Mac**: `대시보드 열기.command` 더블클릭. 처음엔 오른쪽 클릭 → 열기.
- Hermes Desk 를 포트 64729 로 띄우고, 토큰이 나오면 Office 를 실시간 모드로 `http://localhost:3000` 에 엽니다.
- 이미 Desk 가 떠 있으면 그걸 그대로 씁니다. Desk 가 20초 안에 안 뜨면 Office 는 시나리오 모드로 열립니다.

**터미널**:

```bash
npm run dev            # Desk + Office
npm run dev:office     # Office 만 (떠 있는 Desk 가 있으면 자동으로 붙음)
npm run dev:desk       # Desk 만
npm run check          # Office 타입체크·빌드 + 배치/시나리오/상자 검사
```

파이썬은 `~/.hermes/hermes-agent/venv/bin/python` → `hermes-desk/.venv` → 시스템 `python3` 순서로 찾습니다.
Hermes 가 없는 컴퓨터에서는 `npm run install:desk` 로 venv 를 만들면 됩니다 (PyYAML 하나만 필요).

## 어디를 고치나

| 하고 싶은 것 | 파일 |
|---|---|
| 회사·프로젝트·부서·직원·색 | `office/company.config.ts` |
| 오피스 맵 배치(섬·다리·계단·방) | `office/src/game/world.ts` |
| 하루 시나리오·실시간 반영 규칙 | `office/src/game/sim.ts` |
| 3D 모양·조명·테마 | `office/src/game/OfficeWorld.tsx`, `office/src/styles/*.css` |
| 캐릭터 배정·색 | `office/src/game/characters.ts` |
| Hermes Desk API·화면 | `hermes-desk/server.py`, `hermes-desk/*.js` |
| 보고 원칙 | `hermes-desk/보고체계 기준.md` |

Office 는 Desk 의 `/api/connect` → `/api/operations` → `/api/slack` 만 읽습니다. Desk 쪽 API 를 바꾸면 `office/src/game/live.ts` 와 `sim.ts` 의 `applyLive`/`applySlack` 도 같이 맞춥니다.

## 주의

- `hermes-desk/` 는 2026-09-28 소스 사본입니다. 실제로 돌아가는 Hermes Desk 가 다른 폴더에 있으면, 여기서 고친 걸 그쪽으로 복사하거나 그쪽 폴더를 이 자리로 옮겨 쓰세요. 실행 기록(`local-data/`, `*.db`, 로그)은 git 에 안 들어갑니다.
- Office 자세한 설명은 `office/README.md`.
