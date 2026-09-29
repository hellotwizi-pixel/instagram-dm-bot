// 인사기록부 — 직원 + 대표 1명
// 실제 내용은 프로젝트 루트의 company.config.ts 에서 가져옵니다.
// 이 파일은 고칠 필요 없어요. 이름·성격·색을 바꾸려면 company.config.ts 를 여세요.

import { CEO_PROFILE, DEPARTMENTS, PENDING_INTEGRATIONS, STAFF_LIST } from "../../company.config";

export type StaffSeed = {
  id: string;
  name: string;
  callsign?: string;
  role: string;
  deptId: string;
  rank: "lead" | "member" | "ceo";
  hair: string;
  shirt: string;
  accent: string;
  skin: string;
  /** 자리를 비웠을 때 혼잣말하는 생각 */
  thoughts: string[];
  /** 프로젝트 PM 이면 그 프로젝트 id (윗줄 프로젝트 방에 앉는다) */
  project?: string;
};

const SKIN = ["#ffdcc4", "#f7cdae", "#ffe3cf", "#eec39f"];

function skin(i: number) {
  return SKIN[i % SKIN.length];
}

let seq = 0;
function make(
  dept: string,
  rank: StaffSeed["rank"],
  name: string,
  role: string,
  colors: [string, string, string],
  thoughts: string[],
  callsign?: string,
  project?: string,
): StaffSeed {
  const i = seq++;
  // 팀장은 `<부서>-lead`, 팀원은 Hermes 프로필 id(callsign)를 그대로 id 로 쓴다
  const id = rank === "lead" ? `${dept}-lead` : callsign ?? `${dept}-m${i}`;
  return {
    id,
    name,
    callsign,
    role,
    deptId: dept,
    rank,
    hair: colors[0],
    shirt: colors[1],
    accent: colors[2],
    skin: skin(i),
    thoughts,
    project,
  };
}

export const CEO: StaffSeed = {
  id: "ceo",
  name: CEO_PROFILE.name,
  callsign: CEO_PROFILE.callsign,
  role: CEO_PROFILE.role,
  deptId: "ceo",
  rank: "ceo",
  hair: CEO_PROFILE.hair,
  shirt: CEO_PROFILE.shirt,
  accent: CEO_PROFILE.accent,
  skin: CEO_PROFILE.skin,
  thoughts: [...CEO_PROFILE.thoughts],
};

export const STAFF: StaffSeed[] = STAFF_LIST.map((s) =>
  make(s.dept, s.rank, s.name, s.role, s.colors, s.thoughts, s.callsign, s.project),
);

/** Hermes 프로필 id(callsign) → 직원 */
export const STAFF_BY_CALLSIGN: Record<string, StaffSeed> = Object.fromEntries(
  STAFF.filter((s) => s.callsign).map((s) => [s.callsign as string, s]),
);

/** 프로젝트 id → PM 직원 */
export const PROJECT_PM: Record<string, StaffSeed> = Object.fromEntries(
  STAFF.filter((s) => s.project).map((s) => [s.project as string, s]),
);

/** 부서별 팀장. 직원이 없는 부서(미미르)는 없을 수 있다 */
export const DEPT_LEAD: Record<string, StaffSeed> = Object.fromEntries(
  STAFF.filter((s) => s.rank === "lead").map((s) => [s.deptId, s]),
);

/** 부서별 오늘 업무 · 한줄보고 */
export const DEPT_BRIEF: Record<string, { task: string; report: string }> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, { task: d.task, report: d.report }]),
);

/** Hermes group 이름 → 부서 id (실시간 연결용) */
export const DEPT_BY_LIVE_GROUP: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.flatMap((d) => [d.name, ...d.liveGroups].map((g) => [g, d.id])),
);

/** 아직 외부 연결이 안 붙은 부서 → 화면에 "차단"으로 표시 */
export const BLOCK_NEED: Record<string, string> = PENDING_INTEGRATIONS;
