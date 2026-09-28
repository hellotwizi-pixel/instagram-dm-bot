// 라이브 오피스 시뮬레이션 엔진
// 직원 상태머신 + A* 이동 + 회의 엔진 + Hermes 요청 처리 시나리오 + 실시간(Hermes Desk) 반영

import { findPath } from "./pathfinding";
import { BLOCK_NEED, CEO, DEPT_BRIEF, DEPT_BY_LIVE_GROUP, DEPT_LEAD, PROJECT_PM, STAFF, STAFF_BY_CALLSIGN, type StaffSeed } from "./staff";
import {
  CEO_REPORT_SPOT,
  CEO_SEAT,
  COLS,
  DEPT_ROOMS,
  ENTRANCE,
  LOUNGE_ROOM,
  MEETING_SEATS,
  MEETING_TABLE_Y,
  MIMIR_SPOT,
  PROJECT_ROOMS,
  doorApproach,
  projectSpot,
  roomOf,
  walkable,
  type Pt,
} from "./world";
import { BLOCK_REASONS, DECISION, MIMIR_SOURCES, PROJECTS, REQUEST } from "../../company.config";

/** Hermes Desk 범례와 같은 다섯 상태: ● 작업 중 ◆ 확인 필요 ■ 차단 ○ 대기 + 완료 */
export type DeptStatus = "완료" | "작업 중" | "확인 필요" | "차단" | "대기";
export type AgentStatus =
  | "출근 전"
  | "출근 중"
  | "대기"
  | "이동 중"
  | "업무 중"
  | "회의 중"
  | "보고 중"
  | "조회 중"
  | "휴식"
  | "확인 필요"
  | "차단";
export type Anim = "idle" | "walk" | "type" | "talk" | "sit";
export type Facing = "up" | "down" | "left" | "right";

const WALK_SPEED = 3.6; // tiles / sec
/**
 * 사내 시계는 '시뮬레이션 시간' 기준으로 흐른다 — 시뮬 1초 = 1.6분.
 * 배속을 올리면 시계도 같이 빨라지므로, 몇 배속으로 보든 하루는 07:00 → 약 17:00으로 끝난다.
 */
const SIM_MIN_PER_SEC = 0.95;
/** ⏭ 건너뛰기(터보)일 때의 배속 */
const TURBO_SPEED = 10;

type Action =
  | { k: "walk"; to: Pt }
  | { k: "say"; text: string; dur: number; kind: "talk" | "think" }
  | { k: "wait"; dur: number }
  | { k: "face"; dir: Facing }
  | { k: "anim"; a: Anim }
  | { k: "status"; s: AgentStatus }
  | { k: "work"; dur: number; label: string }
  | { k: "fn"; fn: () => void };

export type Agent = {
  id: string;
  name: string;
  callsign?: string;
  role: string;
  deptId: string;
  rank: StaffSeed["rank"];
  hair: string;
  shirt: string;
  accent: string;
  skin: string;
  thoughts: string[];

  x: number;
  y: number;
  facing: Facing;
  /** 바라보는 각도(라디안, +z 가 0). 걷는 동안 연속으로 바뀐다 */
  heading: number;
  anim: Anim;
  status: AgentStatus;
  home: Pt;
  progress: number;
  taskLabel: string;

  path: Pt[];
  pathIdx: number;
  blockedFor: number;
  queue: Action[];
  current: Action | null;
  timer: number;
  speech: string | null;
  speechKind: "talk" | "think";
  speechFor: number;
  idleFor: number;
  /** 렌더링에서 겹침을 줄이는 미세 오프셋 */
  jitter: number;
  /** 실시간 모드에서 마지막으로 반영한 상태 키 (같으면 다시 지시하지 않음) */
  liveKey: string;
  /** 지금 맡은 프로젝트 id — 이름표가 이 프로젝트 색으로 칠해진다 (PM 은 고정) */
  project: string | null;
  /** 실시간 모드에서 이 직원이 남긴 마지막 기록 원문 (완료 요약·진행 메모·차단 사유·요청) */
  note: { kind: string; text: string; time: string } | null;
};

export type LogEntry = { id: number; time: string; icon: string; text: string; tone: string };
/** 대표 지시창 대화 */
export type ChatEntry = {
  id: number;
  time: string;
  from: "ceo" | "staff";
  name: string;
  text: string;
};

type Slot = {
  gen: Generator<number | (() => boolean), void, void> | null;
  wait: number;
  until: (() => boolean) | null;
};

/** Hermes Desk /api/operations 응답 중 화면에 쓰는 부분 */
export type LiveTask = {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  group: string;
  role?: string;
  reason?: string;
  heartbeatStale?: boolean;
  progressStale?: boolean;
  created_at?: number;
  lastProgressAt?: number | null;
};
export type LiveEvent = {
  id: number;
  task_id: string;
  kind: string;
  created_at: number;
  assignee?: string | null;
  title?: string;
  detail?: string;
};
export type LiveOps = {
  checked: number;
  cursor: number;
  tasks: LiveTask[];
  events: LiveEvent[];
  liveAgents?: { profile: string; state: string; tool?: string | null }[];
  requests?: { id: string; state: string; profile?: string; done: number; total: number }[];
  history?: boolean;
};
/** Hermes Desk /api/slack 응답 중 화면에 쓰는 부분 — Slack 에 기록된 요청과 보고 전달 */
export type LiveSlack = {
  checked?: number;
  conversations: {
    id: string;
    channel?: string;
    profile?: string | null;
    title?: string;
    /** Hermes Desk 가 정리한 짧은 제목 (enrich_report) */
    summary?: string;
    requestText?: string;
    user?: string | null;
    taskIds?: string[];
    state?: string;
    done?: number;
    reportedDone?: number;
    lastAt?: number;
  }[];
};

export type LiveInfo = {
  on: boolean;
  connected: boolean;
  checked: number | null;
  error: string;
  requests: number;
  tasks: number;
};

export type Snapshot = {
  clock: string;
  running: boolean;
  paused: boolean;
  speed: number;
  turbo: boolean;
  dayComplete: boolean;
  phase: string;
  phaseIndex: number;
  approvalPending: boolean;
  approved: boolean;
  briefingReady: boolean;
  deptStatus: Record<string, DeptStatus>;
  /** 프로젝트 방 상태 (윗줄) */
  projectStatus: Record<string, DeptStatus>;
  counts: Record<AgentStatus, number>;
  stats: { done: number; working: number; approval: number; blocked: number };
  log: LogEntry[];
  meetingTitle: string | null;
  chat: ChatEntry[];
  focusMode: boolean;
  spotlight: string | null;
  busyWithOrder: boolean;
  live: LiveInfo;
};

/** 하루 단계 — Hermes 요청 처리 흐름 (접수 → 분담 → 미미르 조회 → 검토 차단 → 대표 확인 → 완료 → 보고) */
const PHASES = [
  "출근 대기",
  "07:00 전사 출근",
  "Slack 요청 → 프로젝트",
  "PM 업무 분담",
  "기획 · 미미르 조회",
  "디자인 · 개발 병행",
  "검토 차단 · 대표 확인",
  "QA 실기기 검증",
  "마케팅 · 운영 · AI-OS",
  "PM 결과 회수",
  "헤르메스 보고",
  "업무 종료",
];
/** 대표 결정 단계 / 보고 단계 인덱스 (렌더러 카메라가 참조) */
export const DECISION_PHASE = 6;
export const REPORT_PHASE = 10;

const BLOCKED_DEPTS = new Set(Object.keys(BLOCK_NEED));

/** 차단 부서가 멈춰 있는 진짜 이유 */
const BLOCK_REASON: Record<string, string> = BLOCK_REASONS;

/** 검토 차단 회의에 들어가는 3명 — 개발PM · 리뷰어 · 헤르메스 */
export const APPROVERS = ["dev-lead", "devreview", "hermes-lead"];

/** 지시창에서 부서를 찾을 때 쓰는 키워드 — 구체적인 것부터 검사한다 */
const DEPT_KEYWORDS: [string, string[]][] = [
  ...PROJECTS.map((p) => [p.id, [p.name.toLowerCase(), ...p.aliases]] as [string, string[]]),
  ["aios", ["ai-os 운영", "aios 운영", "에이전트 관리", "스킬", "게이트웨이"]],
  ["mimir", ["미미르", "기억", "자료실", "원천", "데이터 연결"]],
  ["hermes", ["헤르메스", "비서", "분담", "접수"]],
  ["dev", ["개발", "코드", "버그", "구현", "리뷰", "qa", "검수"]],
  ["plan", ["기획", "스펙", "요구사항", "우선순위"]],
  ["design", ["디자인", "ux", "화면 흐름", "브랜드"]],
  ["mkt", ["마케팅", "콘텐츠", "seo", "게시물", "소개글"]],
  ["ad", ["광고", "예산", "소재", "메타", "구글 광고"]],
  ["ops", ["운영팀", "문서", "안내서", "faq", "조사", "리서치"]],
  ["legal", ["법무", "계약", "nda", "조항"]],
  ["sec", ["보안", "취약점", "침해", "권한 검토"]],
  ["golf", ["골프"]],
  ["bbq", ["바베큐"]],
  ["haha", ["하하"]],
  ["ditalk", ["디토크"]],
  ["dmmate", ["dm", "디엠"]],
  ["aiosctl", ["ai-os 관리", "aios 관리"]],
];
const PROJECT_IDS = new Set<string>(PROJECTS.map((p) => p.id));

/** Hermes 작업 상태 → 화면 표현 (office.js 와 같은 기준) */
const LIVE_ACTIVE = new Set(["running", "in_progress", "claimed"]);
const LIVE_TERMINAL = new Set(["done", "archived"]);
const LIVE_EVENT_NAMES: Record<string, string> = {
  created: "업무 접수",
  assigned: "담당 배정",
  spawned: "실행 시작",
  claimed: "업무 인수",
  completed: "결과 회수",
  blocked: "도움 요청",
  crashed: "실행 오류",
  timed_out: "시간 초과",
  commented: "진행 메모",
  review_requested: "검수 요청",
  unblocked: "차단 해제",
  attached: "결과물 추가",
};

