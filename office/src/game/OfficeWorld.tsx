"use client";

// 3D 오피스 렌더러 (Three.js)
// 엔진(sim.ts)의 타일 좌표를 그대로 쓴다: 타일 (x, y) → 월드 (x, 0, y). 1타일 = 1단위.
// 그리기만 담당하며 기록·상태를 만들지 않는다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Agent, Company, DeptStatus, Snapshot } from "./sim";
import { REPORT_PHASE } from "./sim";
import {
  CEO_ROOM,
  COLS,
  CORRIDOR,
  ENTRANCE,
  MEETING_ROOM,
  MIMIR_CENTER,
  MIMIR_RADIUS,
  PROPS,
  ROOMS,
  ROWS,
  roomOf,
  walkable,
  type Prop,
  type Room,
} from "./world";
import { PROJECTS } from "../../company.config";

const PROJECT_COLOR: Record<string, string> = Object.fromEntries(PROJECTS.map((p) => [p.id, p.color]));

const STATUS_COLOR: Record<DeptStatus, number> = {
  "완료": 0x5ef2c0,
  "작업 중": 0xffcf6e,
  "확인 필요": 0xff8fc0,
  "차단": 0xff6375,
  "대기": 0x46536a,
};

type Props = {
  engine: Company;
  snap: Snapshot;
  selectedId: string | null;
  follow: boolean;
  onSelect: (agent: Agent) => void;
};

const WALL_H = 2.1;
const PALETTE = {
  floor: 0x272d39,
  corridor: 0x3a4252,
  corridorLine: 0x50d6ff,
  roomFloor: 0x333b4a,
  wall: 0x3b4658,
  wallTop: 0x566478,
  glass: 0x7fd6ff,
  desk: 0x4a3f33,
  deskTop: 0x6b5a48,
  monitor: 0x0b1018,
  screen: 0x5ef2c0,
  chair: 0x2a2f3a,
  plantPot: 0x5a4636,
  plantLeaf: 0x3f9b6c,
  sofa: 0x4c4670,
  table: 0x3a4658,
  metal: 0x2b3446,
};

/** 캔버스로 글자 텍스처를 만든다 (이름표·말풍선) */
function textSprite(text: string, opts: { bg: string; color: string; size?: number; pad?: number; border?: string }): THREE.Sprite {
  const size = opts.size ?? 26;
  const pad = opts.pad ?? 14;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `800 ${size}px "Noto Sans KR", "Archivo", sans-serif`;
  const lines = text.split("\n");
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const height = lines.length * (size * 1.3) + pad * 1.6;
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  ctx.font = `800 ${size}px "Noto Sans KR", "Archivo", sans-serif`;
  ctx.fillStyle = opts.bg;
  const r = 12;
  ctx.beginPath();
  ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, r);
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = opts.color;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, pad, pad * 0.8 + i * size * 1.3));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const scale = 0.024;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function disposeSprite(sprite: THREE.Sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

/** 3D 아바타 — 몸통(캡슐)·머리·머리카락·다리·프로젝트 링·이름표·말풍선 */
type Avatar = {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  ring: THREE.Mesh;
  marker: THREE.Mesh;
  label: THREE.Sprite;
  bubble: THREE.Sprite | null;
  bubbleText: string;
  projectId: string | null;
  t: number;
};

function makeAvatar(agent: Agent, scene: THREE.Scene): Avatar {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: new THREE.Color(agent.shirt), roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(agent.skin), roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: new THREE.Color(agent.hair), roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.8 });
  const big = agent.rank === "ceo" ? 1.1 : 1;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * big, 0.36 * big, 4, 10), shirt);
  body.position.y = 0.62 * big;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21 * big, 16, 14), skin);
  head.position.y = 1.12 * big;
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.225 * big, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  cap.position.y = 1.14 * big;
  const legGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8);
  const legL = new THREE.Mesh(legGeo, dark);
  const legR = new THREE.Mesh(legGeo, dark);
  legL.position.set(-0.1, 0.15, 0);
  legR.position.set(0.1, 0.15, 0);
  const armGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.34, 8);
  const armL = new THREE.Mesh(armGeo, shirt);
  const armR = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.3 * big, 0.66 * big, 0);
  armR.position.set(0.3 * big, 0.66 * big, 0);
  // 눈
  const eyeGeo = new THREE.SphereGeometry(0.03, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a24 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.07, 1.14 * big, 0.19 * big);
  eyeR.position.set(0.07, 1.14 * big, 0.19 * big);
  // 프로젝트 링 (발밑)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  // 상태 마커 (차단·확인 필요)
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshBasicMaterial({ color: 0xff6375 }));
  marker.position.y = 1.62 * big;
  marker.visible = false;
  // 대표 왕관
  if (agent.rank === "ceo") {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.16, 5), new THREE.MeshStandardMaterial({ color: 0xffcf6e, emissive: 0x6b4d00, roughness: 0.3 }));
    crown.position.y = 1.42 * big;
    group.add(crown);
  }
  const label = textSprite(`${agent.name}${agent.rank === "lead" ? (agent.project ? " · PM" : " · 팀장") : agent.rank === "ceo" ? " · 대표" : ""}`, {
    bg: agent.rank === "ceo" ? "rgba(255,207,110,.95)" : "rgba(13,19,34,.9)",
    color: agent.rank === "ceo" ? "#1a1400" : "#dbe7f5",
    size: 24,
    border: agent.rank === "lead" ? "#50d6ff" : undefined,
  });
  label.position.y = 1.55 * big;
  label.scale.multiplyScalar(0.55);

  group.add(body, head, cap, legL, legR, armL, armR, eyeL, eyeR, ring, marker, label);
  scene.add(group);
  return { group, body, head, legL, legR, armL, armR, ring, marker, label, bubble: null, bubbleText: "", projectId: null, t: Math.random() * 10 };
}

