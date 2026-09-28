import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OfficeWorld from "./game/OfficeWorld";
import { LiveBridge } from "./game/live";
import {
  buildReport,
  fetchIntegrations,
  publish,
  type IntegrationStatus,
  type PublishResult,
} from "./game/report";
import { APPROVERS, Company, PHASES, type Agent, type DeptStatus, type Snapshot } from "./game/sim";
import { CEO, DEPT_BRIEF, DEPT_LEAD, PROJECT_PM, STAFF } from "./game/staff";
import { DEPT_ROOMS } from "./game/world";
import { COMPANY, DECISION, FOOTER, LIVE, MIMIR_SOURCES, PROJECTS, REQUEST, RESULTS, STORAGE_LINK } from "../company.config";

type View = "live" | "dashboard";

/** Hermes Desk 범례: ● 작업 중 ◆ 확인 필요 ■ 차단 ○ 대기 + 완료 */
const statusClass: Record<DeptStatus, string> = {
  "완료": "done",
  "작업 중": "working",
  "확인 필요": "approval",
  "차단": "blocked",
  "대기": "waiting",
};

const STAFF_COUNT = STAFF.length;
const HERMES = DEPT_LEAD.hermes?.name ?? "헤르메스";
const APPROVER_NAMES = APPROVERS.map((id) => STAFF.find((s) => s.id === id)?.name)
  .filter(Boolean)
  .join("·");
const LIVE_ENABLED = import.meta.env.VITE_HERMES_LIVE === "1";

function todayText() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 링크만 걸려 있는 항목 (서버 연동과 무관) */
const integrations2Static = STORAGE_LINK
  ? [{ name: "결과물 보관함", status: "링크 연결", tone: "mint", href: STORAGE_LINK }]
  : [];

function PixelEmployee({ hair, shirt, accent }: { hair: string; shirt: string; accent: string }) {
  const style = {
    "--pixel-hair": hair,
    "--pixel-shirt": shirt,
    "--pixel-accent": accent,
  } as CSSProperties;
  return (
    <span className="pixel-employee" style={style} aria-hidden="true">
      <i className="pixel-shadow" />
      <i className="pixel-legs" />
      <i className="pixel-body" />
      <i className="pixel-arm left" />
      <i className="pixel-arm right" />
      <i className="pixel-face">
        <b className="pixel-eyes" />
      </i>
      <i className="pixel-hair" />
      <i className="pixel-headset" />
    </span>
  );
}

