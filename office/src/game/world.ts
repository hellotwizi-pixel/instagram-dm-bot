// 오피스 월드 맵 — 3층 구조
//   윗줄   : 프로젝트 방 6개 (각 방에 PM)         ← Slack 요청이 먼저 들어오는 곳
//   가운데 : 대표실 · 헤르메스 HQ · 미미르(중앙) · 회의실 · 라운지
//   아랫줄 : 공유 부서 방 9개 (두 줄)            ← PM 이 배정한 일을 하는 공유 풀
// 타일 그리드 기반. 0 = 걸을 수 있음, 1 = 막힘(벽·가구)

import { DEPARTMENTS, MIMIR, PROJECTS, STAFF_LIST } from "../../company.config";

export const TILE = 18;
export const COLS = 74;
export const ROWS = 56;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export type Pt = { x: number; y: number };
export type RoomKind = "dept" | "project" | "ceo" | "meeting" | "lounge" | "mimir";

export type Desk = {
  /** 책상 상판 좌측 타일 */
  deskX: number;
  deskY: number;
  /** 앉는 자리(경로 목적지) */
  seat: Pt;
};

export type Room = {
  id: string;
  name: string;
  short: string;
  icon: string;
  kind: RoomKind;
  color?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doors: Pt[];
  desks: Desk[];
  /** 그 방 안에서 서성일 수 있는 자리 */
  loiter: Pt[];
};

/** 책상 한 개는 3칸. 방 안쪽 왼쪽부터 채우고 오른쪽 한 칸은 통로로 남긴다 */
function deskGrid(x: number, y: number, w: number, rows: number[], count: number): Desk[] {
  const cols = Math.floor((w - 3) / 3); // 오른쪽 통로 1칸 확보
  const desks: Desk[] = [];
  for (const dy of rows) {
    for (let c = 0; c < cols; c += 1) {
      if (desks.length >= count) return desks;
      const dx = 1 + c * 3;
      desks.push({ deskX: x + dx, deskY: y + dy, seat: { x: x + dx + 1, y: y + dy + 1 } });
    }
  }
  return desks;
}

function staffCount(pred: (s: (typeof STAFF_LIST)[number]) => boolean) {
  return STAFF_LIST.filter(pred).length;
}

// ── 윗줄: 프로젝트 방 6개 ───────────────────────────────
const PROJECT_Y = 2;
const PROJECT_W = 11;
const PROJECT_H = 9;
const PROJECT_X = [2, 14, 26, 38, 50, 62];

export const PROJECT_ROOMS: Room[] = PROJECTS.map((p, i) => {
  const x = PROJECT_X[i];
  const y = PROJECT_Y;
  const n = Math.max(1, staffCount((s) => s.project === p.id));
  return {
    id: p.id,
    name: p.name,
    short: p.short,
    icon: p.icon,
    color: p.color,
    kind: "project",
    x,
    y,
    w: PROJECT_W,
    h: PROJECT_H,
    doors: [{ x: x + 5, y: y + PROJECT_H - 1 }],
    desks: deskGrid(x, y, PROJECT_W, [4], n),
    loiter: [
      { x: x + 8, y: y + 3 },
      { x: x + 8, y: y + 6 },
      { x: x + 2, y: y + 7 },
    ],
  };
});

// ── 가운데 줄 ───────────────────────────────────────────
const MID_Y = 13;
const MID_H = 13;

export const CEO_ROOM: Room = {
  id: "ceo",
  name: "대표실",
  short: "ceo.office",
  icon: "👑",
  kind: "ceo",
  x: 2,
  y: MID_Y,
  w: 13,
  h: MID_H,
  doors: [{ x: 8, y: MID_Y + MID_H - 1 }],
  desks: [{ deskX: 6, deskY: MID_Y + 5, seat: { x: 8, y: MID_Y + 4 } }],
  loiter: [
    { x: 4, y: MID_Y + 9 },
    { x: 11, y: MID_Y + 9 },
    { x: 3, y: MID_Y + 3 },
  ],
};