function addBox(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 방 하나: 바닥 판, 낮은 벽 + 유리, 문 틈, 이름표 */
function buildRoom(room: Room, scene: THREE.Scene, mats: ReturnType<typeof makeMaterials>): { floor: THREE.Mesh; frame: THREE.Mesh } {
  const g = new THREE.Group();
  const cx = room.x + room.w / 2;
  const cz = room.y + room.h / 2;
  const floor = addBox(g, room.w - 0.1, 0.08, room.h - 0.1, cx, 0.04, cz, mats.roomFloor.clone(), false);
  const doors = new Set(room.doors.map((d) => `${d.x},${d.y}`));
  const wallBase = 0.55;
  const segment = (x0: number, z0: number, x1: number, z1: number, horizontal: boolean) => {
    // 문 타일은 비운다
    const len = horizontal ? x1 - x0 : z1 - z0;
    for (let i = 0; i < len; i += 1) {
      const tx = horizontal ? x0 + i : x0;
      const tz = horizontal ? z0 : z0 + i;
      if (doors.has(`${tx},${tz}`)) {
        // 문틀 빛
        const glow = addBox(g, horizontal ? 1 : 0.16, 0.06, horizontal ? 0.16 : 1, tx + 0.5, 0.1, tz + 0.5, mats.doorGlow, false);
        glow.receiveShadow = false;
        continue;
      }
      addBox(g, horizontal ? 1.02 : 0.28, wallBase, horizontal ? 0.28 : 1.02, tx + 0.5, wallBase / 2, tz + 0.5, mats.wall);
      const glass = addBox(g, horizontal ? 1.02 : 0.1, WALL_H - wallBase, horizontal ? 0.1 : 1.02, tx + 0.5, wallBase + (WALL_H - wallBase) / 2, tz + 0.5, mats.glass, false);
      glass.receiveShadow = false;
    }
  };
  segment(room.x, room.y, room.x + room.w, room.y, true);
  segment(room.x, room.y + room.h - 1, room.x + room.w, room.y + room.h - 1, true);
  segment(room.x, room.y + 1, room.x, room.y + room.h - 1, false);
  segment(room.x + room.w - 1, room.y + 1, room.x + room.w - 1, room.y + room.h - 1, false);
  // 상단 프레임 (상태 색)
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(room.w + 0.05, 0.08, room.h + 0.05),
    new THREE.MeshStandardMaterial({ color: room.color ? new THREE.Color(room.color) : 0x46536a, emissive: 0x000000, roughness: 0.4 }),
  );
  frame.position.set(cx, WALL_H + 0.02, cz);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.5, 0.1, room.h - 0.5), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  inner.position.set(cx, WALL_H + 0.02, cz);
  // 프레임을 테두리처럼 보이게: 안쪽을 어둡게 덮는 대신 테두리 4개 막대
  frame.visible = false;
  const barMat = frame.material as THREE.MeshStandardMaterial;
  addBox(g, room.w + 0.05, 0.1, 0.16, cx, WALL_H + 0.02, room.y + 0.5, barMat, false);
  addBox(g, room.w + 0.05, 0.1, 0.16, cx, WALL_H + 0.02, room.y + room.h - 0.5, barMat, false);
  addBox(g, 0.16, 0.1, room.h + 0.05, room.x + 0.5, WALL_H + 0.02, cz, barMat, false);
  addBox(g, 0.16, 0.1, room.h + 0.05, room.x + room.w - 0.5, WALL_H + 0.02, cz, barMat, false);
  void inner;
  // 이름표
  const label = textSprite(`${room.icon} ${room.name}`, {
    bg: room.color ? room.color : room.kind === "ceo" ? "#ffcf6e" : "#0d1322",
    color: room.kind === "ceo" ? "#1a1400" : "#ffffff",
    size: 30,
    border: room.kind === "project" ? undefined : "#50d6ff",
  });
  label.position.set(cx, WALL_H + 0.9, room.y + 0.6);
  label.scale.multiplyScalar(0.9);
  g.add(label);
  scene.add(g);
  return { floor, frame };
}

