// ============================================================
//  나의 AI 회사 설정 — Hermes Desk 기준
// ============================================================
//  Hermes Desk(server.py LABELS · 보고체계 기준.md)의 부서·에이전트 프로필을
//  그대로 옮겼습니다. 부서 이름은 Hermes의 group 이름과 같아야
//  실시간 연결(LIVE) 시 작업 기록이 올바른 방에 붙습니다.
//
//  ⚠️ 딱 2가지 규칙
//   1. 부서 id(dev, plan, ...)와 프로젝트 id 는 바꾸지 마세요. 시나리오 엔진이 이 id로 움직입니다.
//      → 바꿔도 되는 건 name · icon · short · color · task · report 입니다.
//   2. 프로젝트 6개 · 부서 9개 + 헤르메스 를 유지하세요. 사무실 배치가 그 칸 수로 고정입니다.
//
//  직원은 자유롭게 늘리고 줄여도 됩니다(방 하나에 최대 12명).
//  callsign 에는 Hermes 프로필 id(devpm, devcoder …)를 넣으세요.
//  실시간 연결 시 작업의 assignee 와 이 callsign 으로 캐릭터를 찾습니다.
// ============================================================

/** 회사 기본 정보 */
export const COMPANY = {
  /** 좌측 상단 헤더에 뜨는 회사 이름 */
  name: "HERMES COMMAND SYSTEM",
  /** 헤더 로고 배지에 들어갈 글자 1개 */
  logoLetter: "H",
  /** 화면 상단 큰 제목 (앞부분) */
  titlePrefix: "우리 팀은",
  /** 화면 상단 큰 제목 (강조되는 뒷부분) */
  titleAccent: "지금.",
  /** 라이브 오피스 제목 아래 한 줄 */
  tagline: "Slack에서 맡긴 일이 프로젝트 방으로 들어가고, PM이 부서에 나누고, 미미르를 조회해 결과로 돌아옵니다.",
  /** 브라우저 탭 제목 */
  pageTitle: "Hermes Office — 우리 회사 AI 오피스",
  /** 검색·공유될 때 뜨는 설명 */
  description: "헤르메스가 업무를 나누고 미미르가 기억하는, 우리 회사 AI 에이전트 픽셀 오피스",
  /** 대시보드 창 상단 라벨 */
  windowLabel: "hermes_desk.exe — 관제실",
  /** 일일 브리핑 제목에 들어갈 이름 */
  reportName: "Hermes Office",
} as const;

/** 대표(나) — 대표실에 앉아 있는 캐릭터 */
export const CEO_PROFILE = {
  name: "대표",
  callsign: "대표님",
  role: "대표 · 최종 의사결정",
  hair: "#42283a",
  shirt: "#ff8fc0",
  accent: "#fff3b0",
  skin: "#ffdcc4",
  thoughts: [
    "AI는 실행, 결정은 내가 해요.",
    "막힌 이유를 먼저 본다.",
    "완료와 보고 전달은 다른 일이다.",
  ],
};

/**
 * 프로젝트 6개 — 맨 윗줄 방. 각 방에 그 프로젝트 PM 이 앉아 있고 Slack 요청이 여기로 먼저 들어옵니다.
 * (Hermes Desk village-model.js 의 여섯 행성)
 * pm = 프로젝트 PM 프로필 id / color = 이름표·방 색 / aliases = 실시간 연결 시 프로젝트 이름 매칭
 */
export const PROJECTS = [
  { id: "golf", name: "ACE 인도어골프", short: "ace.golf", icon: "⛳", color: "#698d75", pm: "acepm", aliases: ["ace인도어골프"] },
  { id: "bbq", name: "바베큐국립공원", short: "bbq.park", icon: "🔥", color: "#b97c50", pm: "bbqpm", aliases: ["바베큐국립공원"] },
  { id: "haha", name: "하하팩토리", short: "haha.factory", icon: "🏭", color: "#d29964", pm: "hahapm", aliases: ["하하팩토리"] },
  { id: "ditalk", name: "디토크", short: "ditalk.studio", icon: "🎙️", color: "#c58b92", pm: "ditalkpm", aliases: ["디토크"] },
  { id: "dmmate", name: "DMmate", short: "dmmate.post", icon: "💌", color: "#6c99b6", pm: "replypm", aliases: ["dmmate"] },
  { id: "aiosctl", name: "AI-OS 관리", short: "aios.control", icon: "🛰️", color: "#8c85b5", pm: "aiospm", aliases: ["aios관리", "aios개발관리"] },
] as const;

