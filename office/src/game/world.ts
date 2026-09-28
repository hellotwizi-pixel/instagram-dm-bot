// 오피스 월드 맵 — 원형 구조
//   중앙 코어 : 미미르(구체) + 그 아래 작은 대표실
//   안쪽 링   : 프로젝트 방 6개 (각 방에 PM)          ← Slack 요청이 먼저 들어오는 곳
//   바깥 링   : 공유 부서 방 9개 + 헤르메스 HQ + 회의실 + 라운지 (12칸, 아래쪽 한 칸은 출입구)
// 타일 그리드 기반. 0 = 걸을 수 있음, 1 = 막힘(벽·가구)

import { DEPARTMENTS, MIMIR, PROJECTS, STAFF_LIST } from "../../company.config";

export const TILE = 18;
export const COLS = 106;
export const ROWS = 94;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export type Pt = { x: number; y: number };
export type RoomKind = "dept" | "project" | "ceo" | "meeting" | "lounge";

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

/** 사무실 중심 (미미르 구체의 중심) */
export const CENTER: Pt = { x: 53, y: 46 };
/** 미미르 구체 반지름(타일) — 이 안은 걸을 수 없다 */
export const MIMIR_RADIUS = 5;
export const MIMIR_CENTER: Pt = CENTER;
/** 미미르 조회 위치 (구체 바로 아래) */
export const MIMIR_SPOT: Pt = { x: CENTER.x, y: CENTER.y + MIMIR_RADIUS + 1 };
export const MIMIR_ID = MIMIR.id;

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

/** 중심을 향한 벽에 문을 낸다 (위·아래·왼쪽·오른쪽 중 가장 가까운 벽) */
function doorToward(x: number, y: number, w: number, h: number, target: Pt): Pt {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (Math.abs(dx) * h > Math.abs(dy) * w) {
    return dx > 0 ? { x: x + w - 1, y: Math.floor(cy) } : { x, y: Math.floor(cy) };
  }
  return dy > 0 ? { x: Math.floor(cx), y: y + h - 1 } : { x: Math.floor(cx), y };
}

/** 타원 위의 슬롯 좌표 (방의 중심) */
function ringSlot(angleDeg: number, rx: number, ry: number): Pt {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CENTER.x + rx * Math.cos(a), y: CENTER.y + ry * Math.sin(a) };
}

function placeRoom(center: Pt, w: number, h: number): Pt {
  return { x: Math.round(center.x - w / 2), y: Math.round(center.y - h / 2) };
}

// ── 중앙: 대표실 (미미르 구체 아래, 작게) ─────────────────
const CEO_W = 11;
const CEO_H = 8;
export const CEO_ROOM: Room = (() => {
  const x = CENTER.x - 5;
  const y = CENTER.y + MIMIR_RADIUS + 3;
  return {
    id: "ceo",
    name: "대표실",
    short: "ceo.core",
    icon: "👑",
    kind: "ceo",
    x,
    y,
    w: CEO_W,
    h: CEO_H,
    doors: [{ x: x + 5, y: y + CEO_H - 1 }],
    desks: [{ deskX: x + 3, deskY: y + 3, seat: { x: x + 5, y: y + 2 } }],
    loiter: [
      { x: x + 2, y: y + 5 },
      { x: x + 8, y: y + 5 },
    ],
  };
})();
export const CEO_SEAT: Pt = CEO_ROOM.desks[0].seat;
/** 대표 책상 앞 보고 위치 */
export const CEO_REPORT_SPOT: Pt = { x: CEO_SEAT.x, y: CEO_ROOM.y + 5 };

// ── 안쪽 링: 프로젝트 방 6개 ─────────────────────────────
const PROJECT_W = 11;
const PROJECT_H = 8;
const INNER_RX = 26;
const INNER_RY = 19;