export default function App() {
  const [engine] = useState(() => new Company());
  const [snap, setSnap] = useState<Snapshot>(() => engine.snapshot());
  const [view, setView] = useState<View>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [briefing, setBriefing] = useState(false);
  const [filter, setFilter] = useState<"전체" | DeptStatus>("전체");
  const [toast, setToast] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [publishState, setPublishState] = useState<{ busy: boolean; result: PublishResult | null; error: string }>({
    busy: false,
    result: null,
    error: "",
  });
  const publishedRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.tick(dt);
      acc += dt;
      if (acc >= 0.18) {
        acc = 0;
        setSnap(engine.snapshot());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  useEffect(() => {
    engine.setBriefingHandler(() => setBriefing(true));
    return () => engine.setBriefingHandler(null);
  }, [engine]);

  // 개발 서버에 HERMES_DESK_URL 이 있으면 실제 기록으로 화면을 움직인다
  useEffect(() => {
    if (!LIVE_ENABLED) return;
    const bridge = new LiveBridge(engine, LIVE.base, LIVE.pollMs);
    bridge.start();
    return () => bridge.stop();
  }, [engine]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const onSelect = useCallback((agent: Agent) => setSelectedId(agent.id), []);

  // 연동 설정 여부를 받아온다 (값이 아니라 설정 여부만)
  useEffect(() => {
    fetchIntegrations()
      .then(setIntegrations)
      .catch(() => setIntegrations(null));
  }, []);

  const sendReport = useCallback(
    async (auto: boolean) => {
      setPublishState((state) => ({ ...state, busy: true, error: "" }));
      try {
        const result = await publish(buildReport(engine.snapshot()));
        setPublishState({ busy: false, result, error: "" });

        const parts: string[] = [];
        parts.push(result.notion.ok ? "보고서 저장 완료" : `저장 ${result.notion.detail ?? "실패"}`);
        parts.push(result.discord.ok ? "Slack 보고 전송 완료" : `전송 ${result.discord.detail ?? "실패"}`);
        engine.pushLog(
          result.notion.ok && result.discord.ok ? "📤" : "⚠️",
          `완료 보고 발행 — ${parts.join(" / ")}`,
          result.notion.ok && result.discord.ok ? "mint" : "lav",
        );
        engine.pushChat("staff", HERMES, `보고서 발행 결과입니다.\n· ${parts.join("\n· ")}`);
        if (!auto) showToast(result.notion.ok || result.discord.ok ? "보고서를 발행했어요" : "발행 실패 — 연동 설정 필요");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPublishState({ busy: false, result: null, error: message });
        engine.pushLog("⚠️", `완료 보고 발행 실패 — ${message}`, "lav");
        if (!auto) showToast("발행 실패 — 연동 설정을 확인해주세요");
      }
    },
    [engine, showToast],
  );

  // 하루가 끝나면 자동으로 한 번 발행한다
  useEffect(() => {
    if (snap.dayComplete && !publishedRef.current) {
      publishedRef.current = true;
      void sendReport(true);
    }
    if (!snap.dayComplete && snap.running) publishedRef.current = false;
  }, [snap.dayComplete, snap.running, sendReport]);

  const askAgent = useCallback(
    (agent: Agent) => {
      engine.command(`${agent.name} 지금 뭐해?`);
      setSelectedId(null);
      window.setTimeout(
        () => document.getElementById("ceo-console")?.scrollIntoView({ behavior: "smooth", block: "center" }),
        60,
      );
    },
    [engine],
  );

  const start = () => {
    engine.start();
    setBriefing(false);
    setView("live");
    showToast(`07:00 — AI 직원 ${STAFF_COUNT}명이 출근합니다 ✨`);
  };

  const approve = () => {
    engine.approve();
    showToast("확인 완료! 차단 해제, QA로 넘어가요");
  };

  const teams = useMemo(
    () =>
      DEPT_ROOMS.map((room) => {
        const lead = DEPT_LEAD[room.id] ?? null;
        const status = snap.deptStatus[room.id] ?? "대기";
        return {
          id: room.id,
          icon: room.icon,
          name: room.name,
          room: room.short,
          lead,
          status,
          ...DEPT_BRIEF[room.id],
        };
      }),
    [snap.deptStatus],
  );

  const filteredTeams = filter === "전체" ? teams : teams.filter((team) => team.status === filter);
  const selected = selectedId ? engine.agentById.get(selectedId) ?? null : null;
  const todo = snap.approvalPending ? 1 : 0;
  const onDuty = engine.agents.filter((a) => a.status !== "출근 전").length;

  return (
    <main className="page-shell">
      <div className="wrap">
        <nav className="app-nav" aria-label="AI Company 화면 전환">
          <div className="brand-chip">
            <span>{COMPANY.logoLetter}</span>
            <b>{COMPANY.name}</b>
          </div>
          <div className="nav-tabs">
            <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}>
              🎮 라이브 오피스
            </button>
            <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
              📊 대시보드
            </button>
            <button
              className={`todo-tab ${todo ? "urgent" : ""}`}
              onClick={() => {
                setView("live");
                window.setTimeout(
                  () => document.getElementById("ceo-approval")?.scrollIntoView({ behavior: "smooth", block: "center" }),
                  60,
                );
              }}
            >
              📋 대표 할 일 <i>{todo}</i>
            </button>
          </div>
        </nav>

        {view === "live" ? (
          <LiveView
            engine={engine}
            snap={snap}
            follow={follow}
            setFollow={setFollow}
            selectedId={selectedId}
            onSelect={onSelect}
            onStart={start}
            onApprove={approve}
            onDuty={onDuty}
            onPublish={() => void sendReport(false)}
            publishBusy={publishState.busy}
            publishResult={publishState.result}
          />
        ) : (
          <DashboardView
            teams={teams}
            filteredTeams={filteredTeams}
            filter={filter}
            setFilter={setFilter}
            snap={snap}
            onStart={start}
            onApprove={approve}
            onSelect={(id) => setSelectedId(id)}
            integrations={integrations}
            publishResult={publishState.result}
          />
        )}

        <footer>
          {FOOTER.line1}
          <br />
          <a href={FOOTER.linkHref} target="_blank" rel="noreferrer">
            {FOOTER.linkLabel}
          </a>
          <br />
          {FOOTER.line3}
        </footer>
      </div>

      {selected ? (
        <ProfileModal
          agent={selected}
          onClose={() => setSelectedId(null)}
          onAsk={(agent) => {
            setView("live");
            askAgent(agent);
          }}
        />
      ) : null}
      {briefing ? <BriefingModal snap={snap} onClose={() => setBriefing(false)} /> : null}
      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}

function LiveView({
  engine,
  snap,
  follow,
  setFollow,
  selectedId,
  onSelect,
  onStart,
  onApprove,
  onDuty,
  onPublish,
  publishBusy,
  publishResult,
}: {
  engine: Company;
  snap: Snapshot;
  follow: boolean;
  setFollow: (value: boolean) => void;
  selectedId: string | null;
  onSelect: (agent: Agent) => void;
  onStart: () => void;
  onApprove: () => void;
  onDuty: number;
  onPublish: () => void;
  publishBusy: boolean;
  publishResult: PublishResult | null;
}) {
  const progress = Math.round((snap.phaseIndex / (PHASES.length - 1)) * 100);
  const live = snap.live;

  return (
    <>
      <header className="live-hero">
        <div>
          <p className="eyebrow">
            {live.on ? "LIVE · HERMES DESK" : "LIVE OFFICE"} · {STAFF_COUNT} AI AGENTS · {live.on ? "REAL RECORDS" : "SCENARIO"}
          </p>
          <h1>
            {COMPANY.titlePrefix} <em className="highlight">{COMPANY.titleAccent}</em>
          </h1>
          <p>{COMPANY.tagline}</p>
        </div>
        <div className={`live-clock ${live.on ? "live" : ""}`}>
          <span>{live.on ? "LIVE" : "SEOUL"}</span>
          <b>{snap.clock}</b>
          <small>{snap.phase}</small>
        </div>
      </header>

      <section className="live-bar">
        <button className="btn btn-primary" onClick={onStart} disabled={snap.running || live.on}>
          {live.on
            ? "실시간 기록 반영 중"
            : snap.running
              ? "직원들이 일하는 중…"
              : snap.dayComplete
                ? "다시 출근시키기"
                : "오늘 업무 시작하기"}
        </button>
        <button className="btn btn-ghost" onClick={() => engine.togglePause()}>
          {snap.paused ? "▶ 재생" : "⏸ 일시정지"}
        </button>
        <div className="speed-wrap">
          <span className="speed-label" title="시뮬레이션 전체(걷기·업무·대사)가 함께 빨라져요. 실제 에이전트 작업 속도와는 무관합니다.">
            재생 속도
          </span>
          <div className="speed-group" role="group" aria-label="재생 속도">
            {[1, 2, 4].map((value) => (
              <button
                key={value}
                className={!snap.turbo && snap.speed === value ? "on" : ""}
                onClick={() => engine.setSpeed(value)}
                title={value === 1 ? "말풍선 읽기·화면녹화용" : value === 4 ? "결과만 빠르게" : "기본"}
              >
                {value}x
              </button>
            ))}
            <button
              className={`skip ${snap.turbo ? "on" : ""}`}
              onClick={() => engine.skipToDecision()}
              disabled={!snap.running || snap.approvalPending || live.on}
              title="대표님이 결정할 일이 생길 때까지 단숨에 건너뜁니다"
            >
              {snap.turbo ? "건너뛰는 중…" : "⏭ 결정까지"}
            </button>
          </div>
        </div>
        <button className={`btn btn-ghost ${follow ? "on" : ""}`} onClick={() => setFollow(!follow)}>
          🎥 자동 추적 {follow ? "ON" : "OFF"}
        </button>
        <button
          className={`btn btn-ghost publish-btn ${publishResult?.notion.ok || publishResult?.discord.ok ? "sent" : ""}`}
          onClick={onPublish}
          disabled={publishBusy}
          title="완료 보고를 저장하고 같은 내용을 Slack으로 보냅니다 (REPORT_ENDPOINT 설정 시)"
        >
          {publishBusy ? "발행 중…" : "📤 보고 발행"}
        </button>
        <div className="live-progress">
          <span>
            {live.on
              ? live.connected
                ? `Hermes Desk 연결됨 · 작업 ${live.tasks}건 · 요청 ${live.requests}건 · ${LIVE.pollMs / 1000}초 갱신`
                : `연결 확인 필요 · ${live.error || "응답 없음"}`
              : `${snap.phase} · ${progress}%`}
          </span>
          <i>
            <b style={{ width: live.on ? (live.connected ? "100%" : "0%") : `${progress}%` }} />
          </i>
        </div>
        <div className="live-counts">
          {live.on ? <span className={`live-pill ${live.connected ? "" : "off"}`}>{live.connected ? "● LIVE" : "○ 끊김"}</span> : null}
          <span className="lc on-duty">근무 {onDuty}</span>
          <span className="lc done">완료 {snap.stats.done}</span>
          <span className="lc working">작업 {snap.stats.working}</span>
          <span className="lc blocked">차단 {snap.stats.blocked}</span>
        </div>
      </section>

      <section className="live-grid">
        <OfficeWorld engine={engine} snap={snap} selectedId={selectedId} follow={follow} onSelect={onSelect} />

        <aside className="live-rail">
          <CeoConsole engine={engine} snap={snap} />

          <section className="win rail-card" id="ceo-approval">
            <div className="win-bar">
              <span>✅ ceo.approval</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className={`win-body approval-body ${snap.approvalPending ? "pending" : ""}`}>
              {snap.approvalPending ? (
                <>
                  <div className="approval-top">
                    <span className="mini-badge yellow">■ {DECISION.tag} · 개발팀</span>
                    <span className="score blink">확인 필요</span>
                  </div>
                  <h3>{DECISION.title}</h3>
                  <p>회의실에서 {APPROVER_NAMES}가 대표님을 기다리고 있어요.</p>
                  <div className="reason-list">
                    {DECISION.reasons.map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                  <button className="btn approve-button" onClick={onApprove}>
                    {DECISION.approveLabel}
                  </button>
                </>
              ) : (
                <>
                  <div className="approval-top">
                    <span className="mini-badge mint">
                      {live.on ? "실시간 · 결정은 Hermes Desk에서" : snap.approved ? "오늘 확인 완료" : "확인 필요 없음"}
                    </span>
                  </div>
                  <h3>
                    {live.on
                      ? "차단된 작업은 방과 캐릭터에 ■로 표시돼요"
                      : snap.approved
                        ? "허용하신 대로 QA · 회수 · 보고로 이어져요"
                        : "아직 올라온 안건이 없어요"}
                  </h3>
                  <p>
                    {live.on
                      ? "막힌 이유는 지시창에서 “왜 늦어져?”로 물어보세요. 실제 승인·응답은 Hermes Desk 명령창에서 합니다."
                      : snap.approved
                        ? "대표 확인 이후 QA → 결과 회수 → 헤르메스 보고까지 이어집니다."
                        : "업무를 시작하면 헤르메스가 Slack 요청을 받아 분담하고, 검토에서 막힌 건만 여기로 올라와요."}
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="win rail-card feed-card">
            <div className="win-bar">
              <span>📡 live.feed</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body feed-body">
              {snap.meetingTitle ? <div className="feed-now">💬 회의 진행 중 — {snap.meetingTitle}</div> : null}
              <ul className="feed-list">
                {snap.log.map((entry) => (
                  <li key={entry.id} className={entry.tone}>
                    <b>{entry.time}</b>
                    <i>{entry.icon}</i>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="win rail-card">
            <div className="win-bar">
              <span>👥 agent.roster</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body roster-body">
              <div className="roster-dept">
                <p>
                  <b>🪐 프로젝트 · PM</b>
                </p>
                <div className="roster-chips">
                  {PROJECTS.map((project) => {
                    const pm = PROJECT_PM[project.id];
                    const agent = pm ? engine.agentById.get(pm.id) : undefined;
                    return (
                      <button
                        key={project.id}
                        className={`roster-chip ${pm && selectedId === pm.id ? "on" : ""}`}
                        onClick={() => agent && onSelect(agent)}
                        title={pm?.callsign}
                        style={{ borderColor: project.color }}
                      >
                        <i className={`rm-dot ${statusClass[snap.projectStatus[project.id] ?? "대기"]}`} style={{ borderRadius: "50%" }} />
                        {project.icon} {project.name}
                        <small>{agent?.status ?? "출근 전"}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="roster-dept">
                <p>
                  <b>🧠 미미르</b>
                  <i className={`rm-dot ${statusClass[snap.deptStatus.mimir ?? "대기"]}`} />
                </p>
                <div className="roster-chips">
                  <span className="roster-chip">
                    <i style={{ background: "#7cc7ff", borderColor: "#2b6cb0" }} />
                    원천 {MIMIR_SOURCES.length}종
                    <small>회사 기억 · 조회하러 걸어감</small>
                  </span>
                </div>
              </div>
              {DEPT_ROOMS.map((room) => (
                <div className="roster-dept" key={room.id}>
                  <p>
                    <b>
                      {room.icon} {room.name}
                    </b>
                    <i className={`rm-dot ${statusClass[snap.deptStatus[room.id] ?? "대기"]}`} />
                  </p>
                  <div className="roster-chips">
                    {STAFF.filter((s) => s.deptId === room.id || (room.id === "hermes" && s.deptId === "pm" && !s.project)).map((seed) => {
                      const agent = engine.agentById.get(seed.id);
                      return (
                        <button
                          key={seed.id}
                          className={`roster-chip ${selectedId === seed.id ? "on" : ""}`}
                          onClick={() => agent && onSelect(agent)}
                          title={seed.callsign}
                        >
                          <i style={{ background: seed.shirt, borderColor: seed.hair }} />
                          {seed.name}
                          <small>{agent?.status ?? "출근 전"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}

const QUICK_ORDERS = [
  { label: "현황 보고", command: "현황 보고해줘" },
  { label: "왜 늦어져?", command: "왜 늦어지고 있어?" },
  { label: "개발팀 뭐해?", command: "개발팀 지금 뭐해?" },
  { label: "미미르 뭐 있어?", command: "미미르에 뭐 있어?" },
  { label: "회의 소집", command: "전 부서 회의 소집" },
  { label: "지금 브리핑", command: "지금 브리핑 올라와" },
  { label: "집중 모드", command: "집중 모드" },
];

function CeoConsole({ engine, snap }: { engine: Company; snap: Snapshot }) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const count = snap.chat.length;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    engine.command(value);
    setDraft("");
  };

  return (
    <section className="win rail-card console-card" id="ceo-console">
      <div className="win-bar">
        <span>🎤 hermes.console — 대표 지시창</span>
        <span className="window-controls">—　▢　✕</span>
      </div>
      <div className="win-body console-body">
        <div className="console-status">
          <span className={`mini-badge ${snap.focusMode ? "yellow" : "mint"}`}>
            {snap.focusMode ? "집중 모드 ON" : "평시 운영"}
          </span>
          {snap.busyWithOrder ? <span className="mini-badge lav">지시 처리 중…</span> : null}
          {snap.live.on ? <span className="mini-badge lav">화면 전용 · 실제 명령은 Hermes Desk</span> : null}
        </div>

        <div className="console-log" ref={logRef}>
          {snap.chat.map((entry) => (
            <div key={entry.id} className={`console-line ${entry.from}`}>
              <b>{entry.from === "ceo" ? "대표님" : entry.name}</b>
              <p>{entry.text}</p>
              <small>{entry.time}</small>
            </div>
          ))}
        </div>

        <div className="console-quick">
          {QUICK_ORDERS.map((item) => (
            <button key={item.label} onClick={() => send(item.command)}>
              {item.label}
            </button>
          ))}
        </div>

        <form
          className="console-input"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="예: 개발팀 지금 뭐해? / 왜 늦어져? / 광고팀 왜 막혔어?"
            aria-label="대표 지시 입력"
          />
          <button type="submit">지시</button>
        </form>
      </div>
    </section>
  );
}

function ProfileModal({
  agent,
  onClose,
  onAsk,
}: {
  agent: Agent;
  onClose: () => void;
  onAsk: (agent: Agent) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} 프로필`}
      >
        <div className="win-bar">
          <span>👤 agent_profile.exe</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body employee-profile">
          <div className="profile-top">
            <PixelEmployee hair={agent.hair} shirt={agent.shirt} accent={agent.accent} />
            <div>
              <span className={`status-pill ${agent.status === "차단" ? "blocked" : agent.status === "확인 필요" ? "approval" : "working"}`}>
                {agent.status}
              </span>
              <h2>
                {agent.name}
                {agent.callsign ? <small> · {agent.callsign}</small> : null}
              </h2>
              <p>{agent.role}</p>
            </div>
          </div>
          <div className="profile-task">
            <span className="tiny-label">지금 하는 일</span>
            <strong>{agent.taskLabel}</strong>
            {agent.anim === "type" && agent.progress > 0 ? (
              <span className="profile-progress">
                <i style={{ width: `${Math.round(agent.progress * 100)}%` }} />
              </span>
            ) : null}
          </div>
          <div className="report-box">
            <span className="tiny-label">한마디</span>
            <strong>{agent.speech ?? agent.thoughts[0]}</strong>
          </div>
          <div className="profile-actions">
            <button className="btn btn-primary" onClick={() => onAsk(agent)}>
              🎤 지금 뭐 하는지 물어보기
            </button>
            <button className="text-button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BriefingModal({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${HERMES} 브리핑`}
      >
        <div className="win-bar">
          <span>📋 hermes.brief</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body">
          <p className="brief-date">
            {snap.clock} · {HERMES} 최종 보고
          </p>
          <h3>대표님, 오늘 맡기신 일이 정리됐어요.</h3>
          <ul>
            <li>
              <span className="dot green" />
              완료 {snap.stats.done}팀 — 기획·디자인·개발·QA·마케팅·운영·AI-OS·결과 회수까지 마쳤어요
            </li>
            <li>
              <span className="dot green" />
              대표 확인 1건 반영 — {DECISION.title}
            </li>
            <li>
              <span className="dot gray" />
              차단 {snap.stats.blocked}팀 — 외부 연결이 필요해요
            </li>
          </ul>
          <div className="decision-box">
            <span className="tiny-label">오늘 대표님이 결정할 것</span>
            <strong>없습니다. 결과물은 등록됐고, Slack 보고 전달은 발행 버튼으로 따로 확인해요 ✨</strong>
          </div>
          <button className="btn btn-primary" onClick={onClose}>
            확인
          </button>
        </div>
      </section>
    </div>
  );
}

type TeamRow = {
  id: string;
  icon: string;
  name: string;
  room: string;
  lead: (typeof DEPT_LEAD)[string] | null;
  status: DeptStatus;
  task: string;
  report: string;
};

function DashboardView({
  teams,
  filteredTeams,
  filter,
  setFilter,
  snap,
  onStart,
  onApprove,
  onSelect,
  integrations,
  publishResult,
}: {
  teams: TeamRow[];
  filteredTeams: TeamRow[];
  filter: "전체" | DeptStatus;
  setFilter: (value: "전체" | DeptStatus) => void;
  snap: Snapshot;
  onStart: () => void;
  onApprove: () => void;
  onSelect: (id: string) => void;
  integrations: IntegrationStatus | null;
  publishResult: PublishResult | null;
}) {
  const live = snap.live;
  // 실제 설정 상태로 표시한다 (연결됐다고 거짓 보고하지 않는다)
  const liveRows = [
    {
      name: "Hermes Desk",
      status: live.on ? (live.connected ? "연결됨" : "연결 확인 필요") : "미연결 · 시나리오 모드",
      tone: live.on ? (live.connected ? "mint" : "yellow") : "lav",
      href: "",
    },
    ...(integrations
      ? [
          {
            name: "보고서 저장",
            status: publishResult?.notion.ok ? "저장 성공" : integrations.notion?.configured ? "주소 설정됨" : "미설정",
            tone: publishResult?.notion.ok ? "mint" : integrations.notion?.configured ? "yellow" : "lav",
            href: "",
          },
          {
            name: "Slack 보고 전송",
            status: publishResult?.discord.ok ? "전송 성공" : integrations.discord?.configured ? "주소 설정됨" : "미설정",
            tone: publishResult?.discord.ok ? "mint" : integrations.discord?.configured ? "yellow" : "lav",
            href: "",
          },
          ...Object.entries(integrations)
            .filter(([key]) => key !== "notion" && key !== "discord")
            .map(([, item]) => ({
              name: item.label,
              status: item.configured ? "연결 완료" : item.need ?? "연결 대기",
              tone: item.configured ? "mint" : "lav",
              href: "",
            })),
        ]
      : []),
  ];
  const rows = [...integrations2Static, ...liveRows];

  return (
    <>
      <header className="win hero">
        <div className="win-bar">
          <span>⚡ {COMPANY.windowLabel}</span>
          <span className="window-controls" aria-hidden="true">
            —　▢　✕
          </span>
        </div>
        <div className="hero-body">
          <div className="hero-copy">
            <p className="eyebrow">{live.on ? "LIVE · HERMES DESK RECORDS" : "TODAY · SLACK REQUEST FLOW"}</p>
            <h1>
              맡긴 일, <em className="highlight">지금 어디까지?</em>
            </h1>
            <p>
              누가 요청했고, 누가 맡았고, 무엇이 나왔는지. 프로젝트 {PROJECTS.length}개 · 공유 부서 {teams.length}개 · 에이전트{" "}
              {STAFF_COUNT}명이 요청 → PM 배정 → 미미르 조회 → 검토 → 결과 회수 → 보고까지 한 흐름으로 움직여요.
            </p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onStart} disabled={snap.running || live.on}>
              {live.on ? "실시간 기록 반영 중" : snap.running ? "AI 팀원들이 근무 중…" : "오늘 업무 시작하기"}
            </button>
            <span className="trust-copy">실제 전송·게시·권한 변경은 대표 확인 후 진행해요</span>
          </div>
        </div>
      </header>

      <section className="summary-grid" aria-label="오늘 업무 요약">
        <article className="metric yellow">
          <span>AI 에이전트</span>
          <strong>{STAFF_COUNT}</strong>
          <small>AGENTS</small>
        </article>
        <article className="metric mint">
          <span>완료</span>
          <strong>{snap.stats.done}</strong>
          <small>DONE</small>
        </article>
        <article className="metric pink">
          <span>작업 중</span>
          <strong>{snap.stats.working}</strong>
          <small>WORKING</small>
        </article>
        <article className="metric lav">
          <span>확인 필요</span>
          <strong>{snap.stats.approval}</strong>
          <small>ATTENTION</small>
        </article>
        <article className="metric white">
          <span>차단</span>
          <strong>{snap.stats.blocked}</strong>
          <small>BLOCKED</small>
        </article>
      </section>

      <section className="workspace">
        <aside className="side-stack">
          <section className="win">
            <div className="win-bar">
              <span>⚡ request.flow</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="schedule-card">
                <div>
                  <span className="tiny-label">{live.on ? "LIVE" : "TODAY'S REQUEST"}</span>
                  <strong>{live.on ? `Hermes Desk · 요청 ${live.requests}건` : `${REQUEST.channel} · ${REQUEST.requester}`}</strong>
                  <p>{live.on ? `작업 ${live.tasks}건 진행·대기·차단` : REQUEST.text}</p>
                </div>
                <span className="toggle-on">{live.on ? "LIVE" : "ON"}</span>
              </div>
              <div className="flow-list">
                {PHASES.slice(1, PHASES.length - 1).map((item, index) => (
                  <div className={`flow-row ${!live.on && snap.phaseIndex > index + 1 ? "past" : ""}`} key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{item}</b>
                    <i>{live.on ? "·" : snap.phaseIndex === index + 1 ? "●" : snap.phaseIndex > index + 1 ? "✓" : "·"}</i>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="win">
            <div className="win-bar">
              <span>🔗 integrations.link</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body integration-list">
              {rows.map((item) =>
                item.href ? (
                  <a key={item.name} href={item.href} target="_blank" rel="noreferrer" className="integration-row">
                    <b>{item.name}</b>
                    <span className={`mini-badge ${item.tone}`}>{item.status}</span>
                  </a>
                ) : (
                  <div key={item.name} className="integration-row">
                    <b>{item.name}</b>
                    <span className={`mini-badge ${item.tone}`}>{item.status}</span>
                  </div>
                ),
              )}
            </div>
          </section>

          <section className="win">
            <div className="win-bar">
              <span>🧠 mimir.sources</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <p className="brief-date">MIMIR NEURAL NETWORK · {MIMIR_SOURCES.length} SOURCES</p>
              <div className="roster-chips" style={{ marginTop: 8 }}>
                {MIMIR_SOURCES.map((source) => (
                  <span key={source} className="roster-chip">
                    <i style={{ background: "#7cc7ff", borderColor: "#2b6cb0" }} />
                    {source}
                  </span>
                ))}
              </div>
              <p className="trust-copy" style={{ display: "block", marginTop: 10, textAlign: "left" }}>
                건수는 실제 적재 기록에서만 읽어요. 이 껍데기에는 연결이 없어 숫자를 표시하지 않습니다.
              </p>
            </div>
          </section>
        </aside>

        <div className="main-stack">
          <section className="win">
            <div className="win-bar">
              <span>🪐 project.planets</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PROJECTS · TOP ROW</p>
                  <h2>{PROJECTS.length}개 프로젝트 · PM이 부서에 배정</h2>
                </div>
              </div>
              <div className="team-grid">
                {PROJECTS.map((project) => {
                  const pm = PROJECT_PM[project.id];
                  const status = snap.projectStatus[project.id] ?? "대기";
                  return (
                    <button
                      className="team-card"
                      key={project.id}
                      style={{ borderLeftColor: project.color }}
                      onClick={() => pm && onSelect(pm.id)}
                      disabled={!pm}
                    >
                      <span className={`status-dot ${statusClass[status]}`} aria-hidden="true" />
                      <span className="mini-pixel">
                        {pm ? <PixelEmployee hair={pm.hair} shirt={pm.shirt} accent={pm.accent} /> : <span>{project.icon}</span>}
                      </span>
                      <span className="team-copy">
                        <b>
                          {project.icon} {project.name}
                          {pm ? ` · ${pm.name}` : ""}
                        </b>
                        <small>
                          {live.on
                            ? "실제 요청 기록 기준"
                            : project.id === REQUEST.project
                              ? `${REQUEST.channel} · ${REQUEST.text}`
                              : "들어온 요청 없음"}
                        </small>
                      </span>
                      <span className={`status-pill ${statusClass[status]}`}>{status}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="win">
            <div className="win-bar">
              <span>🏢 team_office.board</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">LIVE OFFICE</p>
                  <h2>
                    공유 부서 {teams.length}개 · 에이전트 {STAFF_COUNT}명 근무 현황
                  </h2>
                </div>
                <div className="filter-tabs" role="group" aria-label="팀 상태 필터">
                  {(["전체", "작업 중", "완료", "확인 필요", "차단"] as const).map((item) => (
                    <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="team-grid">
                {filteredTeams.map((team) => (
                  <button
                    className="team-card"
                    key={team.id}
                    onClick={() => team.lead && onSelect(team.lead.id)}
                    disabled={!team.lead}
                  >
                    <span className={`status-dot ${statusClass[team.status]}`} aria-hidden="true" />
                    <span className="mini-pixel">
                      {team.lead ? (
                        <PixelEmployee hair={team.lead.hair} shirt={team.lead.shirt} accent={team.lead.accent} />
                      ) : (
                        <span style={{ fontSize: 22, lineHeight: "40px" }}>{team.icon}</span>
                      )}
                    </span>
                    <span className="team-copy">
                      <b>
                        {team.lead ? `${team.lead.name} · ` : ""}
                        {team.name}
                      </b>
                      <small>{team.task}</small>
                    </span>
                    <span className={`status-pill ${statusClass[team.status]}`}>{team.status}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="two-col">
            <section className="win">
              <div className="win-bar">
                <span>✅ ceo.approval</span>
                <span className="window-controls">—　▢　✕</span>
              </div>
              <div className="win-body approval-body">
                <div className="approval-top">
                  <span className="mini-badge yellow">■ {DECISION.tag}</span>
                  <span className="score">개발팀</span>
                </div>
                <h3>{DECISION.title}</h3>
                <p>{DECISION.summary}</p>
                <button
                  className={`btn approve-button ${snap.approved ? "approved" : ""}`}
                  onClick={onApprove}
                  disabled={!snap.approvalPending}
                >
                  {snap.approved ? "확인 완료 · 차단 해제됨" : snap.approvalPending ? DECISION.approveLabel : "대기 중인 안건 없음"}
                </button>
              </div>
            </section>

            <section className="win secretary">
              <div className="win-bar">
                <span>📋 hermes.brief</span>
                <span className="window-controls">—　▢　✕</span>
              </div>
              <div className="win-body">
                <p className="brief-date">
                  {todayText()} · {snap.clock} 현재
                </p>
                <h3>{snap.dayComplete ? "대표님, 오늘 맡기신 일이 정리됐어요." : "대표님, 현재 진행 상황이에요."}</h3>
                <ul>
                  <li>
                    <span className="dot green" />
                    {snap.phase} — 완료 {snap.stats.done}팀 · 작업 중 {snap.stats.working}팀
                  </li>
                  <li>
                    <span className={`dot ${snap.approvalPending ? "yellow" : "green"}`} />
                    {snap.approvalPending ? "검토 차단 1건 · 대표 확인 필요" : "대기 중인 대표 확인 없음"}
                  </li>
                  <li>
                    <span className="dot gray" />
                    차단 {snap.stats.blocked}팀 — 외부 연결 대기
                  </li>
                </ul>
                <div className="decision-box">
                  <span className="tiny-label">대표님이 오늘 결정할 1개</span>
                  <strong>
                    {snap.approvalPending
                      ? `${DECISION.title}`
                      : snap.approved
                        ? "결정 완료! QA → 결과 회수 → 보고로 이어져요."
                        : live.on
                          ? "실시간 모드 — 결정은 Hermes Desk 명령창에서 합니다."
                          : "아직 올라온 안건이 없어요."}
                  </strong>
                </div>
              </div>
            </section>
          </section>
        </div>
      </section>

      <section className="win storage">
        <div className="win-bar">
          <span>📦 result_storage</span>
          <span className="window-controls">—　▢　✕</span>
        </div>
        <div className="win-body">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RECENT OUTPUTS</p>
              <h2>결과 보관함</h2>
            </div>
            {STORAGE_LINK ? (
              <a className="btn btn-small" href={STORAGE_LINK} target="_blank" rel="noreferrer">
                보관함 열기
              </a>
            ) : null}
          </div>
          <div className="result-table">
            <div className="result-row header">
              <span>결과물</span>
              <span>담당팀</span>
              <span>상태</span>
              <span>바로가기</span>
            </div>
            {RESULTS.map((item) => (
              <div className="result-row" key={item.title}>
                <b>{item.title}</b>
                <span>{teams.find((t) => t.id === item.dept)?.name ?? item.dept}</span>
                <span className="status-pill done">{item.status}</span>
                {item.href ? (
                  <a href={item.href} target="_blank" rel="noreferrer">
                    열기 →
                  </a>
                ) : (
                  <span>—</span>
                )}
              </div>
            ))}
          </div>
          <p className="trust-copy" style={{ display: "block", marginTop: 10, textAlign: "left" }}>
            완료는 등록된 업무의 처리 상태이고, 최종 결과와 Slack 보고 전달은 따로 확인합니다.
          </p>
        </div>
      </section>

      <p className="dash-note">
        대표 {CEO.name}({CEO.callsign}) · AI 에이전트 {teams.length}개 부서 {STAFF_COUNT}명 · 이 화면은 라이브 오피스와
        같은 상태를 공유해요.
      </p>
    </>
  );
}
