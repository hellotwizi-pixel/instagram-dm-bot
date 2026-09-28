# 나의 AI Office (껍데기)

AI 직원들이 출근하고, 자리에 앉아 일하고, 회의실에 모이고, 대표실로 보고하러 오는 **픽셀 사무실 UI**입니다.
원본(갓생맘 AI Office)의 화면을 그대로 옮기되, 서버·외부 연동·Cloudflare 의존성을 전부 걷어낸 **순수 프론트엔드 껍데기**예요.

- Vite + React + TypeScript 만 사용 (Next.js / vinext / Wrangler / Drizzle / Tailwind 없음)
- 정적 파일로 빌드되므로 Vercel·GitHub Pages·아무 정적 호스팅에 올릴 수 있어요
- 연동은 하나도 없고, 화면에는 정직하게 **"미설정"** 으로 표시됩니다

## 실행

```bash
cd office
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build      # 타입체크 + dist/ 생성
npm run preview    # 빌드 결과 미리보기
```

## 내 회사로 바꾸기

**`company.config.ts` 파일 하나만 고치면 됩니다.**

| 고칠 것 | 어디 |
|---|---|
| 회사 이름, 로고 글자, 화면 제목 | `COMPANY` |
| 대표(나) 이름·성격·머리색 | `CEO_PROFILE` |
| 부서 12개 이름·아이콘·하는 일 | `DEPARTMENTS` |
| 직원 이름·직책·색·혼잣말 | `STAFF_LIST` |
| "연동 대기"로 표시할 팀 | `PENDING_INTEGRATIONS` |
| 대표 승인에 올라오는 오늘의 안건 | `PROPOSAL` |
| 대시보드 연동 목록 | `INTEGRATIONS` |
| 보고서를 받을 서버 주소 (선택) | `REPORT_ENDPOINT` |
| 결과물 보관함 링크 | `STORAGE_LINK` |
| 화면 하단 크레딧 | `FOOTER` |

직원 수·이름·비서실장 이름은 자유롭게 바꿔도 화면 문구(직원 N명, 지시창 발신자, 승인 회의 참석자)가 따라옵니다.

### 지켜야 할 것 2가지

1. **부서 `id`는 바꾸지 마세요** (`research`, `brand`, `strategy1`, `qa`, `strategy2`, `reels`, `carousel`, `partner`, `finance`, `review`, `ops`, `secretary`).
   시뮬레이션 시나리오(`src/game/sim.ts`)가 이 id로 캐릭터를 움직입니다. `name` · `icon` · `short` · `task` · `report` 는 자유입니다.
2. **부서는 12개를 유지하세요.** 사무실 배치가 4열 3행 고정입니다. 안 쓰는 부서는 이름만 바꿔 쓰세요.

## 구조

```
office/
├── company.config.ts     ← 여기만 고치면 됨
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx           ← 라이브 오피스 / 대시보드 화면
│   ├── styles/           ← globals.css, office.css (원본 그대로)
│   └── game/
│       ├── sim.ts        ← 하루 시나리오 + 직원 상태머신
│       ├── world.ts      ← 타일 맵, 방, 가구
│       ├── pathfinding.ts
│       ├── staff.ts      ← config → 직원 데이터
│       ├── report.ts     ← 보고서 생성 (서버 없으면 콘솔 출력)
│       └── OfficeWorld.tsx ← 카메라·스프라이트 렌더링
└── public/favicon.svg
```

## 보고 발행 붙이기 (선택)

`REPORT_ENDPOINT` 에 URL을 넣으면 "📤 보고 발행" 버튼이 그 주소로 보고서 JSON을 POST 합니다.
응답은 아래 형태를 기대합니다.

```json
{
  "notion":  { "ok": true, "status": "sent", "url": "https://..." },
  "discord": { "ok": true, "status": "sent" },
  "publishedAt": "2026-01-01T00:00:00.000Z"
}
```

비워두면 발행 버튼은 "미설정"으로 동작하고 보고서 본문은 브라우저 콘솔에만 남습니다.

## Vercel 배포

이 폴더는 루트의 인스타그램 DM 봇과 별개의 앱입니다. Vercel에서 **새 프로젝트**를 만들고
Root Directory 를 `office` 로 지정하면 `office/vercel.json` 설정으로 정적 빌드됩니다.

## 크레딧

원본 UI·시뮬레이션은 갓생맘 🎀 (@godseng.mom) 이 만들어 배포한 것입니다. 자유롭게 쓰되 무단 재판매는 금지입니다.