const HERMES_X = 16;
const HERMES_W = 13;
export const HERMES_ROOM: Room = (() => {
  const meta = DEPARTMENTS.find((d) => d.id === "hermes")!;
  const n = staffCount((s) => s.dept === "hermes");
  return {
    id: "hermes",
    name: meta.name,
    short: meta.short,
    icon: meta.icon,
    kind: "dept",
    x: HERMES_X,
    y: MID_Y,
    w: HERMES_W,
    h: MID_H,
    doors: [
      { x: HERMES_X + 6, y: MID_Y },
      { x: HERMES_X + 6, y: MID_Y + MID_H - 1 },
    ],
    desks: deskGrid(HERMES_X, MID_Y, HERMES_W, [3, 6, 9], n),
    loiter: [
      { x: HERMES_X + 11, y: MID_Y + 5 },
      { x: HERMES_X + 11, y: MID_Y + 8 },
    ],
  };
})();

const MIMIR_X = 30;
const MIMIR_W = 17;
export const MIMIR_ROOM: Room = {
  id: MIMIR.id,
  name: MIMIR.name,
  short: MIMIR.short,
  icon: MIMIR.icon,
  kind: "mimir",
  x: MIMIR_X,
  y: MID_Y,
  w: MIMIR_W,
  h: MID_H,
  doors: [
    { x: MIMIR_X + 8, y: MID_Y },
    { x: MIMIR_X + 8, y: MID_Y + MID_H - 1 },
  ],
  desks: [],
  loiter: [
    { x: MIMIR_X + 3, y: MID_Y + 6 },
    { x: MIMIR_X + 13, y: MID_Y + 6 },
  ],
};
/** 미미르 조회 위치 (뇌 단말 앞) */
export const MIMIR_SPOT: Pt = { x: MIMIR_X + 8, y: MID_Y + 7 };
/** 미미르 중심 (입자 효과의 출발점) */
export const MIMIR_CENTER: Pt = { x: MIMIR_X + 8, y: MID_Y + 5 };

const MEET_X = 48;
const MEET_W = 16;
export const MEETING_ROOM: Room = {
  id: "meeting",
  name: "분담·검토 회의실",
  short: "meeting.hall",
  icon: "💬",
  kind: "meeting",
  x: MEET_X,
  y: MID_Y,
  w: MEET_W,
  h: MID_H,
  doors: [
    { x: MEET_X + 8, y: MID_Y },
    { x: MEET_X + 8, y: MID_Y + MID_H - 1 },
  ],
  desks: [],
  loiter: [
    { x: MEET_X + 2, y: MID_Y + 10 },
    { x: MEET_X + 13, y: MID_Y + 10 },
  ],
};

/** 회의실 좌석 6개 (테이블 위·아래) */
export const MEETING_SEATS: Pt[] = [
  { x: MEET_X + 4, y: MID_Y + 4 },
  { x: MEET_X + 7, y: MID_Y + 4 },
  { x: MEET_X + 10, y: MID_Y + 4 },
  { x: MEET_X + 4, y: MID_Y + 8 },
  { x: MEET_X + 7, y: MID_Y + 8 },
  { x: MEET_X + 10, y: MID_Y + 8 },
];
/** 회의 테이블 윗줄 좌석은 아래를 보고, 아랫줄은 위를 본다 */
export const MEETING_TABLE_Y = MID_Y + 6;

const LOUNGE_X = 65;
export const LOUNGE_ROOM: Room = {
  id: "lounge",
  name: "AI 라운지",
  short: "lounge.chill",
  icon: "☕",
  kind: "lounge",
  x: LOUNGE_X,
  y: MID_Y,
  w: 8,
  h: MID_H,
  doors: [
    { x: LOUNGE_X + 3, y: MID_Y },
    { x: LOUNGE_X + 3, y: MID_Y + MID_H - 1 },
  ],
  desks: [],
  loiter: [
    { x: LOUNGE_X + 2, y: MID_Y + 3 },
    { x: LOUNGE_X + 5, y: MID_Y + 3 },
    { x: LOUNGE_X + 2, y: MID_Y + 6 },
    { x: LOUNGE_X + 5, y: MID_Y + 9 },
    { x: LOUNGE_X + 3, y: MID_Y + 10 },
  ],
};

// ── 아랫줄: 공유 부서 방 9개 (5 + 4) ────────────────────
const DEPT_W = 13;
const DEPT_H = 13;
const DEPT_SLOTS: Pt[] = [
  { x: 2, y: 27 },
  { x: 16, y: 27 },
  { x: 30, y: 27 },
  { x: 44, y: 27 },
  { x: 58, y: 27 },
  { x: 9, y: 41 },
  { x: 23, y: 41 },
  { x: 37, y: 41 },
  { x: 51, y: 41 },
];