export const PROJECT_ROOMS: Room[] = PROJECTS.map((p, i) => {
  const angle = -60 + i * 60; // 맨 아래(90°)는 비워 대표실 문 앞 통로로 쓴다
  const { x, y } = placeRoom(ringSlot(angle, INNER_RX, INNER_RY), PROJECT_W, PROJECT_H);
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
    // 윗벽에 문이 나면 요청 보드(x+1..x+6)를 피해 오른쪽으로 낸다
    doors: [(() => { const d = doorToward(x, y, PROJECT_W, PROJECT_H, CENTER); return d.y === y ? { x: x + 8, y } : d; })()],
    desks: deskGrid(x, y, PROJECT_W, [3], n),
    loiter: [
      { x: x + 8, y: y + 3 },
      { x: x + 8, y: y + 6 },
      { x: x + 2, y: y + 6 },
    ],
  };
});

// ── 바깥 링: 부서 9 + 헤르메스 + 회의실 + 라운지 (13슬롯 중 아래 1칸은 출입구) ──
const OUTER_RX = 44;
const OUTER_RY = 38;
const DEPT_W = 13;
const DEPT_H = 12;
const SLOT_COUNT = 13;
/** 시계방향 슬롯 순서. 맨 아래(90°)는 비워서 출입구 통로로 쓴다 */
const OUTER_ORDER = ["hermes", "dev", "plan", "design", "mkt", "ad", "meeting", null, "lounge", "ops", "legal", "sec", "aios"] as const;

function outerSlot(index: number): Pt {
  // index 7 이 정확히 90°(아래) 가 되도록 맞춘다
  const angle = 90 + (index - 7) * (360 / SLOT_COUNT);
  return ringSlot(angle, OUTER_RX, OUTER_RY);
}

const SHARED_DEPTS = DEPARTMENTS.filter((d) => d.id !== "hermes");

function deptRoom(id: string, slot: number): Room {
  const meta = DEPARTMENTS.find((d) => d.id === id)!;
  const n = staffCount((s) => s.dept === id);
  const { x, y } = placeRoom(outerSlot(slot), DEPT_W, DEPT_H);
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
    x,
    y,
    w: DEPT_W,
    h: DEPT_H,
    doors: [doorToward(x, y, DEPT_W, DEPT_H, CENTER)],
    desks,
    loiter,
  };
}

const MEET_W = 15;
const MEET_H = 12;
export const MEETING_ROOM: Room = (() => {
  const { x, y } = placeRoom(outerSlot(OUTER_ORDER.indexOf("meeting")), MEET_W, MEET_H);
  return {
    id: "meeting",
    name: "분담·검토 회의실",
    short: "meeting.hall",
    icon: "💬",
    kind: "meeting",
    x,
    y,
    w: MEET_W,
    h: MEET_H,
    doors: [doorToward(x, y, MEET_W, MEET_H, CENTER)],
    desks: [],
    loiter: [
      { x: x + 2, y: y + 10 },
      { x: x + 12, y: y + 10 },
    ],
  };
})();
/** 회의실 좌석 6개 (테이블 위·아래) */
export const MEETING_SEATS: Pt[] = [
  { x: MEETING_ROOM.x + 4, y: MEETING_ROOM.y + 3 },
  { x: MEETING_ROOM.x + 7, y: MEETING_ROOM.y + 3 },
  { x: MEETING_ROOM.x + 10, y: MEETING_ROOM.y + 3 },
  { x: MEETING_ROOM.x + 4, y: MEETING_ROOM.y + 7 },
  { x: MEETING_ROOM.x + 7, y: MEETING_ROOM.y + 7 },
  { x: MEETING_ROOM.x + 10, y: MEETING_ROOM.y + 7 },
];
/** 회의 테이블 윗줄 좌석은 아래를 보고, 아랫줄은 위를 본다 */
export const MEETING_TABLE_Y = MEETING_ROOM.y + 5;

const LOUNGE_W = 10;
const LOUNGE_H = 10;
export const LOUNGE_ROOM: Room = (() => {
  const { x, y } = placeRoom(outerSlot(OUTER_ORDER.indexOf("lounge")), LOUNGE_W, LOUNGE_H);
  return {
    id: "lounge",
    name: "AI 라운지",
    short: "lounge.chill",
    icon: "☕",
    kind: "lounge",
    x,
    y,
    w: LOUNGE_W,
    h: LOUNGE_H,
    doors: [doorToward(x, y, LOUNGE_W, LOUNGE_H, CENTER)],
    desks: [],
    loiter: [
      { x: x + 2, y: y + 2 },
      { x: x + 6, y: y + 2 },
      { x: x + 2, y: y + 6 },
      { x: x + 7, y: y + 7 },
      { x: x + 4, y: y + 8 },
    ],
  };
})();

