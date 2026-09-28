// Hermes Desk(server.py) 실시간 연결
//
// 브라우저는 Hermes Desk 에 직접 붙을 수 없다(CORS 헤더 없음, Origin 검사).
// 그래서 vite.config.ts 가 `/hermes/*` 를 HERMES_DESK_URL 로 중계하면서 Origin·Host 를 맞춰 준다.
// 순서: GET /api/connect (X-Desk-Bootstrap: 1) → token → GET /api/operations?after=cursor (X-Desk-Token)
//
// 원칙(보고체계 기준.md): 기록에 없는 진행률·성공을 만들지 않는다. 연결이 끊기면 마지막 상태를 회색으로 남긴다.
import type { Company, LiveOps } from "./sim";

export class LiveBridge {
  private token: string | null = null;
  private cursor: number | null = null;
  private timer = 0;
  private stopped = false;
  private busy = false;

  constructor(
    private engine: Company,
    private base: string,
    private pollMs: number,
  ) {}

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.poll(), ms);
  }

  private async connect() {
    try {
      const response = await fetch(`${this.base}/api/connect`, {
        headers: { "X-Desk-Bootstrap": "1" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`연결 거부 (HTTP ${response.status})`);
      const data = (await response.json()) as { token?: string };
      if (!data.token) throw new Error("토큰 없음");
      this.token = data.token;
      this.engine.enterLive();
      await this.poll();
    } catch (error) {
      this.engine.enterLive();
      this.engine.setLiveError(error instanceof Error ? error.message : String(error));
      this.schedule(Math.max(this.pollMs * 3, 9000));
      this.token = null;
    }
  }

  private async poll() {
    if (this.stopped || this.busy) return;
    if (!this.token) {
      await this.connect();
      return;
    }
    this.busy = true;
    try {
      const query = this.cursor === null ? "" : `?after=${this.cursor}`;
      const response = await fetch(`${this.base}/api/operations${query}`, {
        headers: { "X-Desk-Token": this.token },
        cache: "no-store",
      });
      if (response.status === 403) {
        // 서버가 다시 켜지면 토큰이 바뀐다 — 다시 연결한다
        this.token = null;
        throw new Error("토큰 만료 · 다시 연결 중");
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const ops = (await response.json()) as LiveOps;
      this.engine.applyLive(ops, this.cursor === null);
      this.cursor = ops.cursor;
      this.schedule(this.pollMs);
    } catch (error) {
      this.engine.setLiveError(error instanceof Error ? error.message : String(error));
      this.schedule(Math.max(this.pollMs * 3, 9000));
    } finally {
      this.busy = false;
    }
  }
}