function buildProp(prop: Prop, scene: THREE.Scene, mats: ReturnType<typeof makeMaterials>) {
  const g = new THREE.Group();
  const cx = prop.x + prop.w / 2;
  const cz = prop.y + prop.h / 2;
  switch (prop.kind) {
    case "desk": {
      addBox(g, prop.w - 0.15, 0.08, prop.h - 0.2, cx, 0.72, cz, mats.deskTop);
      addBox(g, 0.08, 0.7, 0.08, prop.x + 0.2, 0.35, prop.y + 0.2, mats.desk);
      addBox(g, 0.08, 0.7, 0.08, prop.x + prop.w - 0.2, 0.35, prop.y + 0.2, mats.desk);
      addBox(g, 0.08, 0.7, 0.08, prop.x + 0.2, 0.35, prop.y + prop.h - 0.2, mats.desk);
      addBox(g, 0.08, 0.7, 0.08, prop.x + prop.w - 0.2, 0.35, prop.y + prop.h - 0.2, mats.desk);
      // 모니터 + 화면
      addBox(g, 0.9, 0.55, 0.06, cx, 1.06, cz - 0.25, mats.monitor);
      const screen = addBox(g, 0.8, 0.45, 0.02, cx, 1.06, cz - 0.21, mats.screen, false);
      screen.receiveShadow = false;
      addBox(g, 0.12, 0.2, 0.12, cx, 0.82, cz - 0.28, mats.monitor);
      addBox(g, 0.5, 0.03, 0.18, cx, 0.78, cz + 0.15, mats.metal, false);
      // 의자 (자리 쪽)
      addBox(g, 0.5, 0.08, 0.5, cx, 0.42, cz + 1, mats.chair);
      addBox(g, 0.5, 0.5, 0.08, cx, 0.7, cz + 1.24, mats.chair);
      addBox(g, 0.06, 0.4, 0.06, cx, 0.2, cz + 1, mats.metal, false);
      break;
    }
    case "ceo-desk": {
      addBox(g, prop.w - 0.2, 0.1, prop.h - 0.2, cx, 0.78, cz, mats.ceoDeskTop);
      addBox(g, prop.w - 0.6, 0.7, prop.h - 0.6, cx, 0.36, cz, mats.desk);
      addBox(g, 1.1, 0.62, 0.06, cx, 1.14, cz - 0.4, mats.monitor);
      const screen = addBox(g, 1, 0.52, 0.02, cx, 1.14, cz - 0.36, mats.screenGold, false);
      screen.receiveShadow = false;
      // 대표 의자 (책상 위쪽)
      addBox(g, 0.6, 0.1, 0.6, cx, 0.45, cz - 1.15, mats.chair);
      addBox(g, 0.6, 0.7, 0.1, cx, 0.8, cz - 1.42, mats.chair);
      break;
    }
    case "table": {
      addBox(g, prop.w - 0.3, 0.1, prop.h - 0.3, cx, 0.74, cz, mats.tableTop);
      addBox(g, 0.5, 0.7, 0.5, cx, 0.36, cz, mats.metal);
      // 회의용 의자 (위·아래)
      if (prop.w >= 8) {
        for (const dx of [-3, 0, 3]) {
          addBox(g, 0.5, 0.08, 0.5, cx + dx, 0.42, prop.y - 0.5, mats.chair);
          addBox(g, 0.5, 0.08, 0.5, cx + dx, 0.42, prop.y + prop.h + 0.5, mats.chair);
        }
      }
      break;
    }
    case "sofa": {
      addBox(g, prop.w - 0.2, 0.45, prop.h + 0.2, cx, 0.3, cz, mats.sofa);
      addBox(g, prop.w - 0.2, 0.5, 0.25, cx, 0.7, cz - prop.h / 2 - 0.05, mats.sofa);
      break;
    }
    case "coffee": {
      addBox(g, prop.w - 0.2, 0.9, prop.h - 0.2, cx, 0.45, cz, mats.metal);
      addBox(g, 0.5, 0.5, 0.4, cx, 1.15, cz, mats.monitor);
      const lamp = addBox(g, 0.3, 0.1, 0.1, cx, 1.2, cz + 0.2, mats.screenGold, false);
      lamp.receiveShadow = false;
      break;
    }
    case "plant": {
      addBox(g, 0.5, 0.4, 0.5, cx, 0.2, cz, mats.plantPot);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mats.plantLeaf);
      leaf.position.set(cx, 0.8, cz);
      leaf.scale.y = 1.3;
      leaf.castShadow = true;
      g.add(leaf);
      break;
    }
    case "shelf":
    case "cabinet": {
      addBox(g, prop.w - 0.2, 1.6, prop.h - 0.3, cx, 0.8, cz, prop.kind === "shelf" ? mats.desk : mats.metal);
      addBox(g, prop.w - 0.4, 0.04, prop.h - 0.4, cx, 0.9, cz - 0.05, mats.deskTop, false);
      break;
    }
    case "screen":
    case "whiteboard":
    case "board": {
      const mat = prop.kind === "screen" ? mats.monitor : mats.wall;
      addBox(g, prop.w - 0.2, 1.1, 0.12, cx, 1.4, cz, mat);
      const face = addBox(
        g,
        prop.w - 0.4,
        0.9,
        0.03,
        cx,
        1.4,
        cz + 0.08,
        prop.kind === "screen" ? mats.screen : prop.kind === "board" ? new THREE.MeshStandardMaterial({ color: new THREE.Color(prop.color ?? "#50d6ff"), emissive: new THREE.Color(prop.color ?? "#50d6ff"), emissiveIntensity: 0.35, roughness: 0.5 }) : mats.white,
        false,
      );
      face.receiveShadow = false;
      if (prop.label) {
        const label = textSprite(prop.label, { bg: "rgba(0,0,0,0)", color: prop.kind === "board" ? "#ffffff" : "#5ef2c0", size: 22 });
        label.position.set(cx, 1.45, cz + 0.2);
        label.scale.multiplyScalar(0.6);
        g.add(label);
      }
      break;
    }
    case "rug": {
      addBox(g, prop.w, 0.03, prop.h, cx, 0.09, cz, mats.rug, false);
      break;
    }
    case "reactor":
      break;
    default:
      break;
  }
  scene.add(g);
}

