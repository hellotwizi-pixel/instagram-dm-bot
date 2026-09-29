// 월드 배치 검증: 방 겹침 없음, 모든 자리·문·조회 위치가 출입구에서 도달 가능
import {
  CEO_REPORT_SPOT,
  COLS,
  ENTRANCE,
  MEETING_SEATS,
  MIMIR_SPOT,
  PROJECT_ROOMS,
  ROOMS,
  ROWS,
  doorApproach,
  projectSpot,
  walkable,
} from "../src/game/world";

let failed = 0;
const fail = (msg: string) => {
  failed += 1;
  console.error("✗", msg);
};

// 1) 방 겹침 + 경계
for (let i = 0; i < ROOMS.length; i += 1) {
  const a = ROOMS[i];
  if (a.x < 1 || a.y < 1 || a.x + a.w > COLS - 1 || a.y + a.h > ROWS - 1) fail(`${a.id} 가 월드 밖으로 나감`);
  for (let j = i + 1; j < ROOMS.length; j += 1) {
    const b = ROOMS[j];
    const overlap = a.x < b.x + b.w + 1 && b.x < a.x + a.w + 1 && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1;
    if (overlap) fail(`${a.id} 와 ${b.id} 가 겹치거나 붙어 있음 (통로 없음)`);
  }
}

// 2) 도달 가능성 — 출입구에서 BFS
const seen = new Uint8Array(COLS * ROWS);
const queue: number[] = [ENTRANCE.y * COLS + ENTRANCE.x];
seen[queue[0]] = 1;
while (queue.length) {
  const cur = queue.shift()!;
  const cx = cur % COLS;
  const cy = Math.floor(cur / COLS);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (!walkable(nx, ny)) continue;
    const idx = ny * COLS + nx;
    if (seen[idx]) continue;
    seen[idx] = 1;
    queue.push(idx);
  }
}
const reach = (p: { x: number; y: number }, label: string) => {
  if (!walkable(p.x, p.y)) fail(`${label} (${p.x},${p.y}) 가 막힌 타일`);
  else if (!seen[p.y * COLS + p.x]) fail(`${label} (${p.x},${p.y}) 에 출입구에서 도달 불가`);
};

for (const room of ROOMS) {
  for (const desk of room.desks) reach(desk.seat, `${room.id} 자리`);
  for (const spot of room.loiter) reach(spot, `${room.id} loiter`);
  reach(doorApproach(room), `${room.id} 문 앞`);
}
for (const seat of MEETING_SEATS) reach(seat, "회의 좌석");
reach(MIMIR_SPOT, "미미르 조회 위치");
reach(CEO_REPORT_SPOT, "대표 보고 위치");
for (const room of PROJECT_ROOMS) reach(projectSpot(room.id), `${room.id} PM 앞`);

// 3) 지도 출력 (눈으로 확인용)
if (process.env.PRINT_MAP) {
  const lines: string[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    let line = "";
    for (let x = 0; x < COLS; x += 1) line += walkable(x, y) ? (seen[y * COLS + x] ? "." : "?") : "#";
    lines.push(line);
  }
  console.log(lines.join("\n"));
}

if (failed) {
  console.error(`\n${failed}개 문제`);
  process.exit(1);
}
console.log(`✓ 방 ${ROOMS.length}개 배치 OK · 모든 자리 도달 가능 · ${COLS}x${ROWS}`);
