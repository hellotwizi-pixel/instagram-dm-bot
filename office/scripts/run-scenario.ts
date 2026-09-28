// 시나리오를 화면 없이 끝까지 돌려 막히는 곳이 없는지 확인한다
import { Company } from "../src/game/sim";
const engine = new Company();
engine.start();
engine.setSpeed(4);
let t = 0;
let approvedAt = -1;
let lastPhase = -1;
while (t < 4000) {
  engine.tick(0.05);
  t += 0.05;
  const s = engine.snapshot();
  if (s.phaseIndex !== lastPhase) {
    lastPhase = s.phaseIndex;
    console.log(`t=${t.toFixed(0)}s phase ${s.phaseIndex} ${s.phase}`);
  }
  if (s.approvalPending && approvedAt < 0) {
    approvedAt = t;
    engine.approve();
  }
  if (s.dayComplete) {
    console.log(`✓ 완료 t=${t.toFixed(0)}s · 승인 t=${approvedAt.toFixed(0)}s`);
    process.exit(0);
  }
}
const s = engine.snapshot();
console.error(`✗ 4000초 안에 못 끝남. phase=${s.phase}`);
const stuck = engine.agents.filter((a) => a.queue.length || a.current).map((a) => `${a.name}:${a.current?.k}@(${a.x.toFixed(1)},${a.y.toFixed(1)}) path=${a.path.length}/${a.pathIdx}`);
console.error(stuck.join("\n"));
process.exit(1);
