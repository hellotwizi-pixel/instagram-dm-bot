# Hermes Office — 우리 회사 AI 오피스 (껍데기)

AI 에이전트들이 출근하고, 자리에 앉아 일하고, 회의실에 모이고, 대표실로 보고하러 오는 **픽셀 사무실 UI**입니다.
화면은 갓생맘 AI Office 의 픽셀 오피스를 그대로 옮겼고, **부서·에이전트·업무 흐름·상태 용어는 Hermes Desk(미미르 대시보드) 기준**으로 다시 짰습니다.

- Vite + React + TypeScript + Three.js (3D 렌더러). Next.js / Cloudflare / Python 서버 없음
- 정적 파일로 빌드되므로 Vercel·GitHub Pages·아무 정적 호스팅에 올릴 수 있어요
- 기본은 **시나리오 모드**. 개발 서버에서 Hermes Desk 주소를 주면 **실시간 모드**로 실제 작업 기록을 반영합니다

## 실행 (Mac, 더블클릭)

1. Hermes Desk 를 먼저 켭니다 (`Hermes Desk 열기.command`). 실시간으로 보지 않을 거면 건너뛰어도 됩니다.
2. 이 폴더의 **`Hermes Office 열기.command`** 를 더블클릭합니다.
   - 처음엔 macOS 가 막을 수 있어요. 그러면 파일을 **오른쪽 클릭 → 열기** 로 한 번 열어 주세요.
   - 처음 실행이면 필요한 파일을 1~2분 내려받습니다.
3. 브라우저가 자동으로 열립니다. 켜져 있는 Hermes Desk 를 찾으면 실시간 모드, 못 찾으면 시나리오 모드입니다.
4. 터미널 창을 닫으면 오피스도 꺼집니다.

터미널로 직접 켜려면:

```bash
cd office
npm install
npm run dev        # http://localhost:3000  (시나리오 모드)
```

```bash
npm run build      # 타입체크 + dist/ 생성
npm run preview    # 빌드 결과 미리보기
```

### 실시간 모드 — Hermes Desk 기록으로 움직이기

Hermes Desk(`server.py`)가 떠 있는 Mac에서:

```bash
HERMES_DESK_URL=http://127.0.0.1:64729 npm run dev
```

- Hermes Desk 는 CORS 헤더가 없고 Origin·Host 를 자기 주소로만 허용하므로, 개발 서버가 `/hermes/*` 를 그 주소로 중계하면서 헤더를 맞춥니다 (`vite.config.ts`).
- `/api/connect` 로 토큰을 받고 `/api/operations` 를 3초마다 읽습니다. 읽기만 하고, Hermes 에 명령을 보내지 않습니다.
- 작업(`tasks`)의 `group` 이 부서 방으로, `assignee`(프로필 id)가 캐릭터로 붙습니다. `assigned/spawned` 이벤트가 오면 헤르메스가 그 방으로 걸어가고, `completed` 면 결과를 회수하러 갑니다.
- 상태는 Hermes 범례 그대로: ● 작업 중 ◆ 확인 필요 ■ 차단 ○ 대기 + 완료. **진행률·성공은 만들지 않습니다.** 연결이 끊기면 마지막 상태를 남기고 "연결 확인 필요"로 표시합니다.
- **말풍선은 기록에 있는 글만 띄웁니다.** 작업 이벤트의 진행 메모·완료 요약·차단 사유·검수 요청은 담당 에이전트 머리 위에 첫 문장으로, Slack 요청 원문은 프로젝트 PM 머리 위에, 보고 전달 영수증(`reportedDone` 증가)은 헤르메스 머리 위에. 전문은 캐릭터를 클릭한 프로필의 "마지막 기록"에서 봅니다. `/api/slack` 은 10초마다 읽습니다. 에이전트끼리의 대화는 Hermes 기록에 없으므로 만들지 않습니다.
- 배포 빌드에는 중계가 없으므로 실시간 모드는 로컬 개발 서버에서만 동작합니다.

## Hermes 구조가 어떻게 들어갔나

| Hermes Desk | 픽셀 오피스 |
|---|---|
| `LABELS` 의 부서 9개 (개발·기획·디자인·마케팅·광고·운영·법무·보안·AI-OS 관리) | 바깥 링의 공유 부서 방 9개 |
| 여섯 행성 (ACE 인도어골프, 바베큐국립공원, 하하팩토리, 디토크, DMmate, AI-OS 관리) | 안쪽 링의 프로젝트 방 6개, 각 방에 PM. 행성이 없는 담당 4명은 헤르메스 HQ |
| 미미르 (회사 기억, 원천 16종) | 사무실 정중앙의 파란 구체. 직원이 조회하러 걸어가고, 일하는 방으로 지식 입자가 흐름 |
| 헤르메스 (요청 접수·분담·결과 회수) + `default`·`reviewer` 프로필 | `헤르메스` 방 — 지시창 답변자, 배달부 |
| 에이전트 프로필 47개 (`devpm`, `devcoder`, …) | 직원 47명, `callsign` = 프로필 id |
| 작업 상태 `todo/running/blocked/done…` | 작업 중 / 확인 필요 / 차단 / 대기 / 완료 |
| 흐름 체험 (요청 → 부서 배정 → 미미르 조회 → 검토 중 막힘 → 다시 진행 → 완료) | 하루 시나리오 12단계 |

