"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REPORT_PHASE, type Agent, type Company, type DeptStatus, type Snapshot } from "./sim";
import {
  CEO_ROOM,
  COLS,
  CORRIDOR,
  ENTRANCE,
  MEETING_ROOM,
  MIMIR_CENTER,
  PROPS,
  ROOMS,
  TILE,
  ROWS,
  WORLD_H,
  WORLD_W,
  roomOf,
  walkable,
} from "./world";
import { PROJECTS } from "../../company.config";

const PROJECT_COLOR: Record<string, string> = Object.fromEntries(PROJECTS.map((p) => [p.id, p.color]));
const PROJECT_SHORT: Record<string, string> = Object.fromEntries(PROJECTS.map((p) => [p.id, p.name]));

const STATUS_CLASS: Record<DeptStatus, string> = {
  "완료": "done",
  "작업 중": "working",
  "확인 필요": "approval",
  "차단": "blocked",
  "대기": "waiting",
};

type Props = {
  engine: Company;
  snap: Snapshot;
  selectedId: string | null;
  follow: boolean;
  onSelect: (agent: Agent) => void;
};

type Cam = { x: number; y: number; scale: number };

/** 직원 레이어는 한 번만 렌더하고 이후에는 rAF에서 DOM을 직접 갱신한다 */
const AgentLayer = memo(function AgentLayer({
  agents,
  register,
  onPick,
}: {
  agents: Agent[];
  register: (id: string, el: HTMLDivElement | null) => void;
  onPick: (agent: Agent) => void;
}) {
  return (
    <>
      {agents.map((agent) => (
        <div
          key={agent.id}
          ref={(el) => register(agent.id, el)}
          onPointerUp={() => onPick(agent)}
          style={
            {
              "--hair": agent.hair,
              "--shirt": agent.shirt,
              "--accent": agent.accent,
              "--skin": agent.skin,
            } as React.CSSProperties
          }
        >
          <span className="ag-bubble" />
          <span className="ag-bar">
            <i />
          </span>
          <span className="ag-body">
            <i className="p-shadow" />
            <i className="p-leg l" />
            <i className="p-leg r" />
            <i className="p-torso" />
            <i className="p-arm l" />
            <i className="p-arm r" />
            <i className="p-head">
              <b className="p-eye l" />
              <b className="p-eye r" />
            </i>
            <i className="p-hair" />
          </span>
          <span className="ag-tag">
            {agent.name}
            {agent.rank === "lead" ? <em>{agent.project ? "PM" : "팀장"}</em> : null}
            {agent.rank === "ceo" ? <em>대표</em> : null}
            {agent.callsign && agent.rank !== "ceo" ? <small>{agent.callsign}</small> : null}
            <b className="ag-proj" />
          </span>
        </div>
      ))}
    </>
  );
});

/** 바닥 — 카펫 위에 복도 타일을 밝게 깐다. 한 번만 그린다 */
const FloorLayer = memo(function FloorLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#161b25";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // 카펫 결
    ctx.strokeStyle = "rgba(255,255,255,0.025)";
    ctx.lineWidth = 1;
    for (let d = -WORLD_H; d < WORLD_W; d += 6) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + WORLD_H, WORLD_H);
      ctx.stroke();
    }
    // 복도 타일
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!CORRIDOR[y * COLS + x] || !walkable(x, y)) continue;
        ctx.fillStyle = "#252c3a";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }
    // 복도 가장자리 라인 (시안 안내선)
    ctx.strokeStyle = "rgba(80,214,255,0.22)";
    ctx.lineWidth = 1.5;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!CORRIDOR[y * COLS + x]) continue;
        const px = x * TILE;
        const py = y * TILE;
        const edge = (nx: number, ny: number) => nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || (!CORRIDOR[ny * COLS + nx] && walkable(nx, ny));
        ctx.beginPath();
        if (edge(x, y - 1)) { ctx.moveTo(px, py + 1); ctx.lineTo(px + TILE, py + 1); }
        if (edge(x, y + 1)) { ctx.moveTo(px, py + TILE - 1); ctx.lineTo(px + TILE, py + TILE - 1); }
        if (edge(x - 1, y)) { ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + TILE); }
        if (edge(x + 1, y)) { ctx.moveTo(px + TILE - 1, py); ctx.lineTo(px + TILE - 1, py + TILE); }
        ctx.stroke();
      }
    }
  }, []);
  return <canvas ref={ref} className="world-floor-canvas" width={WORLD_W} height={WORLD_H} aria-hidden="true" />;
});

