// 오피스 월드 맵 — 섬 구조 (아이소메트릭)
//   윗줄   : 프로젝트 섬 6개 (각 섬에 PM)                 ← Slack 요청이 먼저 들어오는 곳
//   가운데 : 접수동(헤르메스 HQ + 회의실) · 코어 섬(미미르 + 대표실 + 라운지) · 관리동
//   아랫줄 : 제작동 · (출입구 광장) · 성장동
//   섬 사이는 다리(북·남 대로 + 연결 다리)로만 이어진다. 다리 밖은 허공이라 걸을 수 없다.
// 타일 그리드 기반. 0 = 걸을 수 있음, 1 = 막힘(허공·벽·가구)

import { DEPARTMENTS, MIMIR, PROJECTS, STAFF_LIST, WINGS } from "../../company.config";

export const TILE = 18;
export const COLS = 146;
export const ROWS = 90;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export type Pt = { x: number; y: number };
export type RoomKind = "dept" | "project" | "ceo" | "meeting" | "lounge";

export type Desk = {
  deskX: number;
  deskY: number;
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
  loiter: Pt[];
  /** 이 방이 놓인 섬 id */
  island: string;
};

export type Island = {
  id: string;
  name: string;
  icon: string;
  kind: "project" | "wing" | "core" | "intake" | "plaza";
  color?: string;
  /** 층: 0 = 바닥(아랫줄), 1 = 가운데 줄, 2 = 윗줄(프로젝트) */
  level: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** 다리: 두 점을 잇는 직선 띠 (가로 또는 세로), 폭은 타일 수. 양 끝 높이가 다르면 계단이 된다 */
export type Bridge = {
  from: Pt;
  to: Pt;
  width: number;
  kind: "avenue" | "link";
  /** 대로는 층이 정해져 있다. 연결 다리는 양 끝에 닿은 섬·대로의 층을 따른다 */
  level?: number;
  /** from 쪽 끝 높이 · to 쪽 끝 높이 (월드 단위, 초기화 때 채움) */
  h0: number;
  h1: number;
};

/** 한 층의 높이 (월드 단위) */
export const LEVEL_H = 2.2;

/** 책상 한 개는 3칸. 방 안쪽 왼쪽부터 채우고 오른쪽 한 칸은 통로로 남긴다 */
function deskGrid(x: number, y: number, w: number, rows: number[], count: number): Desk[] {
  const cols = Math.floor((w - 3) / 3);
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

// ── 윗줄: 프로젝트 섬 6개 ───────────────────────────────
const PROJECT_ISLAND_W = 14;
const PROJECT_ISLAND_H = 12;
const PROJECT_Y = 2;
const PROJECT_GAP = 6;
const PROJECT_X0 = Math.floor((COLS - (6 * PROJECT_ISLAND_W + 5 * PROJECT_GAP)) / 2);

export const ISLANDS: Island[] = [];
export const BRIDGES: Bridge[] = [];

export const PROJECT_ROOMS: Room[] = PROJECTS.map((p, i) => {
  const ix = PROJECT_X0 + i * (PROJECT_ISLAND_W + PROJECT_GAP);
  const iy = PROJECT_Y;
  ISLANDS.push({ id: p.id, name: p.name, icon: p.icon, kind: "project", color: p.color, level: 2, x: ix, y: iy, w: PROJECT_ISLAND_W, h: PROJECT_ISLAND_H });
  const x = ix + 1;
  const y = iy + 1;
  const w = PROJECT_ISLAND_W - 2;
  const h = PROJECT_ISLAND_H - 2;
  const n = Math.max(1, staffCount((s) => s.project === p.id));
  return {
    id: p.id,
    name: p.name,
    short: p.short,
    icon: p.icon,
    color: p.color,
    kind: "project",
    island: p.id,
    x,
    y,
    w,
    h,
    doors: [{ x: x + Math.floor(w / 2), y: y + h - 1 }],
    desks: deskGrid(x, y, w, [3], n),
    loiter: [
      { x: x + w - 3, y: y + 3 },
      { x: x + w - 3, y: y + 7 },
      { x: x + 2, y: y + 7 },
    ],
  };
});

// ── 대로 ────────────────────────────────────────────────
// 윗줄(2층) → 북 대로(1층) 사이, 가운데 줄(1층) → 남 대로(0층) 사이는 계단이라 5~6칸을 띄운다
const AVENUE_N_Y = PROJECT_Y + PROJECT_ISLAND_H + 5; // 19
const MID_Y = AVENUE_N_Y + 6; // 25
const MID_H = 19;
const AVENUE_S_Y = MID_Y + MID_H + 6; // 50
const LOW_Y = AVENUE_S_Y + 6; // 56
const LOW_H = 19;

// ── 가운데: 접수동 · 코어 · 관리동 / 아래: 제작동 · 성장동 ──
const WING_W = 47;
const DEPT_W = 13;
const DEPT_H = 12;
const INTAKE = { x: 4, y: MID_Y, w: 37, h: MID_H };
const CORE = { x: 46, y: MID_Y, w: 41, h: MID_H };
const WING_SLOTS: Record<string, { x: number; y: number }> = {
  admin: { x: 92, y: MID_Y },
  make: { x: 4, y: LOW_Y },
  grow: { x: COLS - 4 - WING_W, y: LOW_Y },
};

ISLANDS.push({ id: "intake", name: "접수동", icon: "⚡", kind: "intake", level: 1, x: INTAKE.x, y: INTAKE.y, w: INTAKE.w, h: INTAKE.h });
ISLANDS.push({ id: "core", name: "코어", icon: "🧠", kind: "core", level: 1, x: CORE.x, y: CORE.y, w: CORE.w, h: CORE.h });
for (const wing of WINGS) {
  const slot = WING_SLOTS[wing.id];
  ISLANDS.push({ id: wing.id, name: wing.name, icon: wing.icon, kind: "wing", level: slot.y === MID_Y ? 1 : 0, x: slot.x, y: slot.y, w: WING_W, h: LOW_H });
}

function deptRoom(id: string, x: number, y: number, island: string): Room {
  const meta = DEPARTMENTS.find((d) => d.id === id)!;
  const n = staffCount((s) => s.dept === id);
  const desks = deskGrid(x, y, DEPT_W, [2, 5, 8], n);
  const rows = Math.ceil(desks.length / 3);
  const loiter: Pt[] = [{ x: x + 11, y: y + 4 }, { x: x + 11, y: y + 7 }, { x: x + 4, y: y + 10 }, { x: x + 8, y: y + 10 }];
  for (let r = rows; r < 3; r += 1) loiter.push({ x: x + 3, y: y + 2 + r * 3 }, { x: x + 8, y: y + 2 + r * 3 });
  return {
    id,
    name: meta.name,
    short: meta.short,
    icon: meta.icon,
    kind: "dept",
    island,
    x,
    y,
    w: DEPT_W,
    h: DEPT_H,
    doors: [{ x: x + 6, y }],
    desks,
    loiter,
  };
}

export const HERMES_ROOM: Room = deptRoom("hermes", INTAKE.x + 3, INTAKE.y + 3, "intake");

const MEET_W = 15;
const MEET_H = 12;
export const MEETING_ROOM: Room = (() => {
  const x = INTAKE.x + 3 + DEPT_W + 3;
  const y = INTAKE.y + 3;
  return {
    id: "meeting",
    name: "분담·검토 회의실",
    short: "meeting.hall",
    icon: "💬",
    kind: "meeting",
    island: "intake",
    x,
    y,
    w: MEET_W,
    h: MEET_H,
    doors: [{ x: x + 7, y }],
    desks: [],
    loiter: [
      { x: x + 2, y: y + 10 },
      { x: x + 12, y: y + 10 },
    ],
  };
})();
export const MEETING_SEATS: Pt[] = [
  { x: MEETING_ROOM.x + 4, y: MEETING_ROOM.y + 3 },
  { x: MEETING_ROOM.x + 7, y: MEETING_ROOM.y + 3 },
  { x: MEETING_ROOM.x + 10, y: MEETING_ROOM.y + 3 },
  { x: MEETING_ROOM.x + 4, y: MEETING_ROOM.y + 7 },
  { x: MEETING_ROOM.x + 7, y: MEETING_ROOM.y + 7 },
  { x: MEETING_ROOM.x + 10, y: MEETING_ROOM.y + 7 },
];
export const MEETING_TABLE_Y = MEETING_ROOM.y + 5;

// 코어 섬: 왼쪽 라운지 · 가운데 미미르 · 오른쪽 대표실
export const MIMIR_RADIUS = 5;
export const MIMIR_CENTER: Pt = { x: CORE.x + 20, y: CORE.y + 8 };
export const CENTER: Pt = MIMIR_CENTER;
export const MIMIR_SPOT: Pt = { x: MIMIR_CENTER.x, y: MIMIR_CENTER.y + MIMIR_RADIUS + 1 };
export const MIMIR_ID = MIMIR.id;

const LOUNGE_W = 10;
const LOUNGE_H = 10;
export const LOUNGE_ROOM: Room = (() => {
  const x = CORE.x + 2;
  const y = CORE.y + 5;
  return {
    id: "lounge",
    name: "AI 라운지",
    short: "lounge.chill",
    icon: "☕",
    kind: "lounge",
    island: "core",
    x,
    y,
    w: LOUNGE_W,
    h: LOUNGE_H,
    doors: [{ x: x + LOUNGE_W - 1, y: y + 5 }],
    desks: [],
    loiter: [
      { x: x + 2, y: y + 2 },
      { x: x + 6, y: y + 2 },
      { x: x + 2, y: y + 6 },
      { x: x + 7, y: y + 5 },
      { x: x + 4, y: y + 8 },
    ],
  };
})();

const CEO_W = 11;
const CEO_H = 8;
export const CEO_ROOM: Room = (() => {
  const x = CORE.x + CORE.w - 2 - CEO_W;
  const y = CORE.y + 5;
  return {
    id: "ceo",
    name: "대표실",
    short: "ceo.core",
    icon: "👑",
    kind: "ceo",
    island: "core",
    x,
    y,
    w: CEO_W,
    h: CEO_H,
    doors: [{ x, y: y + 4 }],
    desks: [{ deskX: x + 3, deskY: y + 3, seat: { x: x + 5, y: y + 2 } }],
    loiter: [
      { x: x + 2, y: y + 5 },
      { x: x + 8, y: y + 5 },
    ],
  };
})();
export const CEO_SEAT: Pt = CEO_ROOM.desks[0].seat;
export const CEO_REPORT_SPOT: Pt = { x: CEO_SEAT.x, y: CEO_ROOM.y + 5 };

const SHARED_ROOMS_LIST: Room[] = [];
for (const wing of WINGS) {
  const slot = WING_SLOTS[wing.id];
  wing.depts.forEach((deptId, i) => {
    SHARED_ROOMS_LIST.push(deptRoom(deptId, slot.x + 2 + i * (DEPT_W + 2), slot.y + 3, wing.id));
  });
}
export const SHARED_ROOMS: Room[] = SHARED_ROOMS_LIST;
export const DEPT_ROOMS: Room[] = [...SHARED_ROOMS, HERMES_ROOM];
export const ROOMS: Room[] = [...PROJECT_ROOMS, CEO_ROOM, HERMES_ROOM, MEETING_ROOM, LOUNGE_ROOM, ...SHARED_ROOMS];

// ── 출입구 광장 ─────────────────────────────────────────
const PLAZA = { x: 66, y: LOW_Y + 22, w: 15, h: 8 };
ISLANDS.push({ id: "plaza", name: "출입구", icon: "🚪", kind: "plaza", level: 0, x: PLAZA.x, y: PLAZA.y, w: PLAZA.w, h: PLAZA.h });
export const ENTRANCE: Pt = { x: PLAZA.x + 7, y: PLAZA.y + PLAZA.h - 2 };

// ── 다리 ────────────────────────────────────────────────
const AVENUE_X0 = PROJECT_X0 + Math.floor(PROJECT_ISLAND_W / 2) - 1;
const AVENUE_X1 = PROJECT_X0 + 5 * (PROJECT_ISLAND_W + PROJECT_GAP) + Math.floor(PROJECT_ISLAND_W / 2) + 1;
BRIDGES.push({ from: { x: AVENUE_X0, y: AVENUE_N_Y }, to: { x: AVENUE_X1, y: AVENUE_N_Y }, width: 2, kind: "avenue", level: 1, h0: 0, h1: 0 });
BRIDGES.push({ from: { x: 8, y: AVENUE_S_Y }, to: { x: COLS - 9, y: AVENUE_S_Y }, width: 2, kind: "avenue", level: 0, h0: 0, h1: 0 });
// 프로젝트 섬 → 북 대로
for (const island of ISLANDS.filter((i) => i.kind === "project")) {
  const cx = island.x + Math.floor(island.w / 2) - 1;
  BRIDGES.push({ from: { x: cx, y: island.y + island.h }, to: { x: cx, y: AVENUE_N_Y - 1 }, width: 2, kind: "link", h0: 0, h1: 0 });
}
// 가운데 섬 ↔ 북·남 대로 (위·아래 두 곳)
for (const island of ISLANDS.filter((i) => ["intake", "core", "wing"].includes(i.kind) && i.y === MID_Y)) {
  const cx = island.x + Math.floor(island.w / 2) - 1;
  const clampedX = Math.min(Math.max(cx, AVENUE_X0), AVENUE_X1 - 1);
  BRIDGES.push({ from: { x: clampedX, y: AVENUE_N_Y + 2 }, to: { x: clampedX, y: island.y - 1 }, width: 2, kind: "link", h0: 0, h1: 0 });
  BRIDGES.push({ from: { x: cx, y: island.y + island.h }, to: { x: cx, y: AVENUE_S_Y - 1 }, width: 2, kind: "link", h0: 0, h1: 0 });
}
// 아랫줄 섬 ↔ 남 대로
for (const island of ISLANDS.filter((i) => i.kind === "wing" && i.y === LOW_Y)) {
  const cx = island.x + Math.floor(island.w / 2) - 1;
  BRIDGES.push({ from: { x: cx, y: AVENUE_S_Y + 2 }, to: { x: cx, y: island.y - 1 }, width: 2, kind: "link", h0: 0, h1: 0 });
}
// 출입구 광장 ↔ 남 대로
BRIDGES.push({ from: { x: PLAZA.x + 6, y: AVENUE_S_Y + 2 }, to: { x: PLAZA.x + 6, y: PLAZA.y - 1 }, width: 2, kind: "link", h0: 0, h1: 0 });

// ── 높이 ────────────────────────────────────────────────
function islandAt(x: number, y: number): Island | null {
  return ISLANDS.find((i) => x >= i.x && x < i.x + i.w && y >= i.y && y < i.y + i.h) ?? null;
}
function bridgeAt(x: number, y: number): Bridge | null {
  for (const b of BRIDGES) {
    const horizontal = b.from.y === b.to.y;
    const x0 = Math.min(b.from.x, b.to.x);
    const x1 = Math.max(b.from.x, b.to.x);
    const y0 = Math.min(b.from.y, b.to.y);
    const y1 = Math.max(b.from.y, b.to.y);
    if (horizontal ? x >= x0 && x <= x1 && y >= b.from.y && y < b.from.y + b.width : y >= y0 && y <= y1 && x >= b.from.x && x < b.from.x + b.width) return b;
  }
  return null;
}
/** 다리 끝 바로 바깥 타일의 높이 (섬 또는 대로) */
function endHeight(x: number, y: number): number {
  const island = islandAt(x, y);
  if (island) return island.level * LEVEL_H;
  const bridge = bridgeAt(x, y);
  if (bridge?.level !== undefined) return bridge.level * LEVEL_H;
  return 0;
}
for (const b of BRIDGES) {
  if (b.level !== undefined) {
    b.h0 = b.h1 = b.level * LEVEL_H;
    continue;
  }
  const horizontal = b.from.y === b.to.y;
  const dir = horizontal ? Math.sign(b.to.x - b.from.x) || 1 : Math.sign(b.to.y - b.from.y) || 1;
  b.h0 = endHeight(horizontal ? b.from.x - dir : b.from.x, horizontal ? b.from.y : b.from.y - dir);
  b.h1 = endHeight(horizontal ? b.to.x + dir : b.to.x, horizontal ? b.to.y : b.to.y + dir);
}

/** 월드 좌표(연속)의 바닥 높이. 섬은 층 높이, 계단 다리는 양 끝 사이를 직선 보간, 허공은 0 */
export function elevationAt(wx: number, wz: number): number {
  const tx = Math.floor(wx);
  const tz = Math.floor(wz);
  const island = islandAt(tx, tz);
  if (island) return island.level * LEVEL_H;
  const b = bridgeAt(tx, tz);
  if (!b) return 0;
  if (b.h0 === b.h1) return b.h0;
  const horizontal = b.from.y === b.to.y;
  const start = horizontal ? b.from.x : b.from.y;
  const end = horizontal ? b.to.x : b.to.y;
  const pos = horizontal ? wx : wz;
  // from 끝은 from 타일의 시작 모서리, to 끝은 to 타일의 끝 모서리
  const a = end >= start ? start : start + 1;
  const c = end >= start ? end + 1 : end;
  const t = Math.min(1, Math.max(0, (pos - a) / (c - a)));
  return b.h0 + (b.h1 - b.h0) * t;
}

export function projectSpot(projectId: string): Pt {
  const room = roomOf(projectId);
  const seat = room.desks[0]?.seat ?? { x: room.x + 2, y: room.y + 4 };
  return { x: seat.x, y: seat.y + 1 };
}

export type Prop = {
  kind: "desk" | "table" | "sofa" | "coffee" | "plant" | "shelf" | "screen" | "ceo-desk" | "rug" | "cabinet" | "whiteboard" | "board" | "reactor";
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color?: string;
};

export const PROPS: Prop[] = [];

for (const room of PROJECT_ROOMS) {
  for (const desk of room.desks) PROPS.push({ kind: "desk", x: desk.deskX, y: desk.deskY, w: 3, h: 1 });
  PROPS.push({ kind: "board", x: room.x + 1, y: room.y + 1, w: 6, h: 1, label: "REQUESTS", color: room.color });
  PROPS.push({ kind: "plant", x: room.x + room.w - 2, y: room.y + 1, w: 1, h: 1 });
}
for (const room of [...SHARED_ROOMS, HERMES_ROOM]) {
  for (const desk of room.desks) PROPS.push({ kind: "desk", x: desk.deskX, y: desk.deskY, w: 3, h: 1 });
  PROPS.push({ kind: "shelf", x: room.x + 1, y: room.y + 1, w: 3, h: 1 });
  PROPS.push({ kind: "plant", x: room.x + 11, y: room.y + 1, w: 1, h: 1 });
  if (room.desks.length <= 6) PROPS.push({ kind: "cabinet", x: room.x + 9, y: room.y + 10, w: 2, h: 1 });
}
PROPS.push({ kind: "reactor", x: MIMIR_CENTER.x - MIMIR_RADIUS, y: MIMIR_CENTER.y - MIMIR_RADIUS, w: MIMIR_RADIUS * 2 + 1, h: MIMIR_RADIUS * 2 + 1, label: "MIMIR" });
PROPS.push({ kind: "ceo-desk", x: CEO_ROOM.x + 3, y: CEO_ROOM.y + 3, w: 5, h: 2 });
PROPS.push({ kind: "rug", x: CEO_ROOM.x + 2, y: CEO_ROOM.y + 5, w: 7, h: 2 });
PROPS.push({ kind: "plant", x: CEO_ROOM.x + 1, y: CEO_ROOM.y + 1, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: CEO_ROOM.x + 9, y: CEO_ROOM.y + 1, w: 1, h: 1 });
PROPS.push({ kind: "table", x: MEETING_ROOM.x + 3, y: MEETING_ROOM.y + 4, w: 9, h: 3 });
PROPS.push({ kind: "screen", x: MEETING_ROOM.x + 2, y: MEETING_ROOM.y + 1, w: 5, h: 1, label: "SLACK" });
PROPS.push({ kind: "whiteboard", x: MEETING_ROOM.x + 8, y: MEETING_ROOM.y + 1, w: 5, h: 1 });
PROPS.push({ kind: "sofa", x: LOUNGE_ROOM.x + 1, y: LOUNGE_ROOM.y + 3, w: 5, h: 1 });
PROPS.push({ kind: "coffee", x: LOUNGE_ROOM.x + 1, y: LOUNGE_ROOM.y + 7, w: 2, h: 1, label: "☕" });
PROPS.push({ kind: "table", x: LOUNGE_ROOM.x + 6, y: LOUNGE_ROOM.y + 7, w: 2, h: 2 });
// 코어 섬 장식
PROPS.push({ kind: "plant", x: CORE.x + 14, y: CORE.y + 2, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: CORE.x + 26, y: CORE.y + 2, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: PLAZA.x + 1, y: PLAZA.y + 1, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: PLAZA.x + PLAZA.w - 2, y: PLAZA.y + 1, w: 1, h: 1 });

/** 걷기 가능 여부 그리드 — 허공은 막힘, 섬과 다리만 열림 */
function buildGrid(): Uint8Array {
  const grid = new Uint8Array(COLS * ROWS).fill(1);
  const open = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) return;
    grid[y * COLS + x] = 0;
  };
  const block = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    grid[y * COLS + x] = 1;
  };
  for (const island of ISLANDS) {
    for (let y = island.y; y < island.y + island.h; y += 1) for (let x = island.x; x < island.x + island.w; x += 1) open(x, y);
  }
  for (const bridge of BRIDGES) {
    for (const t of bridgeTiles(bridge)) open(t.x, t.y);
  }
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
  for (const prop of PROPS) {
    if (prop.kind === "rug" || prop.kind === "reactor") continue;
    for (let y = prop.y; y < prop.y + prop.h; y += 1) for (let x = prop.x; x < prop.x + prop.w; x += 1) block(x, y);
  }
  for (let y = MIMIR_CENTER.y - MIMIR_RADIUS; y <= MIMIR_CENTER.y + MIMIR_RADIUS; y += 1) {
    for (let x = MIMIR_CENTER.x - MIMIR_RADIUS; x <= MIMIR_CENTER.x + MIMIR_RADIUS; x += 1) {
      if (Math.hypot(x - MIMIR_CENTER.x, y - MIMIR_CENTER.y) <= MIMIR_RADIUS) block(x, y);
    }
  }
  for (const room of ROOMS) for (const door of room.doors) grid[door.y * COLS + door.x] = 0;
  return grid;
}