/** 아크 리액터 — 하우징 링, 회전 스트럿, 코어, 빛 */
function buildReactor(scene: THREE.Scene) {
  const g = new THREE.Group();
  g.position.set(MIMIR_CENTER.x + 0.5, 0, MIMIR_CENTER.y + 0.5);
  const r = MIMIR_RADIUS;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.4, r + 0.8, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.5, metalness: 0.6 }));
  base.position.y = 0.25;
  base.receiveShadow = true;
  const housing = new THREE.Mesh(new THREE.TorusGeometry(r - 0.6, 0.45, 12, 48), new THREE.MeshStandardMaterial({ color: 0x3a4658, roughness: 0.35, metalness: 0.8 }));
  housing.rotation.x = Math.PI / 2;
  housing.position.y = 0.7;
  housing.castShadow = true;
  const notches = new THREE.Group();
  for (let i = 0; i < 10; i += 1) {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 1.1), new THREE.MeshStandardMaterial({ color: 0x0d1219, roughness: 0.6, metalness: 0.5 }));
    const a = (i / 10) * Math.PI * 2;
    n.position.set(Math.cos(a) * (r - 0.6), 0.7, Math.sin(a) * (r - 0.6));
    n.rotation.y = -a;
    notches.add(n);
  }
  const coil = new THREE.Mesh(new THREE.TorusGeometry(r - 2.1, 0.22, 10, 48), new THREE.MeshStandardMaterial({ color: 0x50d6ff, emissive: 0x50d6ff, emissiveIntensity: 1.4, roughness: 0.2 }));
  coil.rotation.x = Math.PI / 2;
  coil.position.y = 0.75;
  const struts = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(r - 2.2, 0.2, 0.35), new THREE.MeshStandardMaterial({ color: 0x3a4658, roughness: 0.4, metalness: 0.8 }));
    s.position.set((r - 2.2) / 2, 0.75, 0);
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 3) * Math.PI * 2;
    pivot.add(s);
    struts.add(pivot);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe8ff, emissiveIntensity: 2.2, roughness: 0.1 }));
  core.position.y = 0.9;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 18), new THREE.MeshBasicMaterial({ color: 0x50d6ff, transparent: true, opacity: 0.18, depthWrite: false }));
  glow.position.y = 0.9;
  const light = new THREE.PointLight(0x50d6ff, 40, 30, 1.6);
  light.position.y = 2.2;
  const label = textSprite("MIMIR · 회사 기억", { bg: "rgba(13,19,34,.85)", color: "#9fe8ff", size: 30, border: "#50d6ff" });
  label.position.y = 3.2;
  label.scale.multiplyScalar(0.9);
  g.add(base, housing, notches, coil, struts, core, glow, light, label);
  scene.add(g);
  return { notches, struts, core, glow, light };
}