/**
 * 공유 부서 9개 + 헤르메스 — 아랫줄 방. Hermes Desk LABELS 의 group 과 1:1.
 * 부서 에이전트는 프로젝트마다 복제되지 않는 공유 풀입니다. 일할 때 이름표가 맡은 프로젝트 색으로 칠해집니다.
 * id = 고정(엔진용) / name·short·icon = 자유롭게 변경
 * task = 오늘 하는 일 / report = 팀장 한줄보고
 * liveGroups = 실시간 연결 시 이 방으로 묶을 Hermes group 이름들
 */
export const DEPARTMENTS = [
  { id: "dev", name: "개발팀", short: "dev.team", icon: "💻", liveGroups: ["개발팀"],
    task: "오류 원인 조사 · 기능 구현 · 검수 · QA", report: "재현 → 원인 → 수정 → 테스트 순서로 끝냈어요." },
  { id: "plan", name: "기획팀", short: "plan.team", icon: "🧭", liveGroups: ["기획팀"],
    task: "요청을 기능 목록·작업 단위로 분해", report: "큰 일을 작은 작업으로 나눠 순서를 정했어요." },
  { id: "design", name: "디자인팀", short: "design.team", icon: "🎨", liveGroups: ["디자인팀"],
    task: "화면 흐름·버튼·색·글자 정리", report: "사용 흐름을 정리하고 화면 시안을 냈어요." },
  { id: "mkt", name: "마케팅팀", short: "mkt.team", icon: "📣", liveGroups: ["마케팅팀"],
    task: "소개글·게시물 초안 · 제목·문구 제안", report: "초안까지만 씁니다. 게시는 대표가 해요." },
  { id: "ad", name: "광고팀", short: "ad.team", icon: "📊", liveGroups: ["광고팀"],
    task: "광고 성과 분류 · 예산 배분 · 소재 검토", report: "광고 계정이 연결되면 성과표부터 읽어요." },
  { id: "ops", name: "운영팀", short: "ops.team", icon: "🗂️", liveGroups: ["운영팀"],
    task: "조사·자료 정리 · 안내서·FAQ 작성", report: "출처를 붙여 정리하고 미미르에 남겨요." },
  { id: "legal", name: "법무팀", short: "legal.team", icon: "⚖️", liveGroups: ["법무팀"],
    task: "계약서·NDA 조항 검토", report: "불리한 조항과 빠진 조건을 표로 정리해요." },
  { id: "sec", name: "보안팀", short: "sec.team", icon: "🛡️", liveGroups: ["보안팀"],
    task: "코드·설정 보안 점검 · 권한 누락 검토", report: "전문 자동 검사는 도구 연결 뒤에 돌려요." },
  { id: "aios", name: "AI-OS 운영", short: "aios.ops", icon: "🛠️", liveGroups: ["AI-OS 관리"],
    task: "에이전트·스킬 점검 · 멈춘 작업 원인 조사", report: "끊어진 연결과 중복 기능을 정리했어요." },
  { id: "hermes", name: "헤르메스", short: "hermes.hq", icon: "⚡", liveGroups: ["헤르메스", "공통", "기타", "프로젝트"],
    task: "Slack 요청 접수 → 프로젝트 PM 전달 · 결과 회수·보고", report: "누가 맡았고 어디까지 됐는지 한 줄로 남겨요." },
] as const;

/**
 * 부서 동 3개 — 공유 부서 9개를 큰 섬 3개에 나눠 넣습니다 (섬 하나에 부서 방 3개).
 * 순서대로 왼쪽 아래 · 오른쪽 위 · 오른쪽 아래 섬에 놓입니다.
 */
export const WINGS = [
  { id: "make", name: "제작동", icon: "🏗️", depts: ["dev", "plan", "design"] },
  { id: "admin", name: "관리동", icon: "🏛️", depts: ["legal", "sec", "aios"] },
  { id: "grow", name: "성장동", icon: "🌱", depts: ["mkt", "ad", "ops"] },
] as const;

/** 미미르 — 사무실 한가운데. 직원이 아니라 회사 기억(방)입니다. */
export const MIMIR = { id: "mimir", name: "미미르", short: "mimir.memory", icon: "🧠" } as const;

