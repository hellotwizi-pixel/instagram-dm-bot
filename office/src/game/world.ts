// 오피스 월드 맵
// 타일 그리드 기반. 0 = 걸을 수 있음, 1 = 막힘(벽·가구)

import { DEPARTMENTS, STAFF_LIST } from "../../company.config";

export const TILE = 18;
export const COLS = 74;
export const ROWS = 60;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export type Pt = { x: number; y: number };
export type RoomKind = "dept" | "ceo" | "meeting" | "lounge";

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
  x: number;
  y: number;
  w: number;
  h: number;
  doors: Pt[];
  desks: Desk[];
  /** 그 방 안에서 서성일 수 있는 자리 */
  loiter: Pt[];
};

/** 부서 방 배치 — 4열 3행 */
const COL_X = [2, 20, 38, 56];
const ROW_Y = [16, 30, 44];
const DEPT_W = 15;
const DEPT_H = 13;
/** 책상 한 줄에 4개, 최대 3줄 = 방 하나에 12명 */
const DESK_COLS = [1, 4, 7, 10];
const DESK_ROWS = [3, 6, 9];

// 부서 이름·아이콘은 company.config.ts 에서 가져옵니다.
const DEPT_LAYOUT: { id: string; name: string; short: string; icon: string }[] = DEPARTMENTS.map(
  (d) => ({ id: d.id, name: d.name, short: d.short, icon: d.icon }),
);

/** 부서별 인원 → 필요한 책상 줄 수 */
function deskRowsFor(deptId: string) {
  const n = STAFF_LIST.filter((s) => s.dept === deptId).length;
  return Math.min(DESK_ROWS.length, Math.ceil(n / DESK_COLS.length));
}

function deptRoom(index: number): Room {
  const meta = DEPT_LAYOUT[index];
  const x = COL_X[index % 4];
  const y = ROW_Y[Math.floor(index / 4)];
  const rows = deskRowsFor(meta.id);
  const desks: Desk[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (const dx of DESK_COLS) {
      desks.push({ deskX: x + dx, deskY: y + DESK_ROWS[r], seat: { x: x + dx + 1, y: y + DESK_ROWS[r] + 1 } });
    }
  }
  // 책상이 없는 줄은 서성일 수 있는 빈 바닥
  const loiter: Pt[] = [{ x: x + 13, y: y + 5 }, { x: x + 13, y: y + 8 }, { x: x + 5, y: y + 11 }, { x: x + 9, y: y + 11 }];
  for (let r = rows; r < DESK_ROWS.length; r += 1) {
    loiter.push({ x: x + 3, y: y + DESK_ROWS[r] }, { x: x + 9, y: y + DESK_ROWS[r] });
  }
  return {
    ...meta,
    kind: "dept",
    x,
    y,
    w: DEPT_W,
    h: DEPT_H,
    doors: [
      { x: x + 7, y },
      { x: x + 8, y },
    ],
    desks,
    loiter,
  };
}

export const CEO_ROOM: Room = {
  id: "ceo",
  name: "대표실",
  short: "ceo.office",
  icon: "👑",
  kind: "ceo",
  x: 2,
  y: 2,
  w: 18,
  h: 12,
  doors: [
    { x: 10, y: 13 },
    { x: 11, y: 13 },
  ],
  desks: [{ deskX: 9, deskY: 6, seat: { x: 11, y: 5 } }],
  loiter: [
    { x: 8, y: 10 },
    { x: 11, y: 10 },
    { x: 14, y: 10 },
    { x: 6, y: 8 },
  ],
};

export const MEETING_ROOM: Room = {
  id: "meeting",
  name: "분담·검토 회의실",
  short: "meeting.hall",
  icon: "💬",
  kind: "meeting",
  x: 23,
  y: 2,
  w: 26,
  h: 12,
  doors: [
    { x: 35, y: 13 },
    { x: 36, y: 13 },
  ],
  desks: [],
  loiter: [
    { x: 26, y: 10 },
    { x: 45, y: 10 },
  ],
};

export const LOUNGE_ROOM: Room = {
  id: "lounge",
  name: "AI 라운지",
  short: "lounge.chill",
  icon: "☕",
  kind: "lounge",
  x: 52,
  y: 2,
  w: 20,
  h: 12,
  doors: [
    { x: 61, y: 13 },
    { x: 62, y: 13 },
  ],
  desks: [],
  loiter: [
    { x: 56, y: 7 },
    { x: 58, y: 7 },
    { x: 60, y: 7 },
    { x: 63, y: 10 },
    { x: 66, y: 6 },
    { x: 69, y: 8 },
  ],
};