function makeMaterials() {
  return {
    roomFloor: new THREE.MeshStandardMaterial({ color: PALETTE.roomFloor, roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.6, metalness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.14, roughness: 0.1, metalness: 0.2, depthWrite: false }),
    doorGlow: new THREE.MeshBasicMaterial({ color: 0x50d6ff }),
    desk: new THREE.MeshStandardMaterial({ color: PALETTE.desk, roughness: 0.7 }),
    deskTop: new THREE.MeshStandardMaterial({ color: PALETTE.deskTop, roughness: 0.55 }),
    ceoDeskTop: new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 0.4, metalness: 0.1 }),
    tableTop: new THREE.MeshStandardMaterial({ color: 0x4a5670, roughness: 0.4 }),
    monitor: new THREE.MeshStandardMaterial({ color: PALETTE.monitor, roughness: 0.4, metalness: 0.4 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0f3a3a, emissive: PALETTE.screen, emissiveIntensity: 0.9, roughness: 0.3 }),
    screenGold: new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xffcf6e, emissiveIntensity: 0.8, roughness: 0.3 }),
    chair: new THREE.MeshStandardMaterial({ color: PALETTE.chair, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.4, metalness: 0.7 }),
    plantPot: new THREE.MeshStandardMaterial({ color: PALETTE.plantPot, roughness: 0.9 }),
    plantLeaf: new THREE.MeshStandardMaterial({ color: PALETTE.plantLeaf, roughness: 0.8 }),
    sofa: new THREE.MeshStandardMaterial({ color: PALETTE.sofa, roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.6 }),
    rug: new THREE.MeshStandardMaterial({ color: 0x3a3325, roughness: 1 }),
  };
}