/**
 * 직원 명단 — Hermes 프로필 id 를 callsign 으로.
 * dept = 위 부서 id / rank: "lead"(팀장) 또는 "member"(팀원)
 * colors = [머리색, 옷색, 포인트색]
 * thoughts = 자리를 비웠을 때 머리 위에 뜨는 혼잣말
 */
export type StaffEntry = {
  dept: string;
  rank: "lead" | "member";
  name: string;
  role: string;
  colors: [string, string, string];
  thoughts: string[];
  callsign?: string;
  /** 프로젝트 PM 이면 그 프로젝트 id — 윗줄 프로젝트 방에 앉습니다 */
  project?: string;
};

export const STAFF_LIST: StaffEntry[] = [
  // 개발팀
  { dept: "dev", rank: "lead", name: "개발PM", callsign: "devpm", role: "업무 접수·분담·검수 조율",
    colors: ["#2f2a3d", "#c9b8ff", "#b8f0dd"], thoughts: ["재현부터 하고 고친다.", "검수 없이 완료라고 안 해요."] },
  { dept: "dev", rank: "member", name: "코더", callsign: "devcoder", role: "기능 구현·수정·리팩터링",
    colors: ["#6b3d34", "#b8f0dd", "#ff8fc0"], thoughts: ["테스트 먼저 쓰고 구현.", "이 함수, 이름부터 바꾸자."] },
  { dept: "dev", rank: "member", name: "리뷰어", callsign: "devreview", role: "코드 품질·요구사항·보안 검토",
    colors: ["#463227", "#fff3b0", "#c9b8ff"], thoughts: ["요구사항이랑 다르면 되돌려요.", "비밀값이 코드에 있는지 본다."] },
  { dept: "dev", rank: "member", name: "QA", callsign: "devqa", role: "실행 검증·시나리오 테스트·버그 재현",
    colors: ["#2d4b46", "#ffe6f2", "#b8f0dd"], thoughts: ["실기기에서 한 번 더.", "재현 안 되면 완료 아니에요."] },

  // 기획팀
  { dept: "plan", rank: "lead", name: "기획PM", callsign: "planpm", role: "기획 접수·범위 정리",
    colors: ["#c26e4b", "#ff8fc0", "#fff3b0"], thoughts: ["범위부터 자르자.", "해결할 문제가 뭐였지?"] },
  { dept: "plan", rank: "member", name: "프로덕트", callsign: "planproduct", role: "제품 방향·우선순위·성공 기준",
    colors: ["#7b4a2f", "#b8f0dd", "#ff8fc0"], thoughts: ["성공 기준 없는 기능은 보류.", "최소 기능으로 먼저 검증."] },
  { dept: "plan", rank: "member", name: "스펙", callsign: "planspec", role: "요구사항·작업 분해·구현 순서",
    colors: ["#2c2638", "#fff3b0", "#c9b8ff"], thoughts: ["미미르에 비슷한 결정 있었나?", "작업 단위는 반나절 이하로."] },

  // 디자인팀
  { dept: "design", rank: "lead", name: "디자인PM", callsign: "designpm", role: "디자인 업무 조율",
    colors: ["#5a3450", "#c9b8ff", "#ff8fc0"], thoughts: ["흐름 먼저, 색은 나중.", "모바일부터 본다."] },
  { dept: "design", rank: "member", name: "UX", callsign: "designux", role: "사용자 여정·화면 흐름·접근성",
    colors: ["#372b4a", "#ffe6f2", "#c9b8ff"], thoughts: ["헷갈리는 단계가 어디지?", "버튼 하나 줄이자."] },
  { dept: "design", rank: "member", name: "브랜드", callsign: "designbrand", role: "브랜드 방향·톤·비주얼 체계",
    colors: ["#9c5c72", "#fff3b0", "#ff8fc0"], thoughts: ["글꼴 체계부터 정리.", "우리 톤에서 벗어났어요."] },

  // 마케팅팀
  { dept: "mkt", rank: "lead", name: "마케팅PM", callsign: "mktpm", role: "콘텐츠 업무 조율",
    colors: ["#8b534a", "#fff3b0", "#ff8fc0"], thoughts: ["고객별 핵심 메시지 하나씩.", "초안까지만, 게시는 대표가."] },
  { dept: "mkt", rank: "member", name: "라이터", callsign: "mktwriter", role: "콘텐츠 초안 작성",
    colors: ["#33304a", "#ff8fc0", "#b8f0dd"], thoughts: ["첫 문장에서 걸려야 해.", "긴 자료를 세 줄로."] },
  { dept: "mkt", rank: "member", name: "SEO", callsign: "mktseo", role: "키워드·검색 최적화",
    colors: ["#5d3a2c", "#b8f0dd", "#c9b8ff"], thoughts: ["검색어부터 다시 본다.", "제목에 키워드 하나만."] },
  { dept: "mkt", rank: "member", name: "에디터", callsign: "mktedit", role: "구조 편집·문장 다듬기",
    colors: ["#3a2f4d", "#ffe6f2", "#fff3b0"], thoughts: ["어색한 문장 걷어내는 중.", "결론을 앞으로."] },

  // 광고팀
  { dept: "ad", rank: "lead", name: "광고PM", callsign: "adpm", role: "광고 업무 조율",
    colors: ["#313b56", "#fff3b0", "#fff3b0"], thoughts: ["성과표가 와야 시작해요.", "계정 연결 전엔 숫자 안 만듭니다."] },
  { dept: "ad", rank: "member", name: "구글광고", callsign: "adgoogle", role: "Google 광고 계정·전환 점검",
    colors: ["#4b3b2c", "#b8f0dd", "#c9b8ff"], thoughts: ["전환 태그부터 확인.", "계정 권한 대기 중."] },
  { dept: "ad", rank: "member", name: "메타광고", callsign: "admeta", role: "Meta 광고 계정·타겟 점검",
    colors: ["#2e3a4a", "#ffe6f2", "#b8f0dd"], thoughts: ["타겟 겹침 확인.", "픽셀 이벤트 확인 필요."] },
  { dept: "ad", rank: "member", name: "예산분석", callsign: "adbudget", role: "예산·입찰·성과 분석",
    colors: ["#6b4a2f", "#c9b8ff", "#fff3b0"], thoughts: ["과다 소진 항목부터.", "광고비 대비 성과 비교."] },
  { dept: "ad", rank: "member", name: "소재검토", callsign: "adcreative", role: "소재 품질·성과 신호 검토",
    colors: ["#573049", "#fff3b0", "#ff8fc0"], thoughts: ["이미지 3안 비교.", "영상 첫 3초."] },
  { dept: "ad", rank: "member", name: "카피", callsign: "adcopy", role: "광고 문구 작성",
    colors: ["#7a3f58", "#c9b8ff", "#ff8fc0"], thoughts: ["문구 다섯 안.", "단정형으로 닫자."] },
  { dept: "ad", rank: "member", name: "정책검토", callsign: "adpolicy", role: "정책·심사 위험 점검",
    colors: ["#274a44", "#b8f0dd", "#b8f0dd"], thoughts: ["심사 반려 위험 체크.", "금칙 표현 스캔."] },

  // 운영팀
  { dept: "ops", rank: "lead", name: "운영PM", callsign: "oppm", role: "운영 업무 조율",
    colors: ["#3b3b49", "#b8f0dd", "#b8f0dd"], thoughts: ["자료 취합부터.", "인수인계 문서 남기자."] },
  { dept: "ops", rank: "member", name: "문서", callsign: "opdoc", role: "안내문·기술 문서 작성",
    colors: ["#334a3a", "#ffe6f2", "#fff3b0"], thoughts: ["직원용 안내서 초안.", "FAQ 다섯 개."] },
  { dept: "ops", rank: "member", name: "큐레이터", callsign: "opcurator", role: "자료 정리·지식 관리",
    colors: ["#7a453c", "#c9b8ff", "#c9b8ff"], thoughts: ["미미르에 정리해서 넣자.", "중복 자료 합치는 중."] },
  { dept: "ops", rank: "member", name: "리서치", callsign: "opresearch", role: "조사·근거 수집·비교 분석",
    colors: ["#8a4a3c", "#b8f0dd", "#ff8fc0"], thoughts: ["출처 없는 건 안 써요.", "경쟁사 비교표."] },

  // 법무팀
  { dept: "legal", rank: "lead", name: "법무PM", callsign: "legalpm", role: "법무 업무 조율",
    colors: ["#563a32", "#b8f0dd", "#b8f0dd"], thoughts: ["검토할 계약서가 오면 시작.", "위험도 순서로."] },
  { dept: "legal", rank: "member", name: "계약검토", callsign: "legalcontract", role: "계약 검토·협상 지원",
    colors: ["#452d3f", "#c9b8ff", "#fff3b0"], thoughts: ["불리한 조항 표시 중.", "만료일 정리."] },
  { dept: "legal", rank: "member", name: "법률자문", callsign: "legalteam", role: "법률 문서·자문 지원",
    colors: ["#3c3a4f", "#ffe6f2", "#c9b8ff"], thoughts: ["NDA 주의사항 정리.", "회사 기준과 비교."] },

  // 보안팀
  { dept: "sec", rank: "lead", name: "보안PM", callsign: "secpm", role: "보안 업무 조율",
    colors: ["#2d4b46", "#b8f0dd", "#b8f0dd"], thoughts: ["점검 항목부터 정리.", "도구 연결 확인 필요."] },
  { dept: "sec", rank: "member", name: "침해대응", callsign: "secteam", role: "침해 대응·포렌식 지원",
    colors: ["#463227", "#ffe6f2", "#b8f0dd"], thoughts: ["로그부터 보존.", "영향 범위 먼저."] },
  { dept: "sec", rank: "member", name: "취약점검토", callsign: "secsec", role: "취약점·코드 보안 검토",
    colors: ["#6c3a55", "#c9b8ff", "#fff3b0"], thoughts: ["비밀정보 노출 검사.", "권한 누락 체크."] },

  // AI-OS 운영 (PM 은 윗줄 AI-OS 관리 프로젝트 방에)
  { dept: "aios", rank: "lead", name: "운영배포", callsign: "aiosops", role: "운영·배포·권한 관리",
    colors: ["#3b3b49", "#b8f0dd", "#b8f0dd"], thoughts: ["실행 신호 3분 없으면 확인.", "권한 변경은 대표 승인 뒤."] },
  { dept: "aios", rank: "member", name: "운영분석", callsign: "aiosanalyst", role: "운영 분석",
    colors: ["#2e3a4a", "#ffe6f2", "#b8f0dd"], thoughts: ["보고 누락 원인 조사.", "중복 기능 목록."] },
  { dept: "aios", rank: "member", name: "전략", callsign: "aiosstrat", role: "도입·운영 전략",
    colors: ["#5d3a2c", "#fff3b0", "#c9b8ff"], thoughts: ["새 도구 비교표.", "도입 효과 vs 유지비."] },

  // 프로젝트 PM — 윗줄 프로젝트 방 (project 로 지정)
  { dept: "pm", rank: "lead", name: "DMmate PM", callsign: "replypm", role: "DMmate 담당 · 요청 접수·부서 배정", project: "dmmate",
    colors: ["#313b56", "#c9b8ff", "#b8f0dd"], thoughts: ["댓글 → DM 흐름 확인.", "메시지를 잇는 우체국."] },
  { dept: "pm", rank: "member", name: "골프 PM", callsign: "acepm", role: "ACE 인도어골프 담당", project: "golf",
    colors: ["#2d4b46", "#b8f0dd", "#fff3b0"], thoughts: ["그린 클럽하우스 예약 현황.", "현장 사진 판독 결과 확인."] },
  { dept: "pm", rank: "member", name: "바베큐 PM", callsign: "bbqpm", role: "바베큐국립공원 담당", project: "bbq",
    colors: ["#8b534a", "#fff3b0", "#ff8fc0"], thoughts: ["숲속 캠프 시즌 준비.", "인스타 실적 확인."] },
  { dept: "pm", rank: "member", name: "하하 PM", callsign: "hahapm", role: "하하팩토리 담당", project: "haha",
    colors: ["#c26e4b", "#ff8fc0", "#fff3b0"], thoughts: ["아이디어 작업장 정리.", "제작 일정 확인."] },
  { dept: "pm", rank: "member", name: "디토크 PM", callsign: "ditalkpm", role: "디토크 담당", project: "ditalk",
    colors: ["#9c5c72", "#ffe6f2", "#c9b8ff"], thoughts: ["이야기가 모이는 스튜디오.", "회의 요약 확인."] },
  { dept: "pm", rank: "member", name: "AI-OS PM", callsign: "aiospm", role: "AI-OS 관리 담당 · 에이전트 운영 조율", project: "aiosctl",
    colors: ["#372b4a", "#c9b8ff", "#c9b8ff"], thoughts: ["멈춘 작업 원인부터.", "깨진 스킬 연결 정리."] },
  // 행성이 없는 프로젝트 담당 — 헤르메스 방에 앉습니다
  { dept: "hermes", rank: "member", name: "AI Council", callsign: "councilpm", role: "AI Council 담당",
    colors: ["#372b4a", "#c9b8ff", "#b8f0dd"], thoughts: ["회의 기록 → 할 일.", "화자별 발언 정리."] },
  { dept: "hermes", rank: "member", name: "리워드", callsign: "rewardpm", role: "리워드드로우 담당",
    colors: ["#6b4a2f", "#b8f0dd", "#ff8fc0"], thoughts: ["추첨 규칙 확인.", "참여 데이터 정리."] },
  { dept: "hermes", rank: "member", name: "보드", callsign: "boardpm", role: "Planning Board 담당",
    colors: ["#33304a", "#fff3b0", "#c9b8ff"], thoughts: ["보드 카드 정리.", "결정사항 미미르에."] },
  { dept: "hermes", rank: "member", name: "바로열기", callsign: "openitpm", role: "바로열기 담당",
    colors: ["#463227", "#ffe6f2", "#b8f0dd"], thoughts: ["변환 프로세스 점검.", "ngrok 상태 확인."] },

  // 헤르메스 (접수·분담·보고) + 공통·검토 프로필
  { dept: "hermes", rank: "lead", name: "헤르메스", callsign: "hermes", role: "요청 접수·업무 분담·결과 회수·보고",
    colors: ["#2b1c26", "#fff3b0", "#ff8fc0"], thoughts: ["누가 맡았고 어디까지 됐는지.", "막힌 이유는 사용자 언어로.", "완료와 보고 전달은 다른 일."] },
  { dept: "hermes", rank: "member", name: "공통", callsign: "default", role: "기본 프로필 · 요약·번역·표 정리",
    colors: ["#3c3a4f", "#ffe6f2", "#c9b8ff"], thoughts: ["긴 글 요약 중.", "적합한 부서 제안."] },
  { dept: "hermes", rank: "member", name: "검토", callsign: "reviewer", role: "검토 프로필 · 누락·모순 탐지",
    colors: ["#5a3450", "#c9b8ff", "#fff3b0"], thoughts: ["기준과 비교 중.", "추가 확인 질문 정리."] },
];