/** 회의실 좌석 8개 (테이블 위·아래) */
export const MEETING_SEATS: Pt[] = [
  { x: 31, y: 5 },
  { x: 34, y: 5 },
  { x: 37, y: 5 },
  { x: 40, y: 5 },
  { x: 31, y: 9 },
  { x: 34, y: 9 },
  { x: 37, y: 9 },
  { x: 40, y: 9 },
];

/** 대표 책상 앞 보고 위치 */
export const CEO_REPORT_SPOT: Pt = { x: 11, y: 9 };
export const CEO_SEAT: Pt = { x: 11, y: 5 };
/** 출입구 (출근·퇴근) */
export const ENTRANCE: Pt = { x: 36, y: ROWS - 1 };

export const DEPT_ROOMS: Room[] = DEPT_LAYOUT.map((_, i) => deptRoom(i));
export const ROOMS: Room[] = [CEO_ROOM, MEETING_ROOM, LOUNGE_ROOM, ...DEPT_ROOMS];

/** 미미르(회사 기억) 방 — 직원 대신 서버 랙과 조회 단말이 있다 */
export const MIMIR_ROOM = DEPT_ROOMS.find((r) => r.id === "mimir") ?? null;
/** 미미르 조회 위치 (단말 앞) */
export const MIMIR_SPOT: Pt = MIMIR_ROOM ? { x: MIMIR_ROOM.x + 7, y: MIMIR_ROOM.y + 7 } : ENTRANCE;

export type Prop = {
  kind:
    | "desk"
    | "monitor"
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
    | "brain";
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
};

/** 가구 목록 — 렌더링과 충돌 판정에 함께 사용 */
export const PROPS: Prop[] = [];

for (const room of DEPT_ROOMS) {
  if (room.id === "mimir") {
    // 서버 랙 두 줄 + 가운데 조회 단말(뇌)
    PROPS.push({ kind: "rack", x: room.x + 1, y: room.y + 2, w: 4, h: 1 });
    PROPS.push({ kind: "rack", x: room.x + 10, y: room.y + 2, w: 4, h: 1 });
    PROPS.push({ kind: "rack", x: room.x + 1, y: room.y + 10, w: 4, h: 1 });
    PROPS.push({ kind: "rack", x: room.x + 10, y: room.y + 10, w: 4, h: 1 });
    PROPS.push({ kind: "brain", x: room.x + 6, y: room.y + 4, w: 3, h: 3, label: "MIMIR" });
    PROPS.push({ kind: "screen", x: room.x + 5, y: room.y + 8, w: 5, h: 1, label: "MEMORY" });
    continue;
  }
  for (const desk of room.desks) {
    PROPS.push({ kind: "desk", x: desk.deskX, y: desk.deskY, w: 3, h: 1 });
  }
  PROPS.push({ kind: "shelf", x: room.x + 1, y: room.y + 1, w: 3, h: 1 });
  PROPS.push({ kind: "plant", x: room.x + 13, y: room.y + 1, w: 1, h: 1 });
  if (room.desks.length <= 8) PROPS.push({ kind: "cabinet", x: room.x + 11, y: room.y + 11, w: 2, h: 1 });
}

PROPS.push({ kind: "ceo-desk", x: 9, y: 6, w: 5, h: 2 });
PROPS.push({ kind: "rug", x: 8, y: 9, w: 7, h: 3 });
PROPS.push({ kind: "plant", x: 4, y: 4, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: 17, y: 4, w: 1, h: 1 });

PROPS.push({ kind: "table", x: 31, y: 6, w: 10, h: 3 });
PROPS.push({ kind: "screen", x: 28, y: 3, w: 5, h: 1, label: "SLACK" });
PROPS.push({ kind: "whiteboard", x: 42, y: 3, w: 5, h: 1 });
PROPS.push({ kind: "plant", x: 25, y: 11, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: 46, y: 11, w: 1, h: 1 });

PROPS.push({ kind: "sofa", x: 56, y: 5, w: 5, h: 1 });
PROPS.push({ kind: "table", x: 62, y: 8, w: 3, h: 2 });
PROPS.push({ kind: "coffee", x: 66, y: 4, w: 3, h: 1, label: "☕" });
PROPS.push({ kind: "plant", x: 70, y: 11, w: 1, h: 1 });
PROPS.push({ kind: "plant", x: 53, y: 11, w: 1, h: 1 });

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

/** 방 안쪽 문 앞 타일 */
export function doorApproach(room: Room): Pt {
  const door = room.doors[0];
  return door.y === room.y ? { x: door.x, y: door.y - 1 } : { x: door.x, y: door.y + 1 };
}