export default function OfficeWorld({ engine, snap, selectedId, follow, onSelect }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<"fit" | "close">("fit");
  const selectedRef = useRef<string | null>(selectedId);
  const zoomRef = useRef(zoom);
  const followRef = useRef(follow);
  const focusRef = useRef<{ x: number; z: number } | null>(null);
  const snapRef = useRef(snap);
  const onSelectRef = useRef(onSelect);
  const resetRef = useRef<(() => void) | null>(null);
  const hotRef = useRef<string | null>(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const hotRoom = useMemo(() => {
    if (snap.spotlight) return snap.spotlight;
    if (snap.meetingTitle) return MEETING_ROOM.id;
    if (!snap.live.on && snap.phaseIndex >= REPORT_PHASE) return CEO_ROOM.id;
    const working = Object.entries(snap.deptStatus).find(([, status]) => status === "작업 중");
    return working?.[0] ?? null;
  }, [snap.spotlight, snap.meetingTitle, snap.phaseIndex, snap.deptStatus, snap.live.on]);

  useEffect(() => {
    if (hotRoom === "mimir") focusRef.current = { x: MIMIR_CENTER.x, z: MIMIR_CENTER.y };
    else if (hotRoom) {
      const room = roomOf(hotRoom);
      focusRef.current = { x: room.x + room.w / 2, z: room.y + room.h / 2 };
    } else if (!snap.live.on && snap.phaseIndex <= 1) focusRef.current = { x: ENTRANCE.x, z: ENTRANCE.y - 8 };
    else focusRef.current = null;
  }, [hotRoom, snap.phaseIndex, snap.live.on]);

  const resetView = useCallback(() => resetRef.current?.(), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11161f);
    scene.fog = new THREE.Fog(0x11161f, 110, 210);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minDistance = 8;
    controls.maxDistance = 160;
    controls.target.set(MIMIR_CENTER.x, 0, MIMIR_CENTER.y);
    camera.position.set(MIMIR_CENTER.x, 95, MIMIR_CENTER.y + 78);
    resetRef.current = () => {
      controls.target.set(MIMIR_CENTER.x, 0, MIMIR_CENTER.y);
      camera.position.set(MIMIR_CENTER.x, 95, MIMIR_CENTER.y + 78);
    };

    // 조명
    scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x2a2622, 1.25));
    scene.add(new THREE.AmbientLight(0x6b7a99, 0.45));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(COLS * 0.3, 70, ROWS * 0.15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0008;
    sun.target.position.set(COLS / 2, 0, ROWS / 2);
    scene.add(sun, sun.target);

    const mats = makeMaterials();

    // 바닥 (카펫) + 복도 타일
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(COLS + 40, ROWS + 40), new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(COLS / 2, 0, ROWS / 2);
    ground.receiveShadow = true;
    scene.add(ground);
    const corridorCount = CORRIDOR.reduce((n, v) => n + v, 0);
    const corridorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 1), new THREE.MeshStandardMaterial({ color: PALETTE.corridor, roughness: 0.7 }), corridorCount);
    corridorMesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    let k = 0;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!CORRIDOR[y * COLS + x] || !walkable(x, y)) continue;
        m.makeTranslation(x + 0.5, 0.025, y + 0.5);
        corridorMesh.setMatrixAt(k++, m);
      }
    }
    corridorMesh.count = k;
    scene.add(corridorMesh);
    // 복도 안내선 (시안)
    const lineMat = new THREE.LineBasicMaterial({ color: PALETTE.corridorLine, transparent: true, opacity: 0.35 });
    const linePts: number[] = [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!CORRIDOR[y * COLS + x]) continue;
        const edge = (nx: number, ny: number) => !CORRIDOR[ny * COLS + nx] && walkable(nx, ny);
        if (edge(x, y - 1)) linePts.push(x, 0.06, y, x + 1, 0.06, y);
        if (edge(x, y + 1)) linePts.push(x, 0.06, y + 1, x + 1, 0.06, y + 1);
        if (edge(x - 1, y)) linePts.push(x, 0.06, y, x, 0.06, y + 1);
        if (edge(x + 1, y)) linePts.push(x + 1, 0.06, y, x + 1, 0.06, y + 1);
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePts, 3));
    scene.add(new THREE.LineSegments(lineGeo, lineMat));
    // 출입구 매트
    const mat = addBox(scene, 5, 0.06, 1.6, ENTRANCE.x + 1, 0.03, ENTRANCE.y - 0.6, new THREE.MeshStandardMaterial({ color: 0x1f6f8a, emissive: 0x50d6ff, emissiveIntensity: 0.25 }), false);
    mat.receiveShadow = false;
    const entranceLabel = textSprite("ENTRANCE", { bg: "rgba(13,19,34,.85)", color: "#50d6ff", size: 22, border: "#50d6ff" });
    entranceLabel.position.set(ENTRANCE.x + 1, 1.2, ENTRANCE.y - 0.6);
    entranceLabel.scale.multiplyScalar(0.7);
    scene.add(entranceLabel);

    // 방·가구·리액터
    const roomMeshes = new Map<string, { floor: THREE.Mesh; frame: THREE.Mesh }>();
    for (const room of ROOMS) roomMeshes.set(room.id, buildRoom(room, scene, mats));
    for (const prop of PROPS) buildProp(prop, scene, mats);
    const reactor = buildReactor(scene);

    // 아바타
    const avatars = new Map<string, Avatar>();
    for (const agent of engine.agents) avatars.set(agent.id, makeAvatar(agent, scene));

    // 지식 입자
    const MAX_P = 60;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(MAX_P * 3);
    const pCol = new Float32Array(MAX_P * 3);
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    scene.add(points);
    const particles: { tx: number; tz: number; t: number; color: THREE.Color }[] = [];

    // 클릭 → 직원 선택
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const bodies = [...avatars.entries()].map(([id, a]) => Object.assign(a.body, { userData: { id } }));
      const heads = [...avatars.entries()].map(([id, a]) => Object.assign(a.head, { userData: { id } }));
      const hit = raycaster.intersectObjects([...bodies, ...heads], false)[0];
      if (hit) {
        const agent = engine.agentById.get(hit.object.userData.id as string);
        if (agent) onSelectRef.current(agent);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tmpTarget = new THREE.Vector3();
    const tmpCam = new THREE.Vector3();
    let raf = 0;
    let last = performance.now();
    const paint = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = snapRef.current;

      // 카메라: 가까이 + 자동 추적이면 초점으로 스르륵
      if (zoomRef.current === "close" && followRef.current && focusRef.current) {
        tmpTarget.set(focusRef.current.x, 0, focusRef.current.z);
        controls.target.lerp(tmpTarget, 0.04);
        tmpCam.copy(controls.target).add(new THREE.Vector3(0, 18, 16));
        camera.position.lerp(tmpCam, 0.04);
      } else if (zoomRef.current === "fit") {
        tmpTarget.set(MIMIR_CENTER.x, 0, MIMIR_CENTER.y);
        controls.target.lerp(tmpTarget, 0.05);
        tmpCam.set(MIMIR_CENTER.x, 95, MIMIR_CENTER.y + 78);
        camera.position.lerp(tmpCam, 0.05);
      }
      controls.update();

      // 방 프레임 색 = 상태
      for (const room of ROOMS) {
        const rm = roomMeshes.get(room.id);
        if (!rm) continue;
        const status = room.kind === "project" ? s.projectStatus[room.id] : s.deptStatus[room.id];
        const floorMat = rm.floor.material as THREE.MeshStandardMaterial;
        const hot = hotRef.current === room.id;
        const target = status && status !== "대기" ? new THREE.Color(STATUS_COLOR[status]) : new THREE.Color(PALETTE.roomFloor);
        floorMat.emissive.lerp(status && status !== "대기" ? target.clone().multiplyScalar(0.08) : new THREE.Color(0), 0.1);
        floorMat.color.lerp(status && status !== "대기" ? new THREE.Color(PALETTE.roomFloor).lerp(target, 0.12) : new THREE.Color(PALETTE.roomFloor), 0.1);
        if (hot) floorMat.emissive.lerp(new THREE.Color(0x50d6ff).multiplyScalar(0.12 + Math.sin(now / 250) * 0.05), 0.2);
      }

      // 리액터
      if (!reduced) {
        reactor.notches.rotation.y += dt * 0.15;
        reactor.struts.rotation.y -= dt * 0.35;
        const pulse = 1 + Math.sin(now / 300) * 0.08;
        reactor.core.scale.setScalar(pulse);
        reactor.glow.scale.setScalar(1 + Math.sin(now / 300) * 0.15);
        reactor.light.intensity = 36 + Math.sin(now / 300) * 10;
      }

      // 아바타
      const picked = selectedRef.current;
      for (const agent of engine.agents) {
        const av = avatars.get(agent.id);
        if (!av) continue;
        av.t += dt;
        const off = agent.status === "출근 전";
        av.group.visible = !off;
        if (off) continue;
        av.group.position.set(agent.x + 0.5 + agent.jitter, 0, agent.y + 0.5);
        const face = agent.facing === "up" ? Math.PI : agent.facing === "down" ? 0 : agent.facing === "left" ? -Math.PI / 2 : Math.PI / 2;
        av.group.rotation.y += (face - av.group.rotation.y) * 0.2;
        const walking = agent.anim === "walk";
        const sitting = agent.anim === "sit" || agent.anim === "type";
        const swing = walking && !reduced ? Math.sin(av.t * 14) * 0.5 : 0;
        av.legL.rotation.x = swing;
        av.legR.rotation.x = -swing;
        av.armL.rotation.x = agent.anim === "type" && !reduced ? -0.9 + Math.sin(av.t * 18) * 0.15 : -swing * 0.6;
        av.armR.rotation.x = agent.anim === "type" && !reduced ? -0.9 - Math.sin(av.t * 18) * 0.15 : swing * 0.6;
        av.body.position.y = (sitting ? 0.45 : 0.62) + (walking && !reduced ? Math.abs(Math.sin(av.t * 14)) * 0.05 : 0);
        av.head.position.y = (sitting ? 0.95 : 1.12) + (agent.anim === "talk" && !reduced ? Math.sin(av.t * 10) * 0.03 : 0);
        av.legL.visible = av.legR.visible = !sitting;
        // 프로젝트 링
        if (av.projectId !== agent.project) {
          av.projectId = agent.project;
          av.ring.visible = Boolean(agent.project);
          if (agent.project) (av.ring.material as THREE.MeshBasicMaterial).color.set(PROJECT_COLOR[agent.project] ?? "#50d6ff");
        }
        // 상태 마커
        const flag = agent.status === "차단" ? 0xff6375 : agent.status === "확인 필요" ? 0xffcf6e : null;
        av.marker.visible = flag !== null;
        if (flag !== null) {
          (av.marker.material as THREE.MeshBasicMaterial).color.set(flag);
          av.marker.rotation.y += dt * 3;
        }
        // 선택 표시
        av.label.material.opacity = picked === agent.id ? 1 : 0.92;
        (av.label.material as THREE.SpriteMaterial).color.set(picked === agent.id ? 0xffcf6e : 0xffffff);
        // 말풍선
        const text = agent.speech ?? "";
        if (av.bubbleText !== text) {
          av.bubbleText = text;
          if (av.bubble) {
            av.group.remove(av.bubble);
            disposeSprite(av.bubble);
            av.bubble = null;
          }
          if (text) {
            av.bubble = textSprite(text, {
              bg: agent.speechKind === "think" ? "rgba(26,26,51,.95)" : "rgba(13,19,34,.95)",
              color: agent.speechKind === "think" ? "#c9c1ff" : "#dbe7f5",
              size: 24,
              border: agent.speechKind === "think" ? "#8b7cff" : "#50d6ff",
            });
            av.bubble.position.y = 2.15;
            av.bubble.scale.multiplyScalar(0.6);
            av.group.add(av.bubble);
          }
        }
      }

      // 지식 입자: 리액터 → 일하는 방
      if (!reduced) {
        const targets: { x: number; z: number; color: THREE.Color }[] = [];
        for (const agent of engine.agents) {
          if (agent.status !== "업무 중" || agent.rank === "ceo") continue;
          const room = roomOf(agent.deptId === "pm" && agent.project ? agent.project : agent.deptId);
          targets.push({ x: room.x + room.w / 2, z: room.y + room.h / 2, color: new THREE.Color(agent.project ? PROJECT_COLOR[agent.project] ?? "#50d6ff" : "#50d6ff") });
        }
        if (targets.length && particles.length < MAX_P && Math.random() < 0.3) {
          const pick = targets[Math.floor(Math.random() * targets.length)];
          particles.push({ tx: pick.x, tz: pick.z, t: 0, color: pick.color });
        }
        for (let i = particles.length - 1; i >= 0; i -= 1) {
          const p = particles[i];
          p.t += dt * 0.35;
          if (p.t >= 1) particles.splice(i, 1);
        }
        for (let i = 0; i < MAX_P; i += 1) {
          const p = particles[i];
          if (!p) {
            pPos[i * 3 + 1] = -10;
            continue;
          }
          const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
          pPos[i * 3] = MIMIR_CENTER.x + 0.5 + (p.tx - MIMIR_CENTER.x - 0.5) * e;
          pPos[i * 3 + 1] = 1.2 + Math.sin(p.t * Math.PI) * 6;
          pPos[i * 3 + 2] = MIMIR_CENTER.y + 0.5 + (p.tz - MIMIR_CENTER.y - 0.5) * e;
          pCol[i * 3] = p.color.r;
          pCol[i * 3 + 1] = p.color.g;
          pCol[i * 3 + 2] = p.color.b;
        }
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // hotRoom 은 ref 로 읽지 않고 클로저에 두면 stale 이 되므로 아래 별도 effect 로 갱신한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  useEffect(() => {
    hotRef.current = hotRoom;
  }, [hotRoom]);

  return (
    <div className="world-frame">
      <div className="world-viewport world-3d" ref={mountRef}>
        <div className="world-hud">
          <button className={zoom === "fit" ? "on" : ""} onClick={() => { setZoom("fit"); resetView(); }}>
            🗺️ 전체 보기
          </button>
          <button className={zoom === "close" ? "on" : ""} onClick={() => setZoom("close")}>
            🔍 가까이
          </button>
        </div>
        <div className="world-hint">드래그로 회전 · 휠로 확대 · 직원 클릭하면 프로필</div>
      </div>
    </div>
  );
}