/**
 * 외부 연결이 아직 안 된 부서 → 화면에 "차단"으로 표시됩니다.
 * (Hermes Desk: 광고팀 "데이터 필요", 보안팀 "전문 도구 연결 검증 필요")
 * 다 연결됐거나 전부 초록불로 보고 싶으면 빈 객체 {} 로 두세요.
 */
export const PENDING_INTEGRATIONS: Record<string, string> = {
  ad: "Google·Meta 광고 계정 + 성과표 연결",
  sec: "보안 자동 검사 도구 연결",
};

/** 차단 부서가 멈춰 있는 진짜 이유 (지시창에서 "왜 늦어져?"에 답할 때) */
export const BLOCK_REASONS: Record<string, string> = {
  ad: "광고 계정과 성과표가 아직 연결되지 않아 숫자를 읽을 수 없어요. 없는 성과를 만들지는 않습니다. 연결만 되면 바로 분류합니다.",
  sec: "전문 자동 검사 도구가 연결되지 않았어요. 점검 항목 정리는 해두었고, 도구가 붙으면 실제 검사를 돌립니다.",
};

/**
 * 오늘의 시나리오 — Slack에서 들어온 요청 1건.
 * 라이브 오피스 시나리오(접수 → 분담 → 미미르 조회 → 검토 차단 → 대표 확인 → 완료)에 그대로 쓰입니다.
 */
