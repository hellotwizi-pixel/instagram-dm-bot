// 통합 개발 실행기: Hermes Desk(파이썬) 를 먼저 띄우고, 토큰이 나오면 Hermes Office(Vite) 를 실시간 모드로 띄운다.
//   node dev.mjs            → 둘 다 실행 (Desk 포트 64729, Office 포트 3000)
//   node dev.mjs --office   → Office 만 (켜져 있는 Desk 가 있으면 자동으로 붙음)
//   node dev.mjs --desk     → Desk 만
// 의존 패키지 없음. 이 창을 닫으면(Ctrl+C) 둘 다 꺼진다.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DESK_DIR = path.join(ROOT, "hermes-desk");
const OFFICE_DIR = path.join(ROOT, "office");
const DESK_PORT = Number(process.env.HERMES_DESK_PORT || 64729);
const OFFICE_PORT = Number(process.env.OFFICE_PORT || 3000);
const args = new Set(process.argv.slice(2));
const runDesk = !args.has("--office");
const runOffice = !args.has("--desk");
const children = [];

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

function pythonBin() {
  // Hermes 가 설치된 Mac 이면 그 venv 파이썬(PyYAML 포함), 아니면 .venv, 아니면 시스템 python3
  const candidates = [
    path.join(homedir(), ".hermes", "hermes-agent", "venv", "bin", "python"),
    path.join(DESK_DIR, ".venv", "bin", "python"),
    path.join(DESK_DIR, ".venv", "Scripts", "python.exe"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return process.platform === "win32" ? "python" : "python3";
}

function deskAlive(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/connect", headers: { "X-Desk-Bootstrap": "1" }, timeout: 1000 }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve(body.includes("token")));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

async function waitForDesk(port, seconds) {
  for (let i = 0; i < seconds * 2; i += 1) {
    if (await deskAlive(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function run(tag, cmd, cmdArgs, cwd, env = {}) {
  const child = spawn(cmd, cmdArgs, { cwd, stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  child.on("exit", (code) => log(tag, `종료 (code ${code})`));
  children.push(child);
  return child;
}

function shutdown() {
  for (const c of children) if (!c.killed) c.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let deskPort = null;
if (runDesk) {
  if (await deskAlive(DESK_PORT)) {
    log("desk", `이미 포트 ${DESK_PORT} 에 Hermes Desk 가 떠 있어요. 그걸 씁니다.`);
    deskPort = DESK_PORT;
  } else {
    log("desk", `Hermes Desk 시작 · 포트 ${DESK_PORT}`);
    run("desk", pythonBin(), ["server.py", "--port", String(DESK_PORT), "--no-open"], DESK_DIR);
    if (await waitForDesk(DESK_PORT, 20)) deskPort = DESK_PORT;
    else log("desk", "20초 안에 응답이 없어요. Office 는 시나리오 모드로 엽니다. (PyYAML 설치·파이썬 경로 확인)");
  }
} else if (await deskAlive(DESK_PORT)) {
  deskPort = DESK_PORT;
}

if (runOffice) {
  if (!existsSync(path.join(OFFICE_DIR, "node_modules"))) {
    log("office", "처음 실행이라 npm install 을 먼저 합니다 (1~2분)…");
    await new Promise((resolve, reject) => {
      const c = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["install"], { cwd: OFFICE_DIR, stdio: "inherit" });
      c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("npm install 실패"))));
    });
  }
  const env = deskPort ? { HERMES_DESK_URL: `http://127.0.0.1:${deskPort}` } : {};
  log("office", deskPort ? `실시간 모드 (Desk ${deskPort}) · http://localhost:${OFFICE_PORT}` : `시나리오 모드 · http://localhost:${OFFICE_PORT}`);
  run("office", process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", String(OFFICE_PORT), "--strictPort"], OFFICE_DIR, env);
  setTimeout(() => {
    const url = `http://localhost:${OFFICE_PORT}`;
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn(opener, [url], { shell: process.platform === "win32", stdio: "ignore" }).on("error", () => {});
  }, 3500);
}
