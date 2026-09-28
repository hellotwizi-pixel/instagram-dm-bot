// A* 경로 탐색 (8방향) + 경로 스무딩 — 오피스 타일 그리드 전용
// 결과는 타일 중심을 잇는 웨이포인트 목록이며, 직선으로 보이는 구간은 합쳐서 지그재그를 없앤다.
import { COLS, ROWS, stepCost, walkable, type Pt } from "./world";

const DIRS = [
  [0, -1, 1],
  [1, 0, 1],
  [0, 1, 1],
  [-1, 0, 1],
  [1, -1, Math.SQRT2],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/** 이진 힙 대신 작은 맵에서 충분히 빠른 정렬 삽입 큐 */
class Queue {
  private items: { idx: number; f: number }[] = [];

  push(idx: number, f: number) {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid].f > f) lo = mid + 1;
      else hi = mid;
    }
    this.items.splice(lo, 0, { idx, f });
  }

  pop(): number | undefined {
    return this.items.pop()?.idx;
  }

  get size() {
    return this.items.length;
  }
}

/**
 * from → to 최단 경로. 시작 타일은 제외하고 목적지까지의 웨이포인트 배열을 반환한다.
 * 목적지가 막혀 있으면 인접한 걸을 수 있는 타일로 대체한다.
 */
export function findPath(from: Pt, to: Pt, blocked?: Set<number>): Pt[] {
  const start = idx(from.x, from.y);
  let goal = idx(to.x, to.y);

  if (!walkable(to.x, to.y)) {
    const alt = nearestWalkable(to);
    if (!alt) return [];
    goal = idx(alt.x, alt.y);
  }
  if (start === goal) return [];

  const came = new Int32Array(COLS * ROWS).fill(-1);
  const gScore = new Float32Array(COLS * ROWS).fill(Infinity);
  const closed = new Uint8Array(COLS * ROWS);
  const open = new Queue();

  gScore[start] = 0;
  open.push(start, heuristic(start, goal));

  while (open.size) {
    const current = open.pop()!;
    if (current === goal) return smooth(rebuild(came, current, start), from, blocked);
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % COLS;
    const cy = (current / COLS) | 0;

    for (const [dx, dy, len] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      // 대각선은 양옆이 모두 뚫려 있을 때만 (벽 모서리를 뚫고 지나가지 않게)
      if (dx !== 0 && dy !== 0 && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const next = idx(nx, ny);
      if (closed[next]) continue;
      // 복도 밖 바닥은 비싸게, 다른 직원이 서 있는 칸은 더 비싸게 매겨 자연스럽게 돌아가게 한다
      const cost = ((blocked?.has(next) && next !== goal ? 6 : 0) + stepCost(nx, ny)) * len;
      const tentative = gScore[current] + cost;
      if (tentative >= gScore[next]) continue;
      came[next] = current;
      gScore[next] = tentative;
      open.push(next, tentative + heuristic(next, goal));
    }
  }
  return [];
}

function idx(x: number, y: number) {
  return y * COLS + x;
}

/** 옥타일 거리 */
function heuristic(a: number, b: number) {
  const dx = Math.abs((a % COLS) - (b % COLS));
  const dy = Math.abs(((a / COLS) | 0) - ((b / COLS) | 0));
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function rebuild(came: Int32Array, goal: number, start: number): Pt[] {
  const path: Pt[] = [];
  let cursor = goal;
  while (cursor !== start && cursor !== -1) {
    path.push({ x: cursor % COLS, y: (cursor / COLS) | 0 });
    cursor = came[cursor];
  }
  return path.reverse();
}

/**
 * 스트링 풀링: 시야가 트인 구간의 중간 웨이포인트를 지운다.
 * 시야 판정은 "지나는 타일이 모두 걸을 수 있고, 비용이 같은 종류(복도↔복도)"일 때만 통과시켜
 * 복도를 벗어나 바닥을 가로지르는 지름길은 만들지 않는다.
 */
function smooth(path: Pt[], from: Pt, blocked?: Set<number>): Pt[] {
  if (path.length < 3) return path;
  const out: Pt[] = [];
  let anchor = from;
  let i = 0;
  while (i < path.length) {
    let far = i;
    for (let j = i + 1; j < path.length; j += 1) {
      if (clear(anchor, path[j], blocked)) far = j;
      else break;
    }
    out.push(path[far]);
    anchor = path[far];
    i = far + 1;
  }
  return out;
}

/** a → b 직선이 지나는 타일이 전부 걸을 수 있고 복도 종류가 같은가 (DDA) */
function clear(a: Pt, b: Pt, blocked?: Set<number>): boolean {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 3;
  if (steps === 0) return true;
  const base = stepCost(a.x, a.y);
  const radius = 0.32; // 몸통 반경 — 모서리에 닿지 않게
  for (let s = 1; s <= steps; s += 1) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (const [ox, oy] of [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ]) {
      const tx = Math.round(x + ox);
      const ty = Math.round(y + oy);
      if (!walkable(tx, ty)) return false;
      if (stepCost(tx, ty) !== base) return false;
      if (blocked?.has(ty * COLS + tx)) return false;
    }
  }
  return true;
}

function nearestWalkable(target: Pt): Pt | null {
  for (let r = 1; r <= 4; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = target.x + dx;
        const y = target.y + dy;
        if (walkable(x, y)) return { x, y };
      }
    }
  }
  return null;
}