export const REQUEST = {
  /** 요청이 들어온 프로젝트 id (PROJECTS 의 id) */
  project: "dmmate",
  channel: "#dmmate",
  requester: "대표",
  /** 요청 한 줄 */
  text: "댓글 키워드별로 다른 DM 답장을 보내는 화면을 만들어줘",
  /** 헤르메스가 나눈 세부 업무 */
  tasks: {
    plan: "요청을 기능 목록·작업 단위로 분해",
    design: "키워드별 답장 설정 화면 시안",
    dev: "키워드 분기 로직 구현·검수",
    qa: "실기기 시나리오 테스트",
    mkt: "새 기능 안내 문구 초안",
    ops: "사용 안내서·FAQ 정리",
    aios: "실행 기록·보고 경로 점검",
  },
};

/**
 * 검토 중 막힌 안건 — 대표가 결정해야 다음으로 넘어갑니다.
 * ceo.approval 카드와 회의 대사에 그대로 표시됩니다.
 */
export const DECISION = {
  tag: "검토 차단",
  title: "Instagram API 발송 권한을 새 화면에 허용할까요?",
  summary: "리뷰어가 검토 중 막았어요. 새 화면이 실제 DM 발송 권한을 쓰게 되므로 대표 확인 없이는 진행하지 않습니다.",
  reasons: ["① 실제 DM 발송 권한 사용", "② 키워드 오탐 시 잘못된 답장 위험", "③ 승인 후 QA에서 실기기 검증"],
  approveLabel: "권한 허용 · 계속 진행",
};