const SHARED_DEPTS = DEPARTMENTS.filter((d) => d.id !== "hermes");

function deptRoom(index: number): Room {
  const meta = SHARED_DEPTS[index];
  const { x, y } = DEPT_SLOTS[index];
  const n = staffCount((s) => s.dept === meta.id);
  const desks = deskGrid(x, y, DEPT_W, [3, 6, 9], n);
  const rows = Math.ceil(desks.length / 3);
  const loiter: Pt[] = [{ x: x + 11, y: y + 5 }, { x: x + 11, y: y + 8 }, { x: x + 4, y: y + 11 }, { x: x + 8, y: y + 11 }];
  for (let r = rows; r < 3; r += 1) loiter.push({ x: x + 3, y: y + 3 + r * 3 }, { x: x + 8, y: y + 3 + r * 3 });
  return {
    id: meta.id,
    name: meta.name,
    short: meta.short,
    icon: meta.icon,
    kind: "dept",
    x,
    y,
    w: DEPT_W,
    h: DEPT_H,
    doors: [
      { x: x + 6, y },
      { x: x + 6, y: y + DEPT_H - 1 },
    ],
    desks,
    loiter,
  };
}

export const SHARED_ROOMS: Room[] = SHARED_DEPTS.map((_, i) => deptRoom(i));
/** 직원이 앉는 부서 방 (공유 부서 9 + 헤르메스) — deptStatus·명단의 기준 */
export const DEPT_ROOMS: Room[] = [...SHARED_ROOMS, HERMES_ROOM];
export const ROOMS: Room[] = [...PROJECT_ROOMS, CEO_ROOM, HERMES_ROOM, MIMIR_ROOM, MEETING_ROOM, LOUNGE_ROOM, ...SHARED_ROOMS];

/** 대표 책상 앞 보고 위치 */
export const CEO_SEAT: Pt = CEO_ROOM.desks[0].seat;
export const CEO_REPORT_SPOT: Pt = { x: CEO_SEAT.x, y: CEO_SEAT.y + 4 };
/** 출입구 (출근·퇴근) */
export const ENTRANCE: Pt = { x: 36, y: ROWS - 1 };

/** 프로젝트 PM 책상 앞 (헤르메스가 요청을 전달하는 자리) */
export function projectSpot(projectId: string): Pt {
  const room = roomOf(projectId);
  const seat = room.desks[0]?.seat ?? { x: room.x + 2, y: room.y + 5 };
  return { x: seat.x, y: seat.y + 1 };
}

export type Prop = {
  kind:
    | "desk"
    | "table"
    | "sofa"
    | "coffee"
    | "plant"
    | "shelf"
    | "screen"
    | "ceo-desk"
    | "rug"
    | "cabinet"
    | "whiteboard"
    | "rack"
    | "brain"
    | "board";
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color?: string;
};

/** 가구 목록 — 렌더링과 충돌 판정에 함께 사용 */
export const PROPS: Prop[] = [];

for (const room of PROJECT_ROOMS) {
  for (const desk of room.desks) PROPS.push({ kind: "desk", x: desk.deskX, y: desk.deskY, w: 3, h: 1 });
  PROPS.push({ kind: "board", x: room.x + 1, y: room.y + 1, w: 6, h: 1, label: "REQUESTS", color: room.color });
  PROPS.push({ kind: "plant", x: room.x + 9, y: room.y + 1, w: 1, h: 1 });
}

for (const room of [...SHARED_ROOMS, HERMES_ROOM]) {
  for (const desk of room.desks) PROPS.push({ kind: "desk", x: desk.deskX, y: desk.deskY, w: 3, h: 1 });
  PROPS.push({ kind: "shelf", x: room.x + 1, y: room.y + 1, w: 3, h: 1 });
  PROPS.push({ kind: "plant", x: room.x + 11, y: room.y + 1, w: 1, h: 1 });
  if (room.desks.length <= 6) PROPS.push({ kind: "cabinet", x: room.x + 9, y: room.y + 11, w: 2, h: 1 });
}