const PropLayer = memo(function PropLayer() {
  return (
    <>
      {PROPS.map((prop, i) => (
        <div
          key={i}
          className={`pr pr-${prop.kind}`}
          style={
            {
              left: prop.x * TILE,
              top: prop.y * TILE,
              width: prop.w * TILE,
              height: prop.h * TILE,
              "--room-color": prop.color ?? "var(--pink)",
            } as React.CSSProperties
          }
        >
          {prop.kind === "desk" ? <i className="pr-monitor" /> : null}
          {prop.kind === "reactor" ? (
            <>
              <i className="rx-housing" />
              <i className="rx-struts" />
              <i className="rx-core" />
            </>
          ) : null}
          {prop.label ? <span>{prop.label}</span> : null}
        </div>
      ))}
      <div
        className="entrance-mat"
        style={{ left: (ENTRANCE.x - 2) * TILE, top: (ENTRANCE.y - 1) * TILE, width: 5 * TILE, height: 1 * TILE }}
      >
        ENTRANCE
      </div>
    </>
  );
});

export default function OfficeWorld({ engine, snap, selectedId, follow, onSelect }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{ x: number; y: number; tx: number; ty: number; t: number; color: string }[]>([]);
  const agentRefs = useRef(new Map<string, HTMLDivElement>());
  const camRef = useRef<Cam>({ x: WORLD_W / 2, y: WORLD_H / 2, scale: 0.5 });
  const targetRef = useRef<Cam>({ x: WORLD_W / 2, y: WORLD_H / 2, scale: 0.5 });
  const selectedRef = useRef<string | null>(selectedId);
  const dragRef = useRef({ on: false, px: 0, py: 0, moved: false });
  const [zoom, setZoom] = useState<"fit" | "close">("fit");

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const hotRoom = useMemo(() => {
    if (snap.spotlight) return snap.spotlight; // 대표 지시로 지목된 방 우선
    if (snap.meetingTitle) return MEETING_ROOM.id;
    if (!snap.live.on && snap.phaseIndex >= REPORT_PHASE) return CEO_ROOM.id;
    const working = Object.entries(snap.deptStatus).find(([, status]) => status === "작업 중");
    return working?.[0] ?? null;
  }, [snap.spotlight, snap.meetingTitle, snap.phaseIndex, snap.deptStatus, snap.live.on]);

  /** 카메라가 비출 지점 — 회의실 > 대표실 > 작업 중인 부서 > 출근 시 입구 */
  const focus = useMemo(() => {
    if (hotRoom === "mimir") return { x: MIMIR_CENTER.x * TILE, y: MIMIR_CENTER.y * TILE };
    if (hotRoom) {
      const room = roomOf(hotRoom);
      return { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE };
    }
    if (!snap.live.on && snap.phaseIndex <= 1) return { x: ENTRANCE.x * TILE, y: (ENTRANCE.y - 6) * TILE };
    return null;
  }, [hotRoom, snap.phaseIndex, snap.live.on]);

  const register = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) agentRefs.current.set(id, el);
    else agentRefs.current.delete(id);
  }, []);

  const onPick = useCallback(
    (agent: Agent) => {
      if (!dragRef.current.moved) onSelect(agent);
    },
    [onSelect],
  );

  // 카메라 목표
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const compute = () => {
      const rect = viewport.getBoundingClientRect();
      const fit = Math.min(rect.width / WORLD_W, rect.height / WORLD_H);
      if (zoom === "fit") {
        targetRef.current = { x: WORLD_W / 2, y: WORLD_H / 2, scale: fit };
        return;
      }
      const scale = Math.max(fit * 1.9, 0.95);
      targetRef.current = follow && focus ? { ...focus, scale } : { ...targetRef.current, scale };
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [zoom, follow, focus]);

  // 페인트 루프
  useEffect(() => {
    let raf = 0;
    const paint = () => {
      const viewport = viewportRef.current;
      const stage = stageRef.current;
      if (viewport && stage) {
        const cam = camRef.current;
        const target = targetRef.current;
        cam.x += (target.x - cam.x) * 0.07;
        cam.y += (target.y - cam.y) * 0.07;
        cam.scale += (target.scale - cam.scale) * 0.08;

        const rect = viewport.getBoundingClientRect();
        const ox = rect.width / 2 - cam.x * cam.scale;
        const oy = rect.height / 2 - cam.y * cam.scale;
        stage.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${cam.scale})`;
        if (stage.classList.contains("compact") !== cam.scale < 0.62) {
          stage.classList.toggle("compact", cam.scale < 0.62);
        }

        const picked = selectedRef.current;
        for (const agent of engine.agents) {
          const el = agentRefs.current.get(agent.id);
          if (!el) continue;

          el.style.transform = `translate3d(${(agent.x + 0.5 + agent.jitter) * TILE}px, ${
            (agent.y + 0.9) * TILE
          }px, 0)`;
          el.style.zIndex = String(200 + Math.round(agent.y));

          const cls =
            `ag f-${agent.facing} a-${agent.anim} r-${agent.rank}` +
            (agent.id === picked ? " selected" : "") +
            (agent.status === "출근 전" ? " offstage" : "") +
            (agent.status === "차단" ? " blocked" : agent.status === "확인 필요" ? " attention" : "");
          if (el.className !== cls) el.className = cls;

          const bubble = el.firstElementChild as HTMLElement;
          const text = agent.speech ?? "";
          if (bubble.dataset.text !== text) {
            bubble.dataset.text = text;
            bubble.textContent = text;
            bubble.className = `ag-bubble ${agent.speechKind}${text ? " on" : ""}`;
          }

          const chip = el.querySelector(".ag-proj") as HTMLElement | null;
          if (chip) {
            const label = agent.project ? PROJECT_SHORT[agent.project] ?? agent.project : "";
            if (chip.dataset.p !== label) {
              chip.dataset.p = label;
              chip.textContent = label;
              chip.style.display = label ? "inline-block" : "none";
              chip.style.background = agent.project ? PROJECT_COLOR[agent.project] ?? "" : "";
            }
          }

          const bar = el.children[1] as HTMLElement;
          const fill = bar.firstElementChild as HTMLElement;
          // 진행률은 시나리오 작업에만 있다. 실시간 기록에는 없으므로(progress 0) 막대를 그리지 않는다.
          const show = agent.anim === "type" && agent.progress > 0 ? "1" : "0";
          if (bar.style.opacity !== show) bar.style.opacity = show;
          if (show === "1") fill.style.width = `${Math.round(agent.progress * 100)}%`;
        }
      }
      paintFx();
      raf = requestAnimationFrame(paint);
    };

    // 미미르 → 일하는 방으로 흐르는 지식 입자 (배경 효과. 기록을 만들지 않는다)
    const paintFx = () => {
      const canvas = fxRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const list = particlesRef.current;
      const targets = new Map<string, { x: number; y: number; color: string }>();
      for (const agent of engine.agents) {
        if (agent.status !== "업무 중" || agent.rank === "ceo") continue;
        const room = roomOf(agent.deptId === "pm" && agent.project ? agent.project : agent.deptId);
        targets.set(room.id, {
          x: (room.x + room.w / 2) * TILE,
          y: (room.y + room.h / 2) * TILE,
          color: agent.project ? PROJECT_COLOR[agent.project] ?? "#7cc7ff" : "#7cc7ff",
        });
      }
      if (targets.size && list.length < 40 && Math.random() < 0.35) {
        const pick = [...targets.values()][Math.floor(Math.random() * targets.size)];
        list.push({ x: MIMIR_CENTER.x * TILE, y: MIMIR_CENTER.y * TILE, tx: pick.x, ty: pick.y, t: 0, color: pick.color });
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const pt = list[i];
        pt.t += 0.012;
        if (pt.t >= 1) {
          list.splice(i, 1);
          continue;
        }
        const e = pt.t < 0.5 ? 2 * pt.t * pt.t : 1 - Math.pow(-2 * pt.t + 2, 2) / 2;
        const x = pt.x + (pt.tx - pt.x) * e;
        const y = pt.y + (pt.ty - pt.y) * e - Math.sin(pt.t * Math.PI) * 40;
        ctx.beginPath();
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = 0.9 - pt.t * 0.6;
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.25;
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // 포인터 캡처는 쓰지 않는다 — 캡처하면 HUD 버튼·직원 클릭이 뷰포트에 먹혀버린다
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".world-hud")) return;
    dragRef.current = { on: true, px: e.clientX, py: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.on) return;
    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    drag.px = e.clientX;
    drag.py = e.clientY;
    const scale = camRef.current.scale || 1;
    targetRef.current = {
      ...targetRef.current,
      x: clamp(targetRef.current.x - dx / scale, 0, WORLD_W),
      y: clamp(targetRef.current.y - dy / scale, 0, WORLD_H),
    };
  };
  const onPointerUp = () => {
    dragRef.current.on = false;
    window.setTimeout(() => {
      dragRef.current.moved = false;
    }, 0);
  };

  return (
    <div className="world-frame">
      <div
        className="world-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="world-stage" ref={stageRef} style={{ width: WORLD_W, height: WORLD_H }}>
          <div className="world-floor" />
          <FloorLayer />

          {ROOMS.map((room) => {
            const status = room.kind === "project" ? snap.projectStatus[room.id] : snap.deptStatus[room.id];
            return (
              <div
                key={room.id}
                className={`rm rm-${room.kind} rm-${room.id} ${status ? STATUS_CLASS[status] : ""} ${
                  hotRoom === room.id ? "hot" : ""
                }`}
                style={
                  {
                    left: room.x * TILE,
                    top: room.y * TILE,
                    width: room.w * TILE,
                    height: room.h * TILE,
                    "--room-color": room.color ?? "var(--pink)",
                  } as React.CSSProperties
                }
              >
                <span className="rm-head">
                  <b>
                    {room.icon} {room.name}
                  </b>
                  {status ? <i className={`rm-dot ${STATUS_CLASS[status]}`} title={status} /> : null}
                </span>
                <span className="rm-code">{room.short}</span>
                {room.doors.map((door) => (
                  <span
                    key={`${door.x}-${door.y}`}
                    className="rm-door"
                    style={{ left: (door.x - room.x) * TILE, top: (door.y - room.y) * TILE }}
                  />
                ))}
              </div>
            );
          })}

          <PropLayer />
          <canvas ref={fxRef} className="world-fx" width={WORLD_W} height={WORLD_H} aria-hidden="true" />
          <AgentLayer agents={engine.agents} register={register} onPick={onPick} />
        </div>

        <div className="world-hud">
          <button className={zoom === "fit" ? "on" : ""} onClick={() => setZoom("fit")}>
            🗺️ 전체 보기
          </button>
          <button className={zoom === "close" ? "on" : ""} onClick={() => setZoom("close")}>
            🔍 가까이
          </button>
        </div>
        <div className="world-hint">드래그로 둘러보기 · 직원 클릭하면 프로필</div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