/**
 * 대시보드 integrations.link 창에 표시할 연결 목록.
 * 이 껍데기에는 실제 연결이 없으므로 전부 "미설정"으로 표시됩니다.
 * 연결 안 된 걸 연결됐다고 표시하지 않는 것이 원칙입니다.
 */
export const INTEGRATIONS: Record<string, { configured: boolean; label: string; need?: string }> = {
  slack: { configured: false, label: "Slack 요청·보고", need: "Hermes gateway profile_routes" },
  mimir: { configured: false, label: "미미르 기억", need: "~/.company-memory/ledger.db" },
  kanban: { configured: false, label: "작업 보드", need: "~/.hermes/kanban.db" },
  ad: { configured: false, label: "광고 계정", need: "Google·Meta 광고 계정 + 성과표" },
};

/** 미미르가 모으는 데이터 원천 (Hermes Desk ecosystem.py SOURCES) — 미미르 방 상세와 대시보드에 표시 */
export const MIMIR_SOURCES = [
  "Gmail", "Google Drive", "문서·글자 추출", "현장 사진 판독", "Google 캘린더", "인스타 실적", "사이트 실적", "카카오톡",
  "Slack", "AI Council", "Claude Code", "ChatGPT / GPT", "텔레그램·터미널", "에이전트 작업", "프로젝트 지식", "직접 넣은 자료",
];