export const HERMES_ROOM: Room = deptRoom("hermes", OUTER_ORDER.indexOf("hermes"));
export const SHARED_ROOMS: Room[] = SHARED_DEPTS.map((d) => deptRoom(d.id, OUTER_ORDER.indexOf(d.id as (typeof OUTER_ORDER)[number])));
/** 직원이 앉는 부서 방 (공유 부서 9 + 헤르메스) — deptStatus·명단의 기준 */
export const DEPT_ROOMS: Room[] = [...SHARED_ROOMS, HERMES_ROOM];
export const ROOMS: Room[] = [...PROJECT_ROOMS, CEO_ROOM, HERMES_ROOM, MEETING_ROOM, LOUNGE_ROOM, ...SHARED_ROOMS];

/** 출입구 (출근·퇴근) — 바깥 링의 빈 슬롯 아래 */
export const ENTRANCE: Pt = { x: CENTER.x, y: ROWS - 1 };

/** 프로젝트 PM 책상 앞 (헤르메스가 요청을 전달하는 자리) */
export function projectSpot(projectId: string): Pt {
  const room = roomOf(projectId);
  const seat = room.desks[0]?.seat ?? { x: room.x + 2, y: room.y + 4 };
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
    | "board"
    | "reactor";
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
  if (room.desks.length <= 6) PROPS.push({ kind: "cabinet", x: room.x + 9, y: room.y + 10, w: 2, h: 1 });
}

// 미미르 구체 — 렌더링용. 충돌은 반지름으로 따로 계산한다
PROPS.push({
  kind: "reactor",
  x: CENTER.x - MIMIR_RADIUS,
  y: CENTER.y - MIMIR_RADIUS,
  w: MIMIR_RADIUS * 2 + 1,
  h: MIMIR_RADIUS * 2 + 1,
  label: "MIMIR",
});

// 대표실
PROPS.push({ kind: "ceo-desk", x: CEO_ROOM.x + 3, y: CEO_ROOM.y + 3, w: 5, h: 2 });
PROPS.push({ kind: "rug", x: CEO_ROOM.x + 2, y: CEO_ROOM.y + 5, w: 7, h: 2 });
PROPS.push({ kind: "plant", x: CEO_ROOM.x + 1, y: CEO_ROOM.y + 1, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: CEO_ROOM.x + 9, y: CEO_ROOM.y + 1, w: 1, h: 1 });

// 회의실
PROPS.push({ kind: "table", x: MEETING_ROOM.x + 3, y: MEETING_ROOM.y + 4, w: 9, h: 3 });
PROPS.push({ kind: "screen", x: MEETING_ROOM.x + 2, y: MEETING_ROOM.y + 1, w: 5, h: 1, label: "SLACK" });
PROPS.push({ kind: "whiteboard", x: MEETING_ROOM.x + 8, y: MEETING_ROOM.y + 1, w: 5, h: 1 });