시나리오는 `#dmmate` 요청 1건이 들어와서 기획 → 미미르 조회 → 디자인·개발 → **검토 차단(대표 확인)** → QA → 마케팅·운영·AI-OS → 결과 회수 → 헤르메스 보고 순서로 흐릅니다. 광고팀·보안팀은 외부 연결 전이라 "차단"으로 표시됩니다.

## 내 회사로 바꾸기

**`company.config.ts` 파일 하나만 고치면 됩니다.**

| 고칠 것 | 어디 |
|---|---|
| 회사 이름, 로고 글자, 화면 제목 | `COMPANY` |
| 대표(나) 이름·성격·머리색 | `CEO_PROFILE` |
| 부서 12개 이름·아이콘·하는 일·Hermes group 매핑 | `DEPARTMENTS` |
| 직원(에이전트) 이름·역할·색·혼잣말·프로필 id | `STAFF_LIST` |
| "차단"으로 표시할 부서와 이유 | `PENDING_INTEGRATIONS`, `BLOCK_REASONS` |
| 오늘의 Slack 요청과 세부 업무 | `REQUEST` |
| 검토 차단 안건 (대표 확인) | `DECISION` |
| 대시보드 연결 목록 | `INTEGRATIONS` |
| 미미르 데이터 원천 목록 | `MIMIR_SOURCES` |
| 결과 보관함 항목 | `RESULTS` |
| 보고서를 받을 서버 주소 (선택) | `REPORT_ENDPOINT` |
| 실시간 중계 경로·조회 간격 | `LIVE` |
| 화면 하단 크레딧 | `FOOTER` |

### 지켜야 할 것 2가지

1. **부서 `id`는 바꾸지 마세요** (`dev plan design mkt ad ops legal sec aios pm mimir hermes`).
   시나리오(`src/game/sim.ts`)가 이 id로 캐릭터를 움직입니다. `name · icon · short · task · report · liveGroups` 는 자유입니다.
2. **프로젝트 6개 · 부서 9개 + 헤르메스** 를 유지하세요. 원형 배치의 칸 수가 고정입니다. 배치를 바꿨으면 `npx tsx scripts/check-world.ts` 로 방 겹침·도달 가능 여부를 확인하세요.

## 구조

```
office/
├── company.config.ts     ← 여기만 고치면 됨
├── vite.config.ts        ← HERMES_DESK_URL 중계
├── src/
│   ├── App.tsx           ← 라이브 오피스 / 대시보드 화면
│   ├── styles/           ← globals.css, office.css
│   └── game/
│       ├── sim.ts        ← 시나리오 + 직원 상태머신 + 실시간 반영(applyLive)
│       ├── live.ts       ← Hermes Desk 연결 (토큰 → 3초 조회)
│       ├── world.ts      ← 원형 타일 맵: 중앙 미미르 구체+대표실, 안쪽 프로젝트 링, 바깥 부서 링
│       ├── pathfinding.ts
│       ├── staff.ts      ← config → 직원 데이터, 프로필 id 색인
│       ├── report.ts     ← 보고서 생성 (서버 없으면 콘솔 출력)
│       └── OfficeWorld.tsx ← Three.js 3D 렌더러 (방·가구·아바타·아크 리액터·카메라)
└── public/favicon.svg
```

## 보고 발행 붙이기 (선택)

`REPORT_ENDPOINT` 에 URL을 넣으면 "📤 보고 발행" 버튼이 그 주소로 보고서 JSON을 POST 합니다.
응답은 `{ notion: {ok, status, url?}, discord: {ok, status}, publishedAt }` 형태를 기대합니다.
비워두면 "미설정"으로 동작하고 보고서 본문은 브라우저 콘솔에만 남습니다.

## Vercel 배포

이 폴더는 루트의 인스타그램 DM 봇과 별개의 앱입니다. Vercel에서 **새 프로젝트**를 만들고
Root Directory 를 `office` 로 지정하면 `office/vercel.json` 설정으로 정적 빌드됩니다.

## 크레딧

픽셀 오피스 UI·엔진 원본은 갓생맘 🎀 (@godseng.mom) 이 만들어 배포한 것입니다. 자유롭게 쓰되 무단 재판매는 금지입니다.
부서·에이전트·보고 원칙은 Hermes Desk(`보고체계 기준.md`)를 따랐습니다.