/** 결과물 창고에 보여줄 최근 결과 (파일은 실제 등록된 것만 넣으세요) */
export const RESULTS: { title: string; dept: string; status: string; href?: string }[] = [
  { title: "게시물별 키워드 분기 기능", dept: "dev", status: "최종 완료" },
  { title: "Meta 앱 심사 요청 자료", dept: "ops", status: "최종 완료" },
];

/**
 * 완료 보고를 받을 서버 주소. 비워두면 발행 버튼이 "미설정"으로 동작하고
 * 보고서 본문은 브라우저 콘솔에만 남습니다.
 * 채우면 보고서 JSON을 이 주소로 POST 합니다.
 */
export const REPORT_ENDPOINT = "";

/**
 * 실시간 연결 — Hermes Desk(server.py)의 /api/operations 를 읽어 실제 작업 기록으로 캐릭터를 움직입니다.
 * 개발 서버에서만 동작합니다: `HERMES_DESK_URL=http://127.0.0.1:64729 npm run dev`
 * (vite.config.ts 가 /hermes 경로를 그 주소로 중계하고 Origin 을 맞춰 줍니다)
 * 연결이 없으면 시나리오 모드로 동작합니다.
 */
export const LIVE = {
  /** 중계 경로 — vite.config.ts 와 같아야 합니다 */
  base: "/hermes",
  /** 조회 간격(ms). Hermes Desk 자체는 3초 갱신 */
  pollMs: 3000,
};

/** 결과 보관함 링크 (Notion 등). 비워두면 화면에서 링크 버튼이 숨겨집니다. */
export const STORAGE_LINK = "";

/** 화면 맨 아래 크레딧. 픽셀 오피스 원본 UI는 갓생맘(@godseng.mom)이 만들어 배포한 것입니다. */
export const FOOTER = {
  line1: "픽셀 오피스 원본 UI는 갓생맘 🎀이 만들었어요 · 부서·흐름은 Hermes Desk 기준",
  linkLabel: "📷 @godseng.mom — 더 많은 크리에이터 툴 보러가기 →",
  linkHref: "https://www.instagram.com/godseng.mom/",
  line3: "© godseng.mom · 자유롭게 쓰되 무단 재판매 금지",
};