/** 기록 원문을 말풍선용 한 줄로 — 첫 문장, 최대 48자. 내용을 지어내지 않는다 */
function firstLine(text: string, max = 48): string {
  const line = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?。])\s|\n/)[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 헤르메스 이름 — 지시창 답변의 발신자 */
const HERMES = DEPT_LEAD.hermes?.name ?? "헤르메스";

export class Company {
  agents: Agent[] = [];
  agentById = new Map<string, Agent>();
  deptStatus: Record<string, DeptStatus> = {};
  projectStatus: Record<string, DeptStatus> = {};
  log: LogEntry[] = [];
  clockMinutes = 7 * 60;
  /** 재생 속도 — 시뮬레이션 전체(걷기·업무·대사)를 함께 배속한다. 실제 외부 작업 속도와는 무관 */
  speed = 2;
  turbo = false;
  paused = false;
  running = false;
  dayComplete = false;
  phaseIndex = 0;
  approvalPending = false;
  approved = false;
  briefingReady = false;
  meetingTitle: string | null = null;
  onBriefing: (() => void) | null = null;
  /** 대표 지시창 */
  chat: ChatEntry[] = [];
  focusMode = false;
  spotlight: string | null = null;
  /** 실시간(Hermes Desk) 연결 상태 */
  live: LiveInfo = { on: false, connected: false, checked: null, error: "", requests: 0, tasks: 0 };

  private spotlightUntil = 0;
  private elapsed = 0;
  private approvalSince: number | null = null;
  private logSeq = 0;
  /** 하루 시나리오(main)와 대표 지시로 끼어드는 장면(side)을 각각 돌린다 */
  private main: Slot = { gen: null, wait: 0, until: null };
  private side: Slot = { gen: null, wait: 0, until: null };
  private occupancy = new Set<number>();
  private seatBook = new Map<string, Pt>();
  /** 시나리오 장면에 참여 중인 직원 — 자율 행동(커피·잡담)이 끼어들지 못하게 잠근다 */
  private locked = new Set<string>();
  /** 실시간 모드에서 헤르메스가 배달할 경로 (부서 id) */
  private courierQueue: { deptId: string; label: string; returning: boolean }[] = [];
  private liveTaskById = new Map<string, LiveTask>();

  constructor() {
    this.reset();
  }

  reset() {
    this.agents = [];
    this.agentById.clear();
    this.log = [];
    this.logSeq = 0;
    this.clockMinutes = 7 * 60;
    this.running = false;
    this.paused = false;
    this.dayComplete = false;
    this.phaseIndex = 0;
    this.approvalPending = false;
    this.approved = false;
    this.briefingReady = false;
    this.meetingTitle = null;
    this.main = { gen: null, wait: 0, until: null };
    this.side = { gen: null, wait: 0, until: null };
    this.seatBook.clear();
    this.locked.clear();
    this.chat = [];
    this.focusMode = false;
    this.spotlight = null;
    this.spotlightUntil = 0;
    this.elapsed = 0;
    this.approvalSince = null;
    this.courierQueue = [];
    this.liveTaskById.clear();

    const seats = new Map<string, Pt[]>();
    for (const room of [...DEPT_ROOMS, ...PROJECT_ROOMS]) seats.set(room.id, room.desks.map((d) => d.seat));

    for (const seed of STAFF) {
      // PM 은 프로젝트 방, 나머지는 부서 방. 방이 없는 부서(pm 인데 행성 없음)는 헤르메스 방으로
      const roomId = seed.project ?? (seats.has(seed.deptId) ? seed.deptId : "hermes");
      const pool = seats.get(roomId);
      const home = pool?.shift() ?? rand(roomOf(roomId).loiter);
      this.spawn(seed, home, { x: ENTRANCE.x, y: ENTRANCE.y });
    }
    this.spawn(CEO, CEO_SEAT, CEO_SEAT);

    const ceo = this.agentById.get("ceo")!;
    ceo.status = "업무 중";
    ceo.anim = "sit";
    ceo.facing = "down";

    for (const room of DEPT_ROOMS) {
      this.deptStatus[room.id] = BLOCKED_DEPTS.has(room.id) ? "차단" : "대기";
    }
    this.deptStatus.mimir = "대기";
    for (const project of PROJECTS) this.projectStatus[project.id] = "대기";
    this.pushLog("👑", "대표실 준비 완료. 출근 버튼을 기다리는 중이에요.", "lav");
    this.pushChat("staff", HERMES, `대표님, ${HERMES}입니다. 누가 맡았고 어디까지 됐는지 여기서 바로 물어보세요.`);
  }

  private spawn(seed: StaffSeed, home: Pt, at: Pt) {
    const agent: Agent = {
      ...seed,
      x: at.x,
      y: at.y,
      facing: "down",
      heading: 0,
      anim: seed.rank === "ceo" ? "sit" : "idle",
      status: seed.rank === "ceo" ? "업무 중" : "출근 전",
      home,
      progress: 0,
      taskLabel: DEPT_BRIEF[seed.deptId]?.task ?? "대표 업무",
      path: [],
      pathIdx: 0,
      blockedFor: 0,
      queue: [],
      current: null,
      timer: 0,
      speech: null,
      speechKind: "talk",
      speechFor: 0,
      idleFor: Math.random() * 8,
      jitter: (Math.random() - 0.5) * 0.28,
      liveKey: "",
      project: seed.project ?? null,
      note: null,
    };
    this.agents.push(agent);
    this.agentById.set(agent.id, agent);
  }

  // ── 로그 ────────────────────────────────────────────────
  pushLog(icon: string, text: string, tone = "pink") {
    this.log.unshift({ id: this.logSeq++, time: this.clockText(), icon, text, tone });
    if (this.log.length > 60) this.log.pop();
  }

  clockText() {
    const total = Math.floor(this.clockMinutes) % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // ── 액션 큐 ──────────────────────────────────────────────
  private enqueue(agent: Agent, ...actions: Action[]) {
    agent.queue.push(...actions);
  }

  private goto(agent: Agent, to: Pt, status: AgentStatus = "이동 중") {
    this.enqueue(agent, { k: "status", s: status }, { k: "walk", to });
  }

  private sitAtDesk(agent: Agent) {
    this.enqueue(
      agent,
      { k: "walk", to: agent.home },
      { k: "face", dir: "up" },
      { k: "anim", a: "sit" },
      { k: "status", s: "대기" },
    );
  }

  say(agent: Agent, text: string, dur = 2.6, kind: "talk" | "think" = "talk") {
    agent.speech = text;
    agent.speechKind = kind;
    agent.speechFor = dur;
  }

  /** 장면 시작: 진행 중이던 자율 행동을 끊고 잠근다 */
  private lock(agents: Agent[]) {
    for (const agent of agents) {
      this.locked.add(agent.id);
      agent.queue.length = 0;
      agent.current = null;
      agent.path = [];
      agent.pathIdx = 0;
    }
  }

  private unlock(agents: Agent[]) {
    for (const agent of agents) this.locked.delete(agent.id);
  }

  private busy(agent: Agent) {
    return agent.queue.length > 0 || agent.current !== null;
  }

  private allFree(agents: Agent[]) {
    return () => agents.every((a) => !this.busy(a));
  }

  private deptAgents(deptId: string) {
    return this.agents.filter((a) => a.deptId === deptId && a.rank !== "ceo");
  }

  private agent(id: string): Agent {
    const agent = this.agentById.get(id);
    if (!agent) throw new Error(`unknown agent: ${id}`);
    return agent;
  }

  private leadOf(deptId: string): Agent | null {
    const lead = DEPT_LEAD[deptId] ?? PROJECT_PM[deptId];
    return lead ? this.agentById.get(lead.id) ?? null : null;
  }

  private statusOf(roomId: string): DeptStatus {
    return PROJECT_IDS.has(roomId) ? this.projectStatus[roomId] : this.deptStatus[roomId];
  }

  // ── 하루 시나리오 ─────────────────────────────────────────
  start() {
    if (this.running || this.live.on) return;
    this.reset();
    this.running = true;
    this.main.gen = this.dayScript();
  }

  private *dayScript(): Generator<number | (() => boolean), void, void> {
    // ① 07:00 출근
    this.phaseIndex = 1;
    this.pushLog("🚪", `07:00 자동 출근을 시작합니다. AI 직원 ${STAFF.length}명 입장!`, "yellow");
    const workers = this.agents.filter((a) => a.rank !== "ceo");
    this.lock(workers);
    for (const agent of workers) {
      this.enqueue(
        agent,
        { k: "status", s: "출근 중" },
        { k: "wait", dur: Math.random() * 6 },
        { k: "fn", fn: () => this.say(agent, rand(["좋은 아침이에요!", "출근합니다 ✨", "오늘도 화이팅!", "커피부터…"]), 2.4) },
        { k: "walk", to: agent.home },
        { k: "face", dir: "up" },
        { k: "anim", a: "sit" },
        { k: "status", s: "대기" },
      );
    }
    yield this.allFree(workers);
    this.unlock(workers);
    this.pushLog("✅", "전원 착석 완료. Slack 요청을 기다립니다.", "mint");
    yield 0.6;

    const hermes = this.agent("hermes-lead");
    const ceo = this.agent("ceo");
    const project = PROJECTS.find((p) => p.id === REQUEST.project) ?? PROJECTS[0];
    const pm = this.leadOf(project.id) ?? this.agent("hermes-lead");

    // ② Slack 요청 접수 → 헤르메스가 프로젝트 방으로 가져간다
    this.phaseIndex = 2;
    this.lock([hermes, pm]);
    this.stand(hermes);
    this.say(hermes, `${REQUEST.channel}에 새 요청! ${project.name}로 갑니다.`, 3);
    this.pushLog("#", `Slack ${REQUEST.channel} · ${REQUEST.requester}: “${REQUEST.text}”`, "yellow");
    this.pushChat("staff", HERMES, `${REQUEST.channel}에서 ${REQUEST.requester}님 요청 접수했어요.\n“${REQUEST.text}”\n${project.name} 방의 ${pm.name}에게 전달합니다. 분담은 PM 이 해요.`);
    this.spotlightRoom(project.id, 10);
    this.goto(hermes, projectSpot(project.id), "이동 중");
    yield this.allFree([hermes]);
    hermes.anim = "talk";
    this.say(hermes, "요청 보드에 올렸어요. 분담 부탁해요.", 3);
    this.projectStatus[project.id] = "작업 중";
    yield 1.6;
    this.stand(pm);
    this.say(pm, "미미르 조회부터 시키고 기획·디자인·개발로 나눌게요.", 3.2);
    this.pushLog(project.icon, `${project.name} 요청 보드 등록 — PM ${pm.name} 분담 시작`, "pink");
    yield 2;
    hermes.anim = "idle";
    this.sitAtDesk(hermes);
    yield this.allFree([hermes]);
    this.unlock([hermes, pm]);

    // ③ PM 업무 분담 회의 — 프로젝트 PM 이 기획·디자인·개발 팀장을 부른다
    this.phaseIndex = 3;
    yield* this.meeting(
      `${project.name} 업무 분담`,
      [pm.id, "plan-lead", "design-lead", "dev-lead"],
      [
        [pm.id, `요청 한 줄: “${REQUEST.text}”. 기획 → 디자인·개발 → QA 순서로 갑니다.`],
        ["plan-lead", "미미르에서 이전 결정부터 보고, 작업 단위로 쪼갤게요."],
        ["design-lead", "기획 흐름 오면 바로 시안 그리겠습니다."],
        ["dev-lead", "권한이 걸리는 부분은 검토에서 멈추고 대표님께 올릴게요."],
      ],
    );
    this.pushLog("⚡", `${pm.name} 분담 완료 — 기획·디자인·개발·QA·마케팅·운영·AI-OS 7건 등록`, "mint");

    // ④ 기획 — 스펙 담당이 미미르를 먼저 조회한다
    this.phaseIndex = 4;
    yield* this.consult("planspec", `${REQUEST.project} 이전 결정·자료 조회`);
    yield* this.runDept("plan", REQUEST.tasks.plan, 6, "기능 목록 6개, 작업 4단위로 나눴어요. 순서까지 정했어요.");

    // ⑤ 디자인·개발 병행
    this.phaseIndex = 5;
    yield* this.deliver("plan-lead", "design", "화면 흐름 정리본이에요. 시안 부탁해요.", "받았어요! 흐름부터 그릴게요.");
    yield* this.deliver("plan-lead", "dev", "작업 4단위 스펙이에요. 분기 로직부터요.", "재현 테스트부터 쓰고 시작할게요.");
    this.startDept("design", REQUEST.tasks.design, 7);
    this.startDept("dev", REQUEST.tasks.dev, 8);
    yield () => this.deptStatus.design === "완료" && this.deptStatus.dev === "완료";

    // ⑥ 검토 차단 — 리뷰어가 권한 사용을 막고 대표 확인을 요청한다
    this.phaseIndex = DECISION_PHASE;
    const reviewer = this.agent("devreview");
    this.deptStatus.dev = "확인 필요";
    this.approvalPending = true;
    this.turbo = false; // 대표 결정 지점에서는 즉시 정상 속도로 돌아온다
    this.meetingTitle = `검토 차단 · ${DECISION.tag}`;
    this.say(reviewer, "잠깐요, 이건 대표님 확인이 필요해요.", 3);
    this.pushLog("■", `개발팀 검토 차단: ${DECISION.title}`, "yellow");
    this.pushChat("staff", HERMES, `개발팀 리뷰어가 검토 중 막았어요.\n“${DECISION.title}”\n승인 카드에서 결정해 주시면 바로 이어갑니다.`);
    yield 1.6;

    const approvers = APPROVERS.map((id) => this.agent(id));
    this.lock([...approvers, ceo]);
    approvers.forEach((agent, i) => {
      this.stand(agent);
      const seat = this.bookSeat(agent, i);
      this.goto(agent, seat, "회의 중");
      this.enqueue(agent, { k: "face", dir: seat.y < MEETING_TABLE_Y ? "down" : "up" }, { k: "anim", a: "sit" });
    });
    const ceoSeat = this.bookSeat(ceo, 3);
    this.enqueue(
      ceo,
      { k: "anim", a: "idle" },
      { k: "status", s: "회의 중" },
      { k: "walk", to: ceoSeat },
      { k: "face", dir: ceoSeat.y < MEETING_TABLE_Y ? "down" : "up" },
      { k: "anim", a: "sit" },
    );
    yield this.allFree([...approvers, ceo]);

    this.say(reviewer, DECISION.summary, 3.6);
    yield 2.6;
    this.say(hermes, "대표님, 오늘 결정하실 건 이거 하나예요.", 3.2);
    yield 2.2;
    this.say(ceo, "확인해볼게요.", 2.4);

    // 대표가 승인 버튼을 누를 때까지 대기
    yield () => this.approved;

    this.approvalPending = false;
    this.meetingTitle = null;
    this.say(ceo, "허용합니다. 대신 QA에서 실기기로 확인해요.", 3);
    this.pushLog("✅", `대표 확인 완료 — 차단 해제, QA로 넘어갑니다.`, "mint");
    this.pushChat("staff", HERMES, "확인 접수했습니다. 차단 해제하고 QA에 넘길게요.");
    yield 1.6;
    for (const agent of approvers) {
      this.releaseSeat(agent);
      this.stand(agent);
      this.sitAtDesk(agent);
    }
    this.releaseSeat(ceo);
    this.enqueue(ceo, { k: "anim", a: "idle" }, { k: "walk", to: CEO_SEAT }, { k: "face", dir: "down" }, { k: "anim", a: "sit" }, { k: "status", s: "업무 중" });
    yield this.allFree([...approvers, ceo]);
    this.unlock([...approvers, ceo]);

    // ⑦ QA 실기기 검증
    this.phaseIndex = 7;
    this.deptStatus.dev = "대기";
    yield* this.runDept("dev", REQUEST.tasks.qa, 5.5, "실기기 시나리오 12개 통과. 재현되던 오류 없음.");

    // ⑧ 마케팅·운영·AI-OS 병행 (운영팀 큐레이터는 미미르에 결과를 정리해 넣는다)
    this.phaseIndex = 8;
    this.startDept("mkt", REQUEST.tasks.mkt, 6);
    this.startDept("aios", REQUEST.tasks.aios, 5);
    yield* this.consult("opcurator", "결과·결정사항 미미르에 정리");
    this.startDept("ops", REQUEST.tasks.ops, 5);
    for (const deptId of BLOCKED_DEPTS) {
      const lead = this.leadOf(deptId);
      if (!lead) continue;
      this.stand(lead);
      this.say(lead, "연결 전이라 숫자는 못 만들어요.", 3);
      this.pushLog(roomOf(deptId).icon, `${roomOf(deptId).name}: ${BLOCK_NEED[deptId]} 전 → 값을 만들지 않고 기록만 남김`, "lav");
      this.goto(lead, rand(LOUNGE_ROOM.loiter), "휴식");
      this.enqueue(lead, { k: "wait", dur: 4 }, { k: "fn", fn: () => this.say(lead, "연결되면 바로 돌립니다.", 2.4) });
      this.sitAtDesk(lead);
    }
    yield () => this.deptStatus.mkt === "완료" && this.deptStatus.aios === "완료" && this.deptStatus.ops === "완료";
    this.pushLog("🗂️", "안내 문구 초안 · 사용 안내서 · 실행 기록 점검 완료 (게시·발송은 대표 승인 뒤)", "mint");

    // ⑨ PM 결과 회수 — 개발PM 이 프로젝트 방에 결과를 올리고, 헤르메스가 PM 에게서 받아 간다
    this.phaseIndex = 9;
    yield* this.deliver("dev-lead", project.id, "결과물 2건 등록했어요. 요청 보드에 올릴게요.", "확인했어요. 헤르메스에게 넘길게요.");
    yield* this.deliver("hermes-lead", project.id, "결과 회수하러 왔어요.", "결과물 2건, 중간·최종 구분해 뒀어요.");
    this.projectStatus[project.id] = "완료";
    this.pushLog("📦", `${project.name} 결과 회수 완료 — 결과물 2건 등록 (완료 ≠ 보고 전달, 발행은 별도)`, "mint");

    // ⑩ 헤르메스 보고
    this.phaseIndex = REPORT_PHASE;
    this.lock([hermes]);
    this.stand(hermes);
    this.say(hermes, "전 부서 보고 취합했어요. 대표님께 갑니다.", 3);
    this.goto(hermes, CEO_REPORT_SPOT, "보고 중");
    this.enqueue(hermes, { k: "face", dir: "up" });
    yield this.allFree([hermes]);
    this.say(hermes, "대표님, 오늘 결정할 건 이제 없어요.", 3.2);
    this.say(ceo, "고생했어요 ✨", 2.6);
    this.deptStatus.hermes = "완료";
    this.briefingReady = true;
    this.onBriefing?.();
    const stats = this.snapshot().stats;
    this.pushLog("📋", `헤르메스 최종 보고 — 완료 ${stats.done}팀 · 차단 ${stats.blocked}팀`, "pink");
    yield 3;
    this.stand(hermes);
    this.sitAtDesk(hermes);
    yield this.allFree([hermes]);
    this.unlock([hermes]);

    this.phaseIndex = 11;
    this.dayComplete = true;
    this.running = false;
    this.pushLog("👑", "오늘 업무 종료. 직원들이 라운지로 이동합니다.", "yellow");

    for (const agent of workers) {
      if (Math.random() < 0.45) {
        this.stand(agent);
        this.goto(agent, rand(LOUNGE_ROOM.loiter), "휴식");
      }
    }
  }

  /** 부서 업무 시작(비동기) */
  private startDept(deptId: string, label: string, dur: number, projectId: string | null = REQUEST.project) {
    this.deptStatus[deptId] = "작업 중";
    const crew = this.deptAgents(deptId);
    this.lock(crew);
    this.pushLog(roomOf(deptId).icon, `${roomOf(deptId).name} 업무 시작 — ${label}`, "pink");
    crew.forEach((agent, i) => {
      this.enqueue(
        agent,
        { k: "fn", fn: () => { agent.project = projectId; } },
        { k: "wait", dur: i * 0.35 },
        { k: "walk", to: agent.home },
        { k: "face", dir: "up" },
        { k: "status", s: "업무 중" },
        { k: "work", dur: dur + Math.random() * 1.5, label },
        { k: "anim", a: "sit" },
        { k: "status", s: "대기" },
        { k: "fn", fn: () => this.finishDept(deptId) },
      );
    });
  }

  private finishDept(deptId: string) {
    if (this.deptAgents(deptId).some((a) => a.status === "업무 중")) return;
    if (this.deptStatus[deptId] === "완료") return;
    this.deptStatus[deptId] = "완료";
    this.unlock(this.deptAgents(deptId));
    for (const a of this.deptAgents(deptId)) if (!a.project || !PROJECT_PM[a.project] || PROJECT_PM[a.project].id !== a.id) a.project = null;
    const agent = this.leadOf(deptId);
    if (agent) this.say(agent, "완료했어요!", 2.4);
    this.pushLog(roomOf(deptId).icon, `${roomOf(deptId).name} 완료 — ${DEPT_BRIEF[deptId].report}`, "mint");
  }

  private *runDept(deptId: string, label: string, dur: number, report: string) {
    this.startDept(deptId, label, dur);
    yield () => this.deptStatus[deptId] === "완료";
    const lead = this.leadOf(deptId);
    if (lead) this.say(lead, report, 3.2);
    yield 1.2;
  }

  /** 미미르 조회 — 직원이 미미르 방 단말 앞에 가서 회사 기억을 읽고 돌아온다 */
  private *consult(agentId: string, what: string) {
    const agent = this.agentById.get(agentId);
    if (!agent) return;
    this.lock([agent]);
    this.stand(agent);
    this.say(agent, "미미르에 먼저 물어볼게요.", 2.4);
    this.goto(agent, MIMIR_SPOT, "조회 중");
    this.enqueue(agent, { k: "face", dir: "up" });
    yield this.allFree([agent]);
    this.deptStatus.mimir = "작업 중";
    this.spotlightRoom("mimir", 6);
    agent.anim = "type";
    this.say(agent, `미미르 조회 — ${what}`, 3.2, "think");
    this.pushLog("🧠", `${agent.name} → 미미르: ${what} (원천 ${MIMIR_SOURCES.length}종 누적 기록)`, "lav");
    yield 3;
    agent.anim = "idle";
    this.deptStatus.mimir = "완료";
    this.say(agent, "관련 결정 3건 찾았어요. 자리로 갈게요.", 2.6);
    this.sitAtDesk(agent);
    yield this.allFree([agent]);
    this.unlock([agent]);
  }

  /** 회의: 참석자 소집 → 대사 → 자리 복귀 */
  private *meeting(title: string, ids: string[], lines: [string, string][]) {
    this.meetingTitle = title;
    this.pushLog("💬", `회의 소집: ${title} (${ids.length}명)`, "lav");
    const crew = ids.map((id) => this.agent(id));
    this.lock(crew);
    crew.forEach((agent, i) => {
      this.stand(agent);
      this.say(agent, "회의실로 갈게요.", 2);
      const seat = this.bookSeat(agent, i);
      this.goto(agent, seat, "회의 중");
      this.enqueue(
        agent,
        { k: "face", dir: seat.y < MEETING_TABLE_Y ? "down" : "up" },
        { k: "anim", a: "sit" },
        { k: "status", s: "회의 중" },
      );
    });
    yield this.allFree(crew);
    yield 0.6;

    for (const [id, text] of lines) {
      const speaker = this.agent(id);
      speaker.anim = "talk";
      this.say(speaker, text, 3.2);
      this.pushLog("🗣️", `${speaker.name}: “${text}”`, "lav");
      yield 2.3;
      speaker.anim = "sit";
    }

    yield 0.8;
    for (const agent of crew) {
      this.releaseSeat(agent);
      this.stand(agent);
      this.sitAtDesk(agent);
    }
    this.meetingTitle = null;
    yield this.allFree(crew);
    this.unlock(crew);
  }

  /** 부서 간 전달 — 직접 걸어가서 말하고 돌아온다 */
  private *deliver(fromId: string, toDeptId: string, line: string, reply: string) {
    const from = this.agent(fromId);
    const toLead = this.leadOf(toDeptId);
    const room = roomOf(toDeptId);
    const spot = toLead
      ? { x: toLead.home.x, y: Math.min(toLead.home.y + 1, room.y + room.h - 2) }
      : doorApproach(room);

    this.lock(toLead ? [from, toLead] : [from]);
    this.stand(from);
    this.goto(from, walkable(spot.x, spot.y) ? spot : doorApproach(room), "이동 중");
    yield this.allFree([from]);
    from.anim = "talk";
    this.say(from, line, 3);
    this.pushLog("🤝", `${from.name} → ${room.name}: “${line}”`, "pink");
    yield 2;
    if (toLead) this.say(toLead, reply, 2.8);
    yield 1.6;
    from.anim = "idle";
    this.sitAtDesk(from);
    yield this.allFree([from]);
    this.unlock(toLead ? [from, toLead] : [from]);
  }

  private stand(agent: Agent) {
    agent.anim = "idle";
    agent.progress = 0;
  }

  /** 테이블을 사이에 두고 마주보도록 위·아래 줄을 번갈아 배정한다 */
  private bookSeat(agent: Agent, preferred: number): Pt {
    const zigzag = [0, 3, 1, 4, 2, 5];
    const taken = new Set([...this.seatBook.values()].map((p) => `${p.x},${p.y}`));
    const order = [zigzag[preferred % zigzag.length], ...zigzag];
    for (const i of order) {
      const seat = MEETING_SEATS[i % MEETING_SEATS.length];
      if (!taken.has(`${seat.x},${seat.y}`)) {
        this.seatBook.set(agent.id, seat);
        return seat;
      }
    }
    return MEETING_SEATS[0];
  }

  private releaseSeat(agent: Agent) {
    this.seatBook.delete(agent.id);
  }

  // ── 대표 지시창 ──────────────────────────────────────────
  pushChat(from: "ceo" | "staff", name: string, text: string) {
    this.chat.push({ id: this.logSeq++, time: this.clockText(), from, name, text });
    if (this.chat.length > 60) this.chat.shift();
  }

  /** 지시창에 들어온 한 줄을 해석해 보고하거나 실제로 지시를 실행한다 */
  command(raw: string) {
    const text = raw.trim();
    if (!text) return;
    this.pushChat("ceo", CEO.name, text);
    const q = text.toLowerCase();

    // ① 특정 부서·직원 지목
    const deptId = this.matchDept(text);
    if (deptId && !/전체|모두|다들/.test(text)) {
      this.deptReport(deptId, text);
      return;
    }

    // ② 지시(실제로 동작하는 명령)
    if (/집중|커피 ?금지|딴짓|자리 지켜/.test(text)) return this.setFocusMode(true);
    if (/자유|쉬어|휴식 허용|집중 해제/.test(text)) return this.setFocusMode(false);
    if (/자리로|복귀|착석/.test(text)) return this.recallAll();
    if (/빨리|서둘|속도|급해|당겨/.test(text)) return this.boost();
    if (/회의|모여|소집/.test(text)) return this.convene();
    if (/브리핑|보고하러|올라와/.test(text)) return this.briefNow();
    if (/승인|허용|오케이|고고|진행해/.test(text) && this.approvalPending) {
      this.approve();
      this.pushChat("staff", HERMES, "확인 접수했습니다. 차단 해제하고 QA에 넘길게요.");
      return;
    }
    if (/수고|칭찬|잘했|좋아요|고마/.test(text)) return this.cheer();

    // ③ 질문(보고)
    if (/왜|늦|지연|막힘|블로|차단|안 되|안돼|문제/.test(text)) return this.reportDelay();
    if (/뭐|현황|상황|진행|보고|어디까지|status/.test(q)) return this.reportStatus();

    this.pushChat(
      "staff",
      HERMES,
      "이렇게 물어보시면 제일 빨라요 — “현황 보고” / “왜 늦어져?” / “개발팀 뭐해?” / “미미르 뭐 있어?” / “회의 소집” / “집중 모드” / “지금 브리핑”.",
    );
  }

  // ── 보고 ────────────────────────────────────────────────
  private reportStatus() {
    if (this.live.on) {
      const lines = [
        this.live.connected
          ? `Hermes Desk 연결됨 · 작업 ${this.live.tasks}건 · 요청 ${this.live.requests}건.`
          : `Hermes Desk 연결 확인 필요 — ${this.live.error || "응답 없음"}. 마지막 상태를 그대로 보여주고 있어요.`,
      ];
      const working = this.workingDepts();
      if (working.length) lines.push(`작업 중: ${working.map((d) => roomOf(d).name).join(" · ")}`);
      const blocked = Object.entries(this.deptStatus).filter(([, s]) => s === "차단").map(([d]) => roomOf(d).name);
      if (blocked.length) lines.push(`차단: ${blocked.join(" · ")}`);
      this.pushChat("staff", HERMES, lines.join("\n"));
      this.speakHermes("실제 기록 기준으로 정리했어요.");
      return;
    }
    if (!this.running && !this.dayComplete) {
      this.pushChat("staff", HERMES, "아직 출근 전이에요. ‘오늘 업무 시작하기’를 눌러주시면 전원 출근합니다.");
      return;
    }
    const working = this.workingDepts();
    const lines: string[] = [`지금 ${this.clockText()} · ‘${PHASES[this.phaseIndex]}’ 단계입니다.`];

    if (working.length) {
      lines.push(`작업 중: ${working.map((d) => `${roomOf(d).name} ${this.deptProgress(d)}%`).join(" · ")}`);
    } else if (this.approvalPending) {
      lines.push("개발팀이 검토 차단 상태로 대표님 확인을 기다리는 중입니다.");
    } else if (this.dayComplete) {
      lines.push("오늘 업무는 모두 끝났어요.");
    } else if (this.meetingTitle) {
      lines.push(`회의 진행 중 — ${this.meetingTitle}`);
    } else {
      lines.push("지금은 앞 단계 결과를 넘기는 중이라 잠깐 비어 있어요. 곧 다음 팀이 붙습니다.");
    }

    const stats = this.snapshot().stats;
    lines.push(`완료 ${stats.done}팀 · 차단 ${stats.blocked}팀 · 근무 인원 ${this.onDutyCount()}명.`);
    const next = PHASES[this.phaseIndex + 1];
    if (next && !this.dayComplete) lines.push(`다음 순서는 ‘${next}’입니다.`);

    this.pushChat("staff", HERMES, lines.join("\n"));
    this.speakHermes("현황 정리해서 올렸어요.");
  }

  private reportDelay() {
    const lines: string[] = [];

    if (this.approvalPending) {
      const waited = Math.max(1, Math.round(this.elapsed - (this.approvalSince ?? this.elapsed)));
      const names = APPROVERS.map((id) => this.agentById.get(id)?.name).filter(Boolean).join("·");
      lines.push(`원인은 하나예요 — 검토 차단, 대표님 확인 대기입니다. 회의실에서 ${names}가 ${waited}초째 기다리고 있어요.`);
      lines.push("승인 카드에서 결정만 해주시면 바로 QA로 넘어갑니다.");
    }

    const working = this.workingDepts();
    for (const dept of working) {
      // 실시간 기록에는 진행률이 없다 — 만들어 붙이지 않는다
      lines.push(
        this.live.on
          ? `${roomOf(dept).name}: ${this.deptTaskLabel(dept)} — 작업 중 기록 있음. 지연 근거 없음.`
          : `${roomOf(dept).name}: ${this.deptTaskLabel(dept)} — 진행률 ${this.deptProgress(dept)}%. 정상 속도예요.`,
      );
    }

    const blocked = Object.entries(this.deptStatus)
      .filter(([, s]) => s === "차단")
      .map(([dept]) => dept);
    if (blocked.length) {
      if (lines.length) {
        lines.push(`그 외 차단 ${blocked.length}팀(${blocked.map((d) => roomOf(d).name).join("·")})은 외부 연결 문제라 오늘 진행이 어려워요.`);
      } else {
        for (const dept of blocked) {
          lines.push(`${roomOf(dept).name}: ${this.liveReason(dept) ?? BLOCK_REASON[dept] ?? "외부 연결을 기다리는 중이에요."}`);
        }
      }
    }
    const attention = Object.entries(this.deptStatus)
      .filter(([, s]) => s === "확인 필요")
      .map(([dept]) => dept);
    for (const dept of attention) {
      if (this.approvalPending && dept === "dev") continue;
      lines.push(`${roomOf(dept).name}: ${this.liveReason(dept) ?? "최근 진행 소식이 없어 확인이 필요해요."}`);
    }

    const away = this.agents.filter((a) => a.status === "휴식").length;
    if (away) lines.push(`참고로 지금 ${away}명이 라운지에 있어요. ‘집중 모드’라고 하시면 전원 자리로 붙입니다.`);

    if (!lines.length) {
      lines.push(
        this.running || this.live.on ? "지연 없습니다. 대기 중인 병목도 없어요." : "아직 출근 전이라 진행할 업무가 없어요.",
      );
    }
    this.pushChat("staff", HERMES, lines.join("\n"));
    this.speakHermes("지연 사유 보고드렸어요.");
  }

  private deptReport(deptId: string, question: string) {
    const lines: string[] = [];
    if (deptId === "mimir") {
      const status = this.deptStatus.mimir;
      lines.push(`미미르는 직원이 아니라 회사 기억이에요. 원천 ${MIMIR_SOURCES.length}종: ${MIMIR_SOURCES.slice(0, 6).join(" · ")} 외.`);
      lines.push(status === "작업 중" ? "지금 누군가 조회 중이에요." : "조회 요청이 오면 저장된 결정·자료를 돌려줍니다. 숫자는 실제 적재 기록에서만 읽어요.");
      this.pushChat("staff", HERMES, lines.join("\n"));
      this.spotlightRoom("mimir", 8);
      this.pushLog("🎤", "대표 지시: 미미르 상태 확인", "yellow");
      return;
    }
    const room = roomOf(deptId);
    const lead = this.leadOf(deptId);
    const status = this.statusOf(deptId);
    const crew = PROJECT_IDS.has(deptId) ? this.agents.filter((a) => a.project === deptId) : this.deptAgents(deptId);

    if (PROJECT_IDS.has(deptId)) {
      const working = crew.filter((a) => a.rank !== "ceo" && PROJECT_PM[deptId]?.id !== a.id);
      lines.push(
        status === "작업 중"
          ? `${room.name} 요청 진행 중이에요. 지금 붙어 있는 부서 인원 ${working.length}명: ${working.map((a) => `${a.name}(${roomOf(a.deptId).name})`).join(" · ") || "배정 대기"}.`
          : status === "완료"
            ? `${room.name} 요청은 결과까지 회수했어요. 보고 전달은 발행에서 따로 확인해요.`
            : `${room.name}는 지금 들어온 요청이 없어요. Slack 에서 요청이 오면 PM 이 부서에 배정합니다.`,
      );
      this.pushChat("staff", lead ? `${lead.name} · ${room.name}` : room.name, lines.join("\n"));
      if (lead) {
        this.say(lead, "대표님, 보고드릴게요!", 3);
        lead.anim = "talk";
      }
      this.spotlightRoom(deptId, 8);
      this.pushLog("🎤", `대표 지시: ${room.name} 프로젝트 확인`, "yellow");
      return;
    }

    if (status === "작업 중") {
      lines.push(`${this.deptTaskLabel(deptId)} 작업 중이에요.${this.live.on ? "" : ` 진행률 ${this.deptProgress(deptId)}%.`}`);
    } else if (status === "완료") {
      lines.push(`오늘 몫은 끝냈어요. ${DEPT_BRIEF[deptId].report}`);
    } else if (status === "차단") {
      lines.push(this.liveReason(deptId) ?? BLOCK_REASON[deptId] ?? "외부 연결을 기다리는 중이에요.");
    } else if (status === "확인 필요") {
      lines.push(this.liveReason(deptId) ?? "대표님 확인을 기다리는 중입니다. 결정 주시면 바로 움직여요.");
    } else {
      lines.push(`앞 단계 결과를 기다리는 중이에요. 오늘 제 일은 ‘${DEPT_BRIEF[deptId].task}’입니다.`);
    }
    lines.push(`팀원 현황: ${crew.map((a) => `${a.name}(${a.status})`).join(" · ")}`);
    if (/왜|늦|지연/.test(question) && status === "대기") {
      lines.push("저희가 늦는 게 아니라 앞 팀 산출물이 아직 안 왔어요.");
    }

    this.pushChat("staff", lead ? `${lead.name} · ${room.name}` : room.name, lines.join("\n"));
    if (lead) {
      this.say(lead, "대표님, 보고드릴게요!", 3);
      lead.anim = "talk";
    }
    this.spotlightRoom(deptId, 8);
    this.pushLog("🎤", `대표 지시: ${room.name} 상황 확인`, "yellow");
  }

  // ── 지시 실행 ────────────────────────────────────────────
  private setFocusMode(on: boolean) {
    this.focusMode = on;
    if (on) {
      this.recallAll(true);
      this.pushChat("staff", HERMES, "집중 모드 켰습니다. 커피·잡담 없이 전원 자리에서 업무만 봅니다.");
      this.pushLog("🎤", "대표 지시: 집중 모드 ON — 자율 휴식 중단", "yellow");
    } else {
      this.pushChat("staff", HERMES, "집중 모드 껐어요. 다들 숨 좀 돌리겠습니다 ☕");
      this.pushLog("🎤", "대표 지시: 집중 모드 OFF", "yellow");
    }
  }

  private recallAll(quiet = false) {
    let moved = 0;
    for (const agent of this.agents) {
      if (agent.rank === "ceo" || this.locked.has(agent.id) || agent.status === "출근 전") continue;
      if (Math.abs(agent.x - agent.home.x) < 0.2 && Math.abs(agent.y - agent.home.y) < 0.2) continue;
      agent.queue.length = 0;
      agent.current = null;
      this.say(agent, "네, 바로 갈게요!", 2.4);
      this.sitAtDesk(agent);
      moved += 1;
    }
    if (!quiet) {
      this.pushChat("staff", HERMES, moved ? `${moved}명 자리로 복귀시켰습니다.` : "다들 이미 자리에 있어요.");
      this.pushLog("🎤", `대표 지시: 전원 자리 복귀 (${moved}명 이동)`, "yellow");
    }
  }

  private boost() {
    if (this.live.on) {
      this.pushChat("staff", HERMES, "실시간 모드에서는 실제 에이전트 속도를 여기서 바꿀 수 없어요. 화면 재생 속도만 조절됩니다.");
      return;
    }
    let count = 0;
    for (const agent of this.agents) {
      if (agent.current?.k === "work") {
        agent.current.dur = Math.max(agent.timer + 0.8, agent.current.dur * 0.55);
        this.say(agent, "네! 속도 올릴게요", 2.4);
        count += 1;
      }
    }
    this.speed = Math.min(4, this.speed * 2);
    this.pushChat(
      "staff",
      HERMES,
      count ? `작업 ${count}건 속도 올렸고 배속도 ${this.speed}x로 바꿨습니다.` : `지금 돌아가는 작업이 없어서 배속만 ${this.speed}x로 올렸어요.`,
    );
    this.pushLog("🎤", `대표 지시: 속도 올리기 (${this.speed}x)`, "yellow");
  }

  private cheer() {
    for (const agent of this.agents) {
      if (agent.rank === "ceo" || agent.status === "출근 전") continue;
      this.say(agent, rand(["감사합니다 🩷", "힘나요!", "더 잘할게요 ✨"]), 3.2);
    }
    this.pushChat("staff", HERMES, "대표님 한마디에 사무실 분위기가 확 살았어요 🩷");
    this.pushLog("👑", "대표 격려 — 전 직원 사기 상승", "pink");
  }

  private convene() {
    if (this.side.gen) {
      this.pushChat("staff", HERMES, "앞선 지시를 아직 처리 중이에요. 끝나면 바로 잡겠습니다.");
      return;
    }
    const ids = DEPT_ROOMS.map((room) => DEPT_LEAD[room.id]?.id)
      .filter((id): id is string => Boolean(id))
      .filter((id) => !this.locked.has(id) && this.agentById.get(id)?.status !== "출근 전")
      .slice(0, 6);
    if (!ids.length) {
      this.pushChat("staff", HERMES, "지금은 다들 진행 중인 업무가 있어 소집이 어려워요. 잠시 뒤 다시 불러주세요.");
      return;
    }
    this.pushChat("staff", HERMES, `${ids.length}명 회의실로 소집했습니다. 각자 한 줄씩 보고할게요.`);
    this.pushLog("🎤", `대표 지시: 긴급 회의 소집 (${ids.length}명)`, "yellow");
    this.spotlightRoom("meeting", 24);
    this.side.gen = this.conveneScene(ids);
  }

  private *conveneScene(ids: string[]): Generator<number | (() => boolean), void, void> {
    const lines = ids.map((id) => {
      const agent = this.agent(id);
      const status = this.deptStatus[agent.deptId];
      const text =
        status === "작업 중"
          ? `${this.deptTaskLabel(agent.deptId)}${this.live.on ? " 진행 중입니다." : ` ${this.deptProgress(agent.deptId)}% 진행 중입니다.`}`
          : status === "완료"
            ? "오늘 몫은 끝냈습니다."
            : status === "차단"
              ? (this.liveReason(agent.deptId) ?? BLOCK_REASON[agent.deptId] ?? "외부 연결 대기 중입니다.")
              : status === "확인 필요"
                ? (this.liveReason(agent.deptId) ?? "대표님 확인을 기다리는 중입니다.")
                : "앞 단계 결과를 기다리는 중입니다.";
      return [id, text] as [string, string];
    });
    yield* this.meeting("대표 긴급 소집 · 전 부서 한 줄 보고", ids, lines);
    this.pushChat("staff", HERMES, "회의 마쳤습니다. 전원 자리로 복귀했어요.");
  }

  private briefNow() {
    if (this.side.gen) {
      this.pushChat("staff", HERMES, "앞선 지시를 처리 중이에요. 끝나고 바로 올라가겠습니다.");
      return;
    }
    const hermes = this.agent("hermes-lead");
    if (this.locked.has(hermes.id)) {
      this.pushChat("staff", HERMES, "지금 다른 일정에 묶여 있어요. 마치는 대로 대표실로 가겠습니다.");
      return;
    }
    this.pushLog("🎤", "대표 지시: 즉시 브리핑 요청", "yellow");
    this.side.gen = this.briefScene(hermes);
  }

  private *briefScene(hermes: Agent): Generator<number | (() => boolean), void, void> {
    this.lock([hermes]);
    this.stand(hermes);
    this.say(hermes, "대표님께 지금 보고드리러 갑니다.", 3);
    this.goto(hermes, CEO_REPORT_SPOT, "보고 중");
    this.enqueue(hermes, { k: "face", dir: "up" });
    yield this.allFree([hermes]);
    hermes.anim = "talk";
    this.say(hermes, "바로 보고드릴게요.", 3);
    this.reportStatus();
    yield 3;
    hermes.anim = "idle";
    this.stand(hermes);
    this.sitAtDesk(hermes);
    yield this.allFree([hermes]);
    this.unlock([hermes]);
  }

  // ── 보고용 계산 ──────────────────────────────────────────
  private workingDepts() {
    return Object.entries(this.deptStatus)
      .filter(([, status]) => status === "작업 중")
      .map(([dept]) => dept);
  }

  private deptProgress(deptId: string) {
    const crew = this.deptAgents(deptId);
    if (!crew.length) return 0;
    return Math.round((crew.reduce((sum, a) => sum + a.progress, 0) / crew.length) * 100);
  }

  private deptTaskLabel(deptId: string) {
    const crew = this.deptAgents(deptId);
    return crew.find((a) => a.status === "업무 중")?.taskLabel ?? DEPT_BRIEF[deptId].task;
  }

  private onDutyCount() {
    return this.agents.filter((a) => a.rank !== "ceo" && a.status !== "출근 전").length;
  }

  private speakHermes(text: string) {
    const hermes = this.agentById.get("hermes-lead");
    if (hermes && hermes.status !== "출근 전") this.say(hermes, text, 3);
  }

  private spotlightRoom(roomId: string, seconds: number) {
    this.spotlight = roomId;
    this.spotlightUntil = this.elapsed + seconds;
  }

  /** 실시간 모드에서 부서가 막힌 이유 (Hermes 작업 기록의 reason) */
  private liveReason(deptId: string): string | null {
    if (!this.live.on) return null;
    for (const task of this.liveTaskById.values()) {
      if (DEPT_BY_LIVE_GROUP[task.group] === deptId && task.reason && !LIVE_TERMINAL.has(task.status)) {
        return `${task.title} — ${task.reason}`;
      }
    }
    return null;
  }

  /** 질문에 등장한 부서·이름을 찾아낸다 (구체적인 키워드부터 검사) */
  private matchDept(text: string): string | null {
    const lower = text.toLowerCase();
    for (const [deptId, words] of DEPT_KEYWORDS) {
      if (words.some((word) => lower.includes(word))) return deptId;
    }
    const staff = STAFF.find((s) => text.includes(s.name) || (s.callsign && lower.includes(s.callsign)));
    return staff?.deptId ?? null;
  }

  // ── 대표 액션 ────────────────────────────────────────────
  approve() {
    if (!this.approvalPending) return;
    this.approved = true;
  }

  setBriefingHandler(handler: (() => void) | null) {
    this.onBriefing = handler;
  }

  togglePause() {
    this.paused = !this.paused;
  }

  setSpeed(value: number) {
    this.speed = value;
    this.turbo = false;
  }

  /** 대표가 결정할 일이 생길 때까지(또는 업무 종료까지) 단숨에 건너뛴다 */
  skipToDecision() {
    if (!this.running || this.approvalPending || this.dayComplete || this.live.on) return;
    this.turbo = true;
    this.paused = false;
    this.pushLog("⏭", "대표 지시: 결정이 필요한 지점까지 건너뜁니다.", "yellow");
  }

  // ── 실시간(Hermes Desk) ──────────────────────────────────
  /** 실시간 모드 진입 — 시나리오를 멈추고 전원 자리에 앉힌다 */
  enterLive() {
    if (this.live.on) return;
    this.reset();
    this.live = { on: true, connected: false, checked: null, error: "", requests: 0, tasks: 0 };
    this.running = true;
    this.phaseIndex = 0;
    for (const agent of this.agents) {
      if (agent.rank === "ceo") continue;
      agent.x = agent.home.x;
      agent.y = agent.home.y;
      agent.facing = "up";
      agent.anim = "sit";
      agent.status = "대기";
    }
    this.pushLog("⚡", "Hermes Desk 실시간 연결 — 실제 작업 기록으로 화면을 움직입니다.", "yellow");
    this.pushChat("staff", HERMES, "Hermes Desk 기록에 연결했어요. 작업 상태는 실제 기록만 반영하고, 진행률은 만들지 않습니다.");
  }

  setLiveError(message: string) {
    if (!this.live.on) return;
    if (this.live.connected || !this.live.error) {
      this.pushLog("⚠️", `Hermes Desk 연결 확인 필요 — ${message}`, "lav");
    }
    this.live.connected = false;
    this.live.error = message;
  }

  /** Hermes Desk /api/operations 응답을 화면에 반영한다 */
  applyLive(ops: LiveOps, history: boolean) {
    if (!this.live.on) return;
    this.live.connected = true;
    this.live.error = "";
    this.live.checked = ops.checked;
    this.live.requests = ops.requests?.length ?? 0;
    this.live.tasks = ops.tasks.filter((t) => !LIVE_TERMINAL.has(t.status)).length;
    this.liveTaskById = new Map(ops.tasks.map((t) => [t.id, t]));

    // 프로젝트 방 — 요청(requests)의 접수 프로필(PM)로 묶는다. 근거 없는 프로젝트 연결은 하지 않는다
    for (const project of PROJECTS) this.projectStatus[project.id] = "대기";
    for (const request of ops.requests ?? []) {
      const project = PROJECTS.find((p) => p.pm === request.profile);
      if (!project) continue;
      const next: DeptStatus =
        request.state === "blocked" ? "차단" : request.state === "unknown" ? "확인 필요" : request.state === "complete" ? "완료" : request.state === "waiting" ? "대기" : "작업 중";
      const rank: DeptStatus[] = ["차단", "확인 필요", "작업 중", "대기", "완료"];
      if (rank.indexOf(next) < rank.indexOf(this.projectStatus[project.id])) this.projectStatus[project.id] = next;
    }

    // 부서 상태 — office.js 와 같은 우선순위: 차단 > 확인 필요 > 작업 중 > 대기 > 완료
    const byDept = new Map<string, LiveTask[]>();
    for (const task of ops.tasks) {
      const deptId = DEPT_BY_LIVE_GROUP[task.group] ?? STAFF_BY_CALLSIGN[task.assignee ?? ""]?.deptId;
      if (!deptId) continue;
      if (!byDept.has(deptId)) byDept.set(deptId, []);
      byDept.get(deptId)!.push(task);
    }
    for (const room of DEPT_ROOMS) {
      const tasks = (byDept.get(room.id) ?? []).filter((t) => t.status !== "archived");
      if (room.id === "hermes") continue; // 헤르메스 방은 접수·전달 역할, 작업 상태로 칠하지 않는다
      const open = tasks.filter((t) => !LIVE_TERMINAL.has(t.status));
      let status: DeptStatus = "대기";
      if (open.some((t) => ["blocked", "crashed", "timed_out", "gave_up"].includes(t.status))) status = "차단";
      else if (open.some((t) => t.heartbeatStale || t.progressStale || t.status === "triage")) status = "확인 필요";
      else if (open.some((t) => LIVE_ACTIVE.has(t.status))) status = "작업 중";
      else if (open.length) status = "대기";
      else if (tasks.length) status = "완료";
      else if (BLOCKED_DEPTS.has(room.id)) status = "차단";
      this.deptStatus[room.id] = status;
    }

    // 직원 상태 — assignee(프로필 id) 로 캐릭터를 찾는다
    const liveState = new Map((ops.liveAgents ?? []).map((a) => [a.profile, a.state]));
    for (const agent of this.agents) {
      if (agent.rank === "ceo" || !agent.callsign) continue;
      const mine = ops.tasks.filter((t) => t.assignee === agent.callsign && !LIVE_TERMINAL.has(t.status));
      const live = liveState.get(agent.callsign);
      let state: "working" | "blocked" | "attention" | "idle" = "idle";
      if (live === "attention" || live === "unknown" || mine.some((t) => t.heartbeatStale || t.progressStale)) state = "attention";
      else if (live === "working" || mine.some((t) => LIVE_ACTIVE.has(t.status))) state = "working";
      else if (mine.some((t) => t.status === "blocked")) state = "blocked";
      const head = mine.find((t) => LIVE_ACTIVE.has(t.status)) ?? mine.find((t) => t.status === "blocked") ?? mine[0];
      const key = `${state}:${head?.id ?? ""}:${head?.status ?? ""}`;
      if (agent.liveKey === key) continue;
      agent.liveKey = key;
      if (this.locked.has(agent.id)) continue;
      agent.queue.length = 0;
      agent.current = null;
      agent.progress = 0; // 실제 진행률은 기록에 없다 — 임의로 만들지 않는다
      agent.taskLabel = head?.title ?? DEPT_BRIEF[agent.deptId]?.task ?? "대기";
      const atHome = Math.abs(agent.x - agent.home.x) < 0.2 && Math.abs(agent.y - agent.home.y) < 0.2;
      if (!atHome) this.enqueue(agent, { k: "walk", to: agent.home }, { k: "face", dir: "up" });
      if (state === "working") {
        this.enqueue(agent, { k: "status", s: "업무 중" }, { k: "anim", a: "type" });
      } else if (state === "blocked") {
        this.enqueue(agent, { k: "status", s: "차단" }, { k: "anim", a: "sit" }, {
          k: "fn",
          fn: () => this.say(agent, head?.reason ? head.reason.slice(0, 60) : "막혔어요 — 도움 요청", 4, "think"),
        });
      } else if (state === "attention") {
        this.enqueue(agent, { k: "status", s: "확인 필요" }, { k: "anim", a: "sit" }, {
          k: "fn",
          fn: () => this.say(agent, "최근 진행 소식이 없어요", 3.4, "think"),
        });
      } else {
        this.enqueue(agent, { k: "status", s: "대기" }, { k: "anim", a: "sit" });
      }
    }

    // 이벤트 — 새 기록만 피드와 배달 이동으로 표현한다 (처음 받은 과거 기록은 재생하지 않음)
    for (const event of ops.events) {
      const name = LIVE_EVENT_NAMES[event.kind];
      if (!name) continue;
      const task = this.liveTaskById.get(event.task_id);
      const deptId = task ? DEPT_BY_LIVE_GROUP[task.group] ?? STAFF_BY_CALLSIGN[task.assignee ?? ""]?.deptId : undefined;
      const who = event.assignee ?? task?.assignee ?? "담당 미정";
      const tone = ["blocked", "crashed", "timed_out"].includes(event.kind) ? "lav" : event.kind === "completed" ? "mint" : "pink";
      this.pushLog(deptId ? roomOf(deptId).icon : "⚡", `${name} · ${who} — ${event.title ?? task?.title ?? event.task_id}${event.detail ? `: ${event.detail.slice(0, 80)}` : ""}`, tone);
      if (history) continue;
      // 기록에 글이 남은 이벤트는 담당 머리 위에 원문 첫 줄로 띄운다 (진행 메모·완료 요약·차단 사유·검수 요청)
      const speaker = STAFF_BY_CALLSIGN[event.assignee ?? task?.assignee ?? ""];
      const speakerAgent = speaker ? this.agentById.get(speaker.id) : undefined;
      if (speakerAgent && event.detail) {
        speakerAgent.note = { kind: name, text: event.detail, time: this.clockText() };
        const think = ["blocked", "crashed", "timed_out"].includes(event.kind);
        this.say(speakerAgent, `${name}: ${firstLine(event.detail)}`, 6, think ? "think" : "talk");
        if (!think) speakerAgent.anim = speakerAgent.anim === "type" ? "type" : "talk";
      }
      if (!deptId || ops.checked - event.created_at > 15) continue;
      if (["assigned", "spawned"].includes(event.kind)) this.courierQueue.push({ deptId, label: `업무 전달 · ${who}`, returning: false });
      if (event.kind === "completed") this.courierQueue.push({ deptId, label: `결과 회수 · ${who}`, returning: true });
    }
    if (this.courierQueue.length && !this.side.gen) this.side.gen = this.courierScene();
  }

  private slackSeen = new Map<string, { reportedDone: number; done: number }>();
  private slackPrimed = false;

  /** Hermes Desk /api/slack — Slack 요청 원문은 PM 머리 위에, 보고 전달 영수증은 헤르메스 머리 위에 */
  applySlack(data: LiveSlack) {
    if (!this.live.on) return;
    const hermes = this.agentById.get("hermes-lead");
    // 관측 플러그인이 없으면 ops.requests 가 비므로, Slack 에 기록된 요청 수를 대신 쓴다
    const conversations = data.conversations ?? [];
    this.live.requests = Math.max(this.live.requests, conversations.filter((c) => (c.taskIds?.length ?? 0) > 0 || c.requestText).length);
    for (const conv of data.conversations ?? []) {
      const prev = this.slackSeen.get(conv.id);
      const cur = { reportedDone: conv.reportedDone ?? 0, done: conv.done ?? 0 };
      this.slackSeen.set(conv.id, cur);
      if (!this.slackPrimed) continue; // 처음 받은 과거 대화는 재생하지 않는다
      const pmSeed = conv.profile ? STAFF_BY_CALLSIGN[conv.profile] : undefined;
      const pm = pmSeed ? this.agentById.get(pmSeed.id) : undefined;
      const title = conv.summary ?? conv.title ?? conv.requestText ?? "요청";
      if (!prev) {
        // 새 요청 — 요청자와 원문 그대로
        const who = conv.user ?? "요청자 미확인";
        this.pushLog("#", `Slack ${conv.channel ?? ""} · ${who}: “${firstLine(conv.requestText ?? title, 80)}”`, "yellow");
        if (pm) {
          pm.note = { kind: "Slack 요청", text: `${who}: ${conv.requestText ?? title}`, time: this.clockText() };
          this.say(pm, `요청 · ${who}: ${firstLine(conv.requestText ?? title)}`, 7);
          if (pm.project) this.spotlightRoom(pm.project, 8);
        } else if (hermes) {
          this.say(hermes, `Slack 요청 · ${who}: ${firstLine(conv.requestText ?? title)}`, 7);
        }
        continue;
      }
      if (cur.reportedDone > prev.reportedDone && hermes) {
        // 완료 보고가 Slack 에 실제로 전달된 것만 (kanban_notify_receipts 기준)
        hermes.note = { kind: "Slack 보고 전달", text: `${title} — 완료 ${cur.reportedDone}/${cur.done} 전달됨`, time: this.clockText() };
        this.say(hermes, `Slack 보고 전달됨 · ${firstLine(title, 30)}`, 6);
        this.pushLog("📤", `Slack 보고 전달 — ${title} (${cur.reportedDone}/${cur.done})`, "mint");
      } else if (cur.done > prev.done) {
        this.pushLog("✅", `작업 완료 기록 — ${title} (${cur.done}건, 보고 전달은 ${cur.reportedDone}건)`, "mint");
      }
    }
    this.slackPrimed = true;
  }

  /** 헤르메스가 부서로 업무를 전달하거나 결과를 회수하러 다녀온다 (office.js 의 courier 이동) */
  private *courierScene(): Generator<number | (() => boolean), void, void> {
    const hermes = this.agent("hermes-lead");
    while (this.courierQueue.length) {
      const job = this.courierQueue.shift()!;
      const room = roomOf(job.deptId);
      this.lock([hermes]);
      this.stand(hermes);
      this.say(hermes, job.label, 2.4);
      this.spotlightRoom(job.deptId, 8);
      this.goto(hermes, doorApproach(room), "이동 중");
      yield this.allFree([hermes]);
      // 실시간 모드에서는 상대 팀장의 대답을 지어내지 않는다 — 기록에 없는 대사이기 때문
      yield 1.4;
      this.sitAtDesk(hermes);
      yield this.allFree([hermes]);
      this.unlock([hermes]);
    }
  }

  // ── 틱 ──────────────────────────────────────────────────
  tick(rawDt: number) {
    if (this.paused) return;
    // 터보(건너뛰기)는 대표 결정이 필요한 지점이나 업무 종료에서 자동 해제된다
    if (this.turbo && (this.approvalPending || this.dayComplete || !this.running)) this.turbo = false;

    const raw = Math.min(rawDt, 0.05);
    const dt = raw * (this.turbo ? TURBO_SPEED : this.speed);
    if (this.live.on) {
      const now = new Date();
      this.clockMinutes = now.getHours() * 60 + now.getMinutes();
    } else if (this.running) {
      this.clockMinutes += dt * SIM_MIN_PER_SEC;
    }

    this.occupancy.clear();
    for (const agent of this.agents) {
      this.occupancy.add(Math.round(agent.y) * COLS + Math.round(agent.x));
    }

    for (const agent of this.agents) this.stepAgent(agent, dt);
    this.runSlot(this.main, dt);
    this.runSlot(this.side, dt);

    this.elapsed += dt;
    if (this.spotlight && this.elapsed > this.spotlightUntil) this.spotlight = null;
    if (this.approvalPending && this.approvalSince === null) this.approvalSince = this.elapsed;
    if (!this.approvalPending) this.approvalSince = null;
  }

  private runSlot(slot: Slot, dt: number) {
    if (!slot.gen) return;
    if (slot.wait > 0) {
      slot.wait -= dt;
      return;
    }
    if (slot.until) {
      if (!slot.until()) return;
      slot.until = null;
    }
    const result = slot.gen.next();
    if (result.done) {
      slot.gen = null;
      return;
    }
    if (typeof result.value === "number") slot.wait = result.value;
    else slot.until = result.value;
  }

  private stepAgent(agent: Agent, dt: number) {
    if (agent.speechFor > 0) {
      agent.speechFor -= dt;
      if (agent.speechFor <= 0) agent.speech = null;
    }

    if (!agent.current) {
      const next = agent.queue.shift();
      if (next) {
        agent.current = next;
        agent.timer = 0;
        this.beginAction(agent, next);
      } else {
        this.idleBrain(agent, dt);
        return;
      }
    }

    const action = agent.current;
    if (!action) return;
    agent.timer += dt;

    switch (action.k) {
      case "walk": {
        this.stepWalk(agent, dt);
        if (agent.pathIdx >= agent.path.length) {
          agent.path = [];
          agent.anim = "idle";
          agent.current = null;
        }
        break;
      }
      case "wait":
      case "say": {
        if (agent.timer >= action.dur) agent.current = null;
        break;
      }
      case "work": {
        agent.anim = "type";
        agent.progress = Math.min(1, agent.timer / action.dur);
        agent.taskLabel = action.label;
        if (agent.timer >= action.dur) {
          agent.progress = 1;
          agent.current = null;
        }
        break;
      }
      default:
        agent.current = null;
    }
  }

  private beginAction(agent: Agent, action: Action) {
    switch (action.k) {
      case "walk": {
        const path = findPath(
          { x: Math.round(agent.x), y: Math.round(agent.y) },
          action.to,
          this.occupancy,
        );
        agent.path = path;
        agent.pathIdx = 0;
        agent.anim = path.length ? "walk" : "idle";
        if (agent.status === "대기" || agent.status === "휴식") agent.status = "이동 중";
        break;
      }
      case "say":
        this.say(agent, action.text, action.dur, action.kind);
        break;
      case "face":
        agent.facing = action.dir;
        agent.heading = action.dir === "up" ? Math.PI : action.dir === "down" ? 0 : action.dir === "left" ? -Math.PI / 2 : Math.PI / 2;
        agent.current = null;
        break;
      case "anim":
        agent.anim = action.a;
        agent.current = null;
        break;
      case "status":
        agent.status = action.s;
        agent.current = null;
        break;
      case "fn":
        action.fn();
        agent.current = null;
        break;
      default:
        break;
    }
  }

  private stepWalk(agent: Agent, dt: number) {
    if (agent.pathIdx >= agent.path.length) return;
    const node = agent.path[agent.pathIdx];
    const dx = node.x - agent.x;
    const dy = node.y - agent.y;
    const dist = Math.hypot(dx, dy);

    const lastNode = agent.pathIdx === agent.path.length - 1;
    if (dist < (lastNode ? 0.06 : 0.35)) {
      if (lastNode) {
        agent.x = node.x;
        agent.y = node.y;
      }
      agent.pathIdx += 1;
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) agent.facing = dx > 0 ? "right" : "left";
    else agent.facing = dy > 0 ? "down" : "up";
    agent.heading = Math.atan2(dx, dy);

    // 웨이포인트 사이가 멀면 다음 웨이포인트 쪽으로 미리 꺾어 곡선처럼 돈다
    const step = WALK_SPEED * dt;
    agent.x += (dx / dist) * Math.min(step, dist);
    agent.y += (dy / dist) * Math.min(step, dist);
    agent.anim = "walk";
  }

  /** 할 일이 없을 때의 자율 행동 — 생각 말풍선, 커피, 잡담 */
  private idleBrain(agent: Agent, dt: number) {
    if (agent.rank === "ceo" || this.locked.has(agent.id)) return;
    // 실시간 모드에서 실제로 일하거나 막힌 직원은 자리를 지킨다
    if (this.live.on && (agent.status === "업무 중" || agent.status === "차단" || agent.status === "확인 필요")) return;
    agent.idleFor -= dt;
    if (agent.idleFor > 0) return;
    agent.idleFor = 7 + Math.random() * 14;

    const roll = Math.random();
    const blocked = BLOCKED_DEPTS.has(agent.deptId) && this.deptStatus[agent.deptId] === "차단";

    if (agent.status === "출근 전") return;

    if (roll < 0.5 || this.focusMode) {
      // 집중 모드에서는 자리에서 생각만 한다 — 커피·잡담 금지
      this.say(agent, rand(agent.thoughts), 3.4, "think");
      return;
    }
    if (roll < 0.68 || blocked) {
      // 라운지 커피 타임
      this.stand(agent);
      this.enqueue(
        agent,
        { k: "status", s: "휴식" },
        { k: "walk", to: rand(LOUNGE_ROOM.loiter) },
        { k: "say", text: rand(["잠깐 커피 ☕", "머리 좀 식히고요", "당 충전 필요해요"]), dur: 2.6, kind: "talk" },
        { k: "wait", dur: 3 + Math.random() * 4 },
      );
      this.sitAtDesk(agent);
      return;
    }
    if (roll < 0.82) {
      // 옆자리 잡담
      const mate = this.agents.find(
        (a) => a.deptId === agent.deptId && a.id !== agent.id && !this.busy(a) && a.status !== "출근 전",
      );
      if (mate) {
        this.say(agent, rand(["이거 어떻게 생각해요?", "잠깐만요, 이거 봐봐요", "미미르에 있던 결정이랑 달라요"]), 3);
        this.say(mate, rand(["오, 괜찮은데요?", "범위를 살짝 줄이면 좋겠어요", "근거만 붙이면 돼요"]), 3);
        agent.anim = "talk";
        mate.anim = "talk";
        this.enqueue(agent, { k: "wait", dur: 2.6 }, { k: "anim", a: "sit" });
        this.enqueue(mate, { k: "wait", dur: 2.6 }, { k: "anim", a: "sit" });
      }
      return;
    }
    // 자리 정리
    if (Math.abs(agent.x - agent.home.x) > 0.1 || Math.abs(agent.y - agent.home.y) > 0.1) {
      this.sitAtDesk(agent);
    }
  }

  // ── 스냅샷 ──────────────────────────────────────────────
  snapshot(): Snapshot {
    const counts = {} as Record<AgentStatus, number>;
    for (const agent of this.agents) {
      counts[agent.status] = (counts[agent.status] ?? 0) + 1;
    }
    const values = DEPT_ROOMS.map((room) => this.deptStatus[room.id]);
    return {
      clock: this.clockText(),
      running: this.running,
      paused: this.paused,
      speed: this.speed,
      turbo: this.turbo,
      dayComplete: this.dayComplete,
      phase: this.live.on
        ? this.live.connected
          ? "LIVE · Hermes Desk"
          : "LIVE · 연결 확인 필요"
        : this.phaseIndex === DECISION_PHASE && this.approved
          ? "확인 완료 · 차단 해제"
          : PHASES[this.phaseIndex] ?? "",
      phaseIndex: this.phaseIndex,
      approvalPending: this.approvalPending,
      approved: this.approved,
      briefingReady: this.briefingReady,
      deptStatus: { ...this.deptStatus },
      projectStatus: { ...this.projectStatus },
      counts,
      stats: {
        done: values.filter((v) => v === "완료").length,
        working: values.filter((v) => v === "작업 중").length,
        approval: values.filter((v) => v === "확인 필요").length,
        blocked: values.filter((v) => v === "차단").length,
      },
      log: this.log.slice(0, 24),
      meetingTitle: this.meetingTitle,
      chat: this.chat.slice(-24),
      focusMode: this.focusMode,
      spotlight: this.spotlight,
      busyWithOrder: this.side.gen !== null,
      live: { ...this.live },
    };
  }
}

export const TOTAL_PHASES = PHASES.length;
export { PHASES };