// 미미르: 서버 랙 네 귀퉁이 + 가운데 뇌 + 조회 단말
PROPS.push({ kind: "rack", x: MIMIR_X + 1, y: MID_Y + 2, w: 4, h: 1 });
PROPS.push({ kind: "rack", x: MIMIR_X + 12, y: MID_Y + 2, w: 4, h: 1 });
PROPS.push({ kind: "rack", x: MIMIR_X + 1, y: MID_Y + 10, w: 4, h: 1 });
PROPS.push({ kind: "rack", x: MIMIR_X + 12, y: MID_Y + 10, w: 4, h: 1 });
PROPS.push({ kind: "brain", x: MIMIR_X + 7, y: MID_Y + 3, w: 3, h: 3, label: "MIMIR" });
PROPS.push({ kind: "screen", x: MIMIR_X + 6, y: MID_Y + 9, w: 5, h: 1, label: "MEMORY" });

// 대표실
PROPS.push({ kind: "ceo-desk", x: 6, y: MID_Y + 5, w: 5, h: 2 });
PROPS.push({ kind: "rug", x: 5, y: MID_Y + 8, w: 7, h: 3 });
PROPS.push({ kind: "plant", x: 3, y: MID_Y + 1, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: 13, y: MID_Y + 1, w: 1, h: 1 });

// 회의실
PROPS.push({ kind: "table", x: MEET_X + 3, y: MID_Y + 5, w: 10, h: 3 });
PROPS.push({ kind: "screen", x: MEET_X + 2, y: MID_Y + 1, w: 5, h: 1, label: "SLACK" });
PROPS.push({ kind: "whiteboard", x: MEET_X + 9, y: MID_Y + 1, w: 5, h: 1 });
PROPS.push({ kind: "plant", x: MEET_X + 1, y: MID_Y + 11, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: MEET_X + 14, y: MID_Y + 11, w: 1, h: 1 });

// 라운지
PROPS.push({ kind: "sofa", x: LOUNGE_X + 1, y: MID_Y + 4, w: 5, h: 1 });
PROPS.push({ kind: "coffee", x: LOUNGE_X + 5, y: MID_Y + 1, w: 2, h: 1, label: "☕" });
PROPS.push({ kind: "table", x: LOUNGE_X + 2, y: MID_Y + 7, w: 3, h: 2 });
PROPS.push({ kind: "plant", x: LOUNGE_X + 6, y: MID_Y + 11, w: 1, h: 1 });

/** 걷기 가능 여부 그리드 */
function buildGrid(): Uint8Array {
  const grid = new Uint8Array(COLS * ROWS); // 0 = walkable

  const block = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    grid[y * COLS + x] = 1;
  };

  // 외벽
  for (let x = 0; x < COLS; x += 1) {
    block(x, 0);
    block(x, ROWS - 1);
  }
  for (let y = 0; y < ROWS; y += 1) {
    block(0, y);
    block(COLS - 1, y);
  }

  // 방 벽
  for (const room of ROOMS) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      block(x, room.y);
      block(x, room.y + room.h - 1);
    }
    for (let y = room.y; y < room.y + room.h; y += 1) {
      block(room.x, y);
      block(room.x + room.w - 1, y);
    }
  }

  // 가구
  for (const prop of PROPS) {
    if (prop.kind === "rug") continue;
    for (let y = prop.y; y < prop.y + prop.h; y += 1) {
      for (let x = prop.x; x < prop.x + prop.w; x += 1) block(x, y);
    }
  }

  // 문 뚫기
  for (const room of ROOMS) {
    for (const door of room.doors) grid[door.y * COLS + door.x] = 0;
  }
  // 출입구
  grid[ENTRANCE.y * COLS + ENTRANCE.x] = 0;
  grid[ENTRANCE.y * COLS + ENTRANCE.x + 1] = 0;

  return grid;
}

export const GRID = buildGrid();

export function walkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  return GRID[y * COLS + x] === 0;
}

export function roomOf(id: string): Room {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`unknown room: ${id}`);
  return room;
}

/** 방 안쪽 문 앞 타일 (첫 번째 문 기준) */
export function doorApproach(room: Room): Pt {
  const door = room.doors[0];
  return door.y === room.y ? { x: door.x, y: door.y - 1 } : { x: door.x, y: door.y + 1 };
}
