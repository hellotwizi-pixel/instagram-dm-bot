// 라이브 오피스의 하루 결과 → 보고서로 변환하고 발행한다.
//
// 이 껍데기에는 서버가 없다. 기본값은 "미설정"이며, company.config.ts 의
// REPORT_ENDPOINT 에 URL을 넣으면 그 주소로 보고서 JSON을 POST 한다.
// 응답은 { notion: {ok, status, detail?, url?}, discord: {ok, status, detail?} } 형태를 기대한다.
import type { Snapshot } from "./sim";
import { BLOCK_NEED, DEPT_BRIEF } from "./staff";
import { roomOf } from "./world";
import { COMPANY, DECISION, INTEGRATIONS, REPORT_ENDPOINT, REQUEST } from "../../company.config";

export type DayReport = {
  title: string;
  clock: string;
  phase: string;
  counts: { total: number; done: number; working: number; approval: number; blocked: number };
  highlights: string[];
  decisions: string[];
  risks: string[];
  next: string[];
  log: { time: string; text: string }[];
};

export type PublishResult = {
  notion: { ok: boolean; status: string; detail?: string; url?: string };
  discord: { ok: boolean; status: string; detail?: string };
  publishedAt: string;
};

export type IntegrationStatus = Record<string, { configured: boolean; label: string; need?: string }>;

export function buildReport(snap: Snapshot): DayReport {
  const entries = Object.entries(snap.deptStatus);

  const highlights = entries
    .filter(([, status]) => status === "완료")
    .map(([dept]) => `${roomOf(dept).name} — ${DEPT_BRIEF[dept]?.report ?? "완료"}`);

  const risks = [
    ...entries
      .filter(([, status]) => status === "차단")
      .map(([dept]) => `${roomOf(dept).name} — ${BLOCK_NEED[dept] ?? "외부 연결"} 전이라 오늘 진행 불가`),
    ...entries
      .filter(([, status]) => status === "확인 필요")
      .map(([dept]) => `${roomOf(dept).name} — 확인 필요 (진행 소식 없음 또는 대표 결정 대기)`),
  ];

  const decisions = snap.live.on
    ? ["실시간 모드 — 결정 사항은 Hermes Desk 기록에서 확인"]
    : snap.approved
      ? [`${DECISION.title} — 허용, QA 실기기 검증까지 진행 완료`]
      : snap.approvalPending
        ? [`${DECISION.title} (대표 확인 대기 중)`]
        : ["오늘 대표 결정 안건 없음"];

  const next = [
    ...risks.map((risk) => `${risk.split(" — ")[0]}: 연결·확인되면 즉시 재가동`),
    snap.live.on ? "Hermes Desk 업무 보고에서 결과 파일 확인" : snap.approved ? `${REQUEST.project} 결과물 Slack 보고 · 게시는 대표 승인 뒤` : "요청 재검토",
  ];

  return {
    title: `${snap.clock} ${COMPANY.reportName} 일일 브리핑`,
    clock: snap.clock,
    phase: snap.phase,
    counts: {
      total: entries.length,
      done: snap.stats.done,
      working: snap.stats.working,
      approval: snap.stats.approval,
      blocked: snap.stats.blocked,
    },
    highlights,
    decisions,
    risks,
    next,
    log: [...snap.log].reverse().map((entry) => ({ time: entry.time, text: `${entry.icon} ${entry.text}` })),
  };
}

/** 보고서를 텍스트로 — 서버가 없을 때 콘솔·클립보드용 */
export function reportToText(report: DayReport): string {
  const section = (title: string, items: string[]) =>
    `## ${title}\n${items.length ? items.map((i) => `- ${i}`).join("\n") : "- 없음"}`;
  return [
    `# ${report.title}`,
    `${report.clock} 기준 · ${report.phase}`,
    `완료 ${report.counts.done} · 진행 ${report.counts.working} · 승인 대기 ${report.counts.approval} · 연동 대기 ${report.counts.blocked}`,
    section("핵심 성과", report.highlights),
    section("대표 결정사항", report.decisions),
    section("문제·위험", report.risks),
    section("다음 우선순위", report.next),
    section("오늘 진행 로그", report.log.map((l) => `${l.time} ${l.text}`)),
  ].join("\n\n");
}

export async function publish(report: DayReport): Promise<PublishResult> {
  if (!REPORT_ENDPOINT) {
    // 연동이 없으면 연결됐다고 거짓 보고하지 않는다. 보고서 본문은 브라우저 콘솔에 남긴다.
    console.info(reportToText(report));
    return {
      notion: { ok: false, status: "unconfigured", detail: "미설정" },
      discord: { ok: false, status: "unconfigured", detail: "미설정" },
      publishedAt: new Date().toISOString(),
    };
  }
  const response = await fetch(REPORT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!response.ok) throw new Error(`발행 실패 (HTTP ${response.status})`);
  return (await response.json()) as PublishResult;
}

export async function fetchIntegrations(): Promise<IntegrationStatus> {
  return {
    notion: { configured: Boolean(REPORT_ENDPOINT), label: "보고서 저장" },
    discord: { configured: Boolean(REPORT_ENDPOINT), label: "보고 전송" },
    ...INTEGRATIONS,
  };
}