// 라운지
PROPS.push({ kind: "sofa", x: LOUNGE_ROOM.x + 1, y: LOUNGE_ROOM.y + 4, w: 5, h: 1 });
PROPS.push({ kind: "coffee", x: LOUNGE_ROOM.x + 7, y: LOUNGE_ROOM.y + 1, w: 2, h: 1, label: "☕" });
PROPS.push({ kind: "table", x: LOUNGE_ROOM.x + 6, y: LOUNGE_ROOM.y + 5, w: 2, h: 2 });

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
    if (prop.kind === "rug" || prop.kind === "reactor") continue;
    for (let y = prop.y; y < prop.y + prop.h; y += 1) {
      for (let x = prop.x; x < prop.x + prop.w; x += 1) block(x, y);
    }
  }

  // 미미르 구체
  for (let y = CENTER.y - MIMIR_RADIUS; y <= CENTER.y + MIMIR_RADIUS; y += 1) {
    for (let x = CENTER.x - MIMIR_RADIUS; x <= CENTER.x + MIMIR_RADIUS; x += 1) {
      if (Math.hypot(x - CENTER.x, y - CENTER.y) <= MIMIR_RADIUS) block(x, y);
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

/**
 * 복도 — 두 개의 링 복도(코어 둘레 · 두 링 사이)와 각 방 문 앞에서 링까지 이어지는 스포크.
 * 복도 밖 바닥도 걸을 수는 있지만 경로 비용이 높아서 캐릭터는 복도를 따라 돈다.
 */
function buildCorridor(): Uint8Array {
  const c = new Uint8Array(COLS * ROWS);
  const mark = (x: number, y: number) => {
    if (walkable(x, y)) c[y * COLS + x] = 1;
  };
  const ring = (rx: number, ry: number, width: number) => {
    for (let y = 1; y < ROWS - 1; y += 1) {
      for (let x = 1; x < COLS - 1; x += 1) {
        const r = Math.hypot((x - CENTER.x) / rx, (y - CENTER.y) / ry);
        if (Math.abs(r - 1) * Math.min(rx, ry) <= width / 2) mark(x, y);
      }
    }
  };
  ring(16, 12, 2.4); // 코어 둘레
  ring(35, 28, 2.6); // 프로젝트 링과 부서 링 사이
  // 스포크: 문 앞에서 중심 방향으로 곧게, 링 복도를 만날 때까지
  const spoke = (from: Pt, toward: Pt) => {
    let { x, y } = from;
    const dx = Math.sign(toward.x - x);
    const dy = Math.sign(toward.y - y);
    const horizontal = Math.abs(toward.x - x) * ROWS > Math.abs(toward.y - y) * COLS;
    for (let i = 0; i < 40; i += 1) {
      if (!walkable(x, y)) break;
      mark(x, y);
      if (i > 0 && c[y * COLS + x] && isRingTile(x, y)) break;
      if (horizontal) x += dx;
      else y += dy;
    }
  };
  const isRingTile = (x: number, y: number) => {
    for (const [rx, ry, w] of [
      [16, 12, 2.4],
      [35, 28, 2.6],
    ]) {
      const r = Math.hypot((x - CENTER.x) / rx, (y - CENTER.y) / ry);
      if (Math.abs(r - 1) * Math.min(rx, ry) <= w / 2) return true;
    }
    return false;
  };
  for (const room of ROOMS) spoke(doorApproach(room), CENTER);
  // 출입구 → 바깥 링
  for (let y = ROWS - 2; y >= CENTER.y; y -= 1) {
    mark(ENTRANCE.x, y);
    mark(ENTRANCE.x + 1, y);
    if (isRingTile(ENTRANCE.x, y)) break;
  }
  // 미미르 단말 앞 ↔ 코어 링
  for (let y = MIMIR_SPOT.y; y <= CEO_ROOM.y; y += 1) mark(MIMIR_SPOT.x, y);
  return c;
}

export const CORRIDOR = buildCorridor();

/** 이동 비용 — 복도·방 안 1, 그 밖의 빈 바닥 4 */
const COST: Uint8Array = (() => {
  const cost = new Uint8Array(COLS * ROWS).fill(4);
  for (let i = 0; i < cost.length; i += 1) if (CORRIDOR[i]) cost[i] = 1;
  for (const room of ROOMS) {
    for (let y = room.y + 1; y < room.y + room.h - 1; y += 1) {
      for (let x = room.x + 1; x < room.x + room.w - 1; x += 1) cost[y * COLS + x] = 1;
    }
  }
  return cost;
})();
export function stepCost(x: number, y: number): number {
  return COST[y * COLS + x];
}

export function roomOf(id: string): Room {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`unknown room: ${id}`);
  return room;
}

/** 문 바로 바깥 타일 (첫 번째 문 기준) */
export function doorApproach(room: Room): Pt {
  const door = room.doors[0];
  if (door.y === room.y) return { x: door.x, y: door.y - 1 };
  if (door.y === room.y + room.h - 1) return { x: door.x, y: door.y + 1 };
  if (door.x === room.x) return { x: door.x - 1, y: door.y };
  return { x: door.x + 1, y: door.y };
}