/** 다리가 덮는 타일 목록 */
export function bridgeTiles(bridge: Bridge): Pt[] {
  const out: Pt[] = [];
  const horizontal = bridge.from.y === bridge.to.y;
  if (horizontal) {
    const x0 = Math.min(bridge.from.x, bridge.to.x);
    const x1 = Math.max(bridge.from.x, bridge.to.x);
    for (let x = x0; x <= x1; x += 1) for (let k = 0; k < bridge.width; k += 1) out.push({ x, y: bridge.from.y + k });
  } else {
    const y0 = Math.min(bridge.from.y, bridge.to.y);
    const y1 = Math.max(bridge.from.y, bridge.to.y);
    for (let y = y0; y <= y1; y += 1) for (let k = 0; k < bridge.width; k += 1) out.push({ x: bridge.from.x + k, y });
  }
  return out;
}

export const GRID = buildGrid();

export function walkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  return GRID[y * COLS + x] === 0;
}

/** 섬 위·다리 위 모두 비용 1 (허공은 애초에 못 걷는다) */
export function stepCost(_x: number, _y: number): number {
  return 1;
}

export function roomOf(id: string): Room {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`unknown room: ${id}`);
  return room;
}

export function islandOf(id: string): Island {
  const island = ISLANDS.find((i) => i.id === id);
  if (!island) throw new Error(`unknown island: ${id}`);
  return island;
}

/** 문 바로 바깥 타일 (첫 번째 문 기준) */
export function doorApproach(room: Room): Pt {
  const door = room.doors[0];
  if (door.y === room.y) return { x: door.x, y: door.y - 1 };
  if (door.y === room.y + room.h - 1) return { x: door.x, y: door.y + 1 };
  if (door.x === room.x) return { x: door.x - 1, y: door.y };
  return { x: door.x + 1, y: door.y };
}
