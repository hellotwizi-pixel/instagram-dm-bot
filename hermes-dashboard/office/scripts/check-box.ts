// 이동 중 상자(프로젝트 + 요청자)가 실제로 들리는지 — 시나리오 모드와 실시간 모드 둘 다
import { Company } from "../src/game/sim";

// 1) 시나리오
{
  const engine = new Company();
  engine.start(); engine.setSpeed(4);
  const seen = new Map<string, Set<string>>();
  let t = 0; let approved = false;
  while (t < 400) {
    engine.tick(0.05); t += 0.05;
    const s = engine.snapshot();
    if (s.approvalPending && !approved) { approved = true; engine.approve(); }
    for (const a of engine.agents) if (a.anim === "walk" && a.project && a.requester) {
      if (!seen.has(a.name)) seen.set(a.name, new Set()); seen.get(a.name)!.add(`${a.project}/${a.requester}`);
    }
    if (s.dayComplete) break;
  }
  console.log("시나리오에서 상자 든 사람:", [...seen].map(([n, v]) => `${n}(${[...v].join(",")})`).join(" · "));
  if (!seen.size) { console.error("✗ 시나리오: 아무도 상자를 안 듦"); process.exit(1); }
}

// 2) 실시간 — Slack 기록에 요청자가 있는 작업만 상자
{
  const engine = new Company();
  engine.enterLive();
  const now = Date.now() / 1000;
  const task = { id: "t_1", title: "키워드 분기 로직 구현", assignee: "devcoder", status: "in_progress", group: "개발팀" };
  engine.applyLive({ checked: now, cursor: 10, tasks: [task], events: [], requests: [] }, true);
  engine.applySlack({ conversations: [{ id: "C1", profile: "replypm", user: "승범", taskIds: ["t_1"], requestText: "하하팩토리 랜딩 수정" }] });
  engine.applySlack({ conversations: [{ id: "C1", profile: "replypm", user: "승범", taskIds: ["t_1"], requestText: "하하팩토리 랜딩 수정" }] });
  // 새 배정 이벤트 → 헤르메스가 상자 들고 개발팀으로
  engine.applyLive({ checked: now + 3, cursor: 11, tasks: [task], events: [{ id: 11, task_id: "t_1", kind: "assigned", created_at: now + 3, assignee: "devcoder", title: task.title, detail: "" }], requests: [] }, false);
  let carried = ""; let t = 0;
  while (t < 120) {
    engine.tick(0.05); t += 0.05;
    const h = engine.agentById.get("hermes-lead")!;
    if (h.anim === "walk" && h.project && h.requester) carried = `${h.project}/${h.requester}`;
    if (carried && h.status === "대기") break;
  }
  const coder = engine.agentById.get("devcoder")!;
  console.log("실시간: 헤르메스 배달 상자 =", carried || "(없음)", "· 코더 project/requester =", coder.project, coder.requester);
  if (!carried || coder.requester !== "승범") { console.error("✗ 실시간 상자 실패"); process.exit(1); }
  // 요청자 기록이 없는 작업은 상자 없음
  const engine2 = new Company(); engine2.enterLive();
  engine2.applyLive({ checked: now, cursor: 1, tasks: [task], events: [], requests: [] }, true);
  const c2 = engine2.agentById.get("devcoder")!;
  console.log("실시간(요청자 기록 없음): 코더 requester =", c2.requester);
  if (c2.requester) { console.error("✗ 기록 없는데 요청자 표시"); process.exit(1); }
}
console.log("✓ 상자 검사 통과");
