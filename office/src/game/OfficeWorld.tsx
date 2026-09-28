"use client";

// 3D 오피스 렌더러 (Three.js)
// 엔진(sim.ts)의 타일 좌표를 그대로 쓴다: 타일 (x, y) → 월드 (x, 0, y). 1타일 = 1단위.
// 그리기만 담당하며 기록·상태를 만들지 않는다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Agent, Company, DeptStatus, Snapshot } from "./sim";
import { REPORT_PHASE } from "./sim";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  BRIDGES,
  CEO_ROOM,
  COLS,
  ENTRANCE,
  ISLANDS,
  LEVEL_H,
  MEETING_ROOM,
  elevationAt,
  MIMIR_CENTER,
  MIMIR_RADIUS,
  PROPS,
  ROOMS,
  ROWS,
  roomOf,
  type Bridge,
  type Island,
  type Prop,
  type Room,
} from "./world";
import { PROJECTS } from "../../company.config";
import { heightOf, loadKit, place, type Kit } from "./models";
import { buildRig, loadCharacters, playRig, type Rig } from "./characters";

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
// 밝은 글래스모피즘 팔레트 (Apple 스타일: 흰 반투명 판, 연한 파랑·보라 배경, 파란 강조)
const PALETTE = {
  floor: 0xe9edf5,
  corridor: 0xe4eaf6,
  corridorLine: 0x0a84ff,
  roomFloor: 0xeef1f7,
  wall: 0xd6dde9,
  wallTop: 0xc9d2e2,
  glass: 0xffffff,
  desk: 0xb9a892,
  deskTop: 0xe6dccb,
  monitor: 0x2c3140,
  screen: 0x5ac8fa,
  chair: 0xb8c2d4,
  plantPot: 0xc9b8a4,
  plantLeaf: 0x5cbf8a,
  sofa: 0xb7b3e6,
  table: 0xe0e6f2,
  metal: 0xb8c2d4,
  islandTop: 0xf2f5fb,
  islandSide: 0xd3dbea,
  islandRock: 0xc6cfe0,
  plank: 0xe6edfb,
  plankLine: 0xc9d4ea,
  rail: 0xd6dde9,
};

/** 배경 하늘 구에 입힐 세로 그라데이션 (위 = 파랑, 아래 = 연보라) */
function gradientBackground(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#8fb2ff");
  g.addColorStop(0.5, "#d3ddf8");
  g.addColorStop(1, "#e9cff5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 다리 널빤지 텍스처 */
function plankTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  // 반투명 유리 보도: 연한 판 + 가는 이음선
  ctx.fillStyle = "#eef3ff";
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = i % 2 ? "#e9effc" : "#f2f6ff";
    ctx.fillRect(0, i * 16, 64, 16);
    ctx.fillStyle = "#d3dcf0";
    ctx.fillRect(0, i * 16, 64, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 섬: 두꺼운 바닥판 + 아래 바위 밑동 + 테두리 빛 + 이름표 */
function buildIsland(island: Island, scene: THREE.Scene): void {
  const g = new THREE.Group();
  const cx = island.x + island.w / 2;
  const cz = island.y + island.h / 2;
  const tint = island.color ? new THREE.Color(island.color) : null;
  const topColor = new THREE.Color(PALETTE.islandTop);
  if (tint) topColor.lerp(tint, 0.12);
  const sideColor = new THREE.Color(PALETTE.islandSide);
  if (tint) sideColor.lerp(tint, 0.1);
  const top = new THREE.MeshPhysicalMaterial({ color: topColor, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, transparent: true, opacity: 0.94 });
  const side = new THREE.MeshPhysicalMaterial({ color: sideColor, roughness: 0.4, metalness: 0, clearcoat: 0.6, transparent: true, opacity: 0.85 });
  const H = island.level * LEVEL_H;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(island.w, 2.4, island.h), [side, side, top, side, side, side]);
  slab.position.set(cx, H - 1.2, cz);
  slab.receiveShadow = true;
  slab.castShadow = true;
  g.add(slab);
  // 밑동 (섬이 떠 있는 느낌)
  const rock = new THREE.Mesh(
    new THREE.BoxGeometry(island.w - 2.5, 2.2, island.h - 2.5),
    new THREE.MeshPhysicalMaterial({ color: PALETTE.islandRock, roughness: 0.5, transparent: true, opacity: 0.7, clearcoat: 0.4 }),
  );
  rock.position.set(cx, H - 3.4, cz);
  g.add(rock);
  const rock2 = new THREE.Mesh(
    new THREE.BoxGeometry(island.w - 6, 1.6, island.h - 6),
    new THREE.MeshPhysicalMaterial({ color: 0xb9c4d8, roughness: 0.5, transparent: true, opacity: 0.55 }),
  );
  rock2.position.set(cx, H - 5.2, cz);
  g.add(rock2);
  // 테두리 빛
  const edgeColor = tint ? tint : new THREE.Color(PALETTE.corridorLine);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(island.w, 0.02, island.h)),
    new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: island.kind === "project" ? 0.7 : 0.35 }),
  );
  edge.position.set(cx, H + 0.02, cz);
  g.add(edge);
  // 이름표 (프로젝트 섬은 방 이름이 이미 있으므로 생략)
  if (island.kind !== "project") {
    const label = textSprite(`${island.icon} ${island.name}`, { bg: "rgba(255,255,255,.86)", color: "#1d1d1f", size: 26, border: "rgba(10,132,255,.45)" });
    label.position.set(island.x + 3.2, H + 2.6, island.y + 0.9);
    label.scale.multiplyScalar(0.85);
    g.add(label);
  }
  scene.add(g);
}

/** 다리: 널빤지 + 난간 */
function buildBridge(bridge: Bridge, scene: THREE.Scene, plankMat: THREE.MeshPhysicalMaterial, railMat: THREE.MeshStandardMaterial): void {
  const g = new THREE.Group();
  const horizontal = bridge.from.y === bridge.to.y;
  const x0 = Math.min(bridge.from.x, bridge.to.x);
  const x1 = Math.max(bridge.from.x, bridge.to.x);
  const y0 = Math.min(bridge.from.y, bridge.to.y);
  const y1 = Math.max(bridge.from.y, bridge.to.y);
  const len = (horizontal ? x1 - x0 : y1 - y0) + 1 + 1.2; // 양 끝 0.6 씩 섬 안으로 물린다
  const wide = bridge.width + 0.2;
  const cx = horizontal ? (x0 + x1 + 1) / 2 : bridge.from.x + bridge.width / 2;
  const cz = horizontal ? bridge.from.y + bridge.width / 2 : (y0 + y1 + 1) / 2;
  const mat = plankMat.clone() as THREE.MeshPhysicalMaterial;
  mat.map = plankMat.map!.clone();
  mat.map.needsUpdate = true;
  mat.map.repeat.set(horizontal ? len / 2 : 1, horizontal ? 1 : len / 2);
  // 높이: from 쪽 끝 h0 → to 쪽 끝 h1. 진행 방향(+축이면 dir=1)
  const dir = horizontal ? Math.sign(bridge.to.x - bridge.from.x) || 1 : Math.sign(bridge.to.y - bridge.from.y) || 1;
  const hStart = dir > 0 ? bridge.h0 : bridge.h1; // 축 작은 쪽 끝의 높이
  const hEnd = dir > 0 ? bridge.h1 : bridge.h0;
  const dh = hEnd - hStart;
  const stairs = Math.abs(dh) > 0.01;
  const baseH = Math.min(hStart, hEnd);
  const heightAt = (t: number) => hStart + dh * (t + 0.5); // t ∈ [-0.5, 0.5] (축 작은 쪽 → 큰 쪽)
  if (!stairs) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : wide, 0.5, horizontal ? wide : len), mat);
    plank.position.set(cx, hStart - 0.22, cz);
    plank.receiveShadow = true;
    plank.castShadow = true;
    g.add(plank);
  } else {
    // 계단: 디딤판 n개. 각 디딤판은 아래 바닥까지 꽉 찬 상자라 옆에서 보면 계단 모양
    const n = Math.max(4, Math.round(len * 2));
    const stepLen = len / n;
    for (let i = 0; i < n; i += 1) {
      const t = -0.5 + (i + 0.5) / n;
      const top = heightAt(t);
      const depth = top - baseH + 0.5;
      const step = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? stepLen + 0.02 : wide, depth, horizontal ? wide : stepLen + 0.02), mat);
      step.position.set(horizontal ? cx + t * len : cx, top - depth / 2, horizontal ? cz : cz + t * len);
      step.receiveShadow = true;
      step.castShadow = true;
      g.add(step);
    }
  }
  // 다리 밑 받침 (대로만)
  if (bridge.kind === "avenue") {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : wide - 0.6, 0.6, horizontal ? wide - 0.6 : len), new THREE.MeshPhysicalMaterial({ color: PALETTE.islandSide, roughness: 0.4, transparent: true, opacity: 0.8 }));
    beam.position.set(cx, hStart - 0.75, cz);
    g.add(beam);
  }
  // 난간: 양쪽 가로대(경사면 따라 기울임) + 기둥
  const railH = 0.85;
  const off = wide / 2 + 0.08;
  const slopeLen = Math.hypot(len, dh);
  const slope = Math.atan2(dh, len);
  for (const sgn of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? slopeLen : 0.08, 0.08, horizontal ? 0.08 : slopeLen), railMat);
    rail.position.set(horizontal ? cx : cx + sgn * off, (hStart + hEnd) / 2 + railH, horizontal ? cz + sgn * off : cz);
    if (horizontal) rail.rotation.z = slope;
    else rail.rotation.x = -slope;
    rail.castShadow = true;
    g.add(rail);
    const rail2 = rail.clone();
    rail2.position.y = (hStart + hEnd) / 2 + railH * 0.5;
    g.add(rail2);
    const posts = Math.max(2, Math.round(len / 2.5));
    for (let i = 0; i <= posts; i += 1) {
      const t = -0.5 + (0.3 + (i * (len - 0.6)) / posts) / len;
      const floorH = heightAt(t);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, railH, 0.12), railMat);
      post.position.set(horizontal ? cx + t * len : cx + sgn * off, floorH + railH / 2, horizontal ? cz + sgn * off : cz + t * len);
      g.add(post);
    }
  }
  scene.add(g);
}

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
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
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
  box: THREE.Group;
  boxMat: THREE.MeshStandardMaterial;
  boxLabel: THREE.Sprite | null;
  boxKey: string;
  t: number;
  /** 절차적 몸통 (모델이 없을 때만 보임; 클릭 판정에도 씀) */
  parts: THREE.Object3D[];
  rig: Rig | null;
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
    bg: agent.rank === "ceo" ? "rgba(255,214,10,.95)" : "rgba(255,255,255,.9)",
    color: "#1d1d1f",
    size: 24,
    border: agent.rank === "lead" ? "#0a84ff" : "rgba(120,130,160,.35)",
  });
  label.position.y = 1.55 * big;
  label.scale.multiplyScalar(0.55);

  // 머리 위 업무 상자 — 이동 중에만 보인다. 색 = 프로젝트, 글자 = 시킨 사람
  const box = new THREE.Group();
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.46), boxMat);
  crate.castShadow = true;
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.1), new THREE.MeshStandardMaterial({ color: 0xf2e8d0, roughness: 0.6 }));
  const tape2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.48), new THREE.MeshStandardMaterial({ color: 0xf2e8d0, roughness: 0.6 }));
  box.add(crate, tape, tape2);
  box.position.y = 1.62 * big;
  box.visible = false;
  group.add(box);

  group.add(body, head, cap, legL, legR, armL, armR, eyeL, eyeR, ring, marker, label);
  scene.add(group);
  return { group, body, head, legL, legR, armL, armR, ring, marker, label, bubble: null, bubbleText: "", projectId: null, box, boxMat, boxLabel: null, boxKey: "", t: Math.random() * 10, parts: [body, head, cap, legL, legR, armL, armR, eyeL, eyeR], rig: null };
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
    new THREE.MeshStandardMaterial({ color: room.color ? new THREE.Color(room.color) : 0x9fb0cc, emissive: 0x000000, roughness: 0.4 }),
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
  // 러그 (부서·프로젝트 방)
  if (room.kind === "dept" || room.kind === "project") {
    const rug = addBox(g, Math.max(2, room.w - 5), 0.02, Math.max(2, room.h - 5), cx, 0.1, cz + 0.5, mats.rugSoft, false);
    rug.receiveShadow = true;
  }
  // 벽 포스터 2장 (위쪽 벽 안쪽)
  for (const [ox, color] of [
    [-room.w / 4, room.color ?? "#50d6ff"],
    [room.w / 4, "#ffcf6e"],
  ] as [number, string][]) {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.15, roughness: 0.8 }));
    poster.position.set(cx + ox, 1.3, room.y + 0.66);
    g.add(poster);
  }
  // 천장 펜던트 조명 (발광 판)
  const lamp = addBox(g, Math.min(3, room.w - 4), 0.08, 0.6, cx, WALL_H + 0.6, cz, mats.lamp, false);
  lamp.receiveShadow = false;
  const cord = addBox(g, 0.04, 0.6, 0.04, cx, WALL_H + 0.95, cz, mats.metal, false);
  cord.receiveShadow = false;
  // 이름표
  const label = textSprite(`${room.icon} ${room.name}`, {
    bg: room.color ? room.color : room.kind === "ceo" ? "#ffd60a" : "rgba(255,255,255,.9)",
    color: room.kind === "ceo" ? "#1a1400" : room.color ? "#ffffff" : "#1d1d1f",
    size: 30,
    border: room.kind === "project" ? undefined : "rgba(10,132,255,.5)",
  });
  label.position.set(cx, WALL_H + 0.9, room.y + 0.6);
  label.scale.multiplyScalar(0.9);
  g.add(label);
  g.position.y = elevationAt(room.x + 0.5, room.y + 0.5);
  scene.add(g);
  return { floor, frame };
}

function buildProp(prop: Prop, scene: THREE.Scene, mats: ReturnType<typeof makeMaterials>, kit: Kit | null) {
  const g = new THREE.Group();
  const cx = prop.x + prop.w / 2;
  const cz = prop.y + prop.h / 2;
  g.position.y = elevationAt(prop.x + 0.5, prop.y + 0.5);
  if (kit && buildKitProp(prop, g, kit, mats)) {
    scene.add(g);
    return;
  }
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
      // 컵·서류
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.16, 10), mats.white);
      cup.position.set(cx + 0.9, 0.84, cz + 0.1);
      cup.castShadow = true;
      g.add(cup);
      addBox(g, 0.5, 0.02, 0.36, cx - 0.9, 0.77, cz + 0.05, mats.white, false);
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
        const label = textSprite(prop.label, { bg: "rgba(0,0,0,0)", color: prop.kind === "board" ? "#ffffff" : "#e8fbff", size: 22 });
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

/** Kenney 가구 키트로 놓을 수 있는 가구. 못 놓는 종류(스크린·화이트보드·게시판·리액터)는 false → 절차적 가구 */
function buildKitProp(prop: Prop, g: THREE.Group, kit: Kit, mats: ReturnType<typeof makeMaterials>): boolean {
  const cx = prop.x + prop.w / 2;
  const cz = prop.y + prop.h / 2;
  switch (prop.kind) {
    case "desk": {
      // 책상은 3칸 폭. 자리는 아래쪽(+z) 이라 모니터는 위쪽, 의자는 아래쪽
      place(g, kit, "desk", cx, cz);
      const top = heightOf(kit, "desk");
      place(g, kit, "computerScreen", cx, cz - 0.18, { y: top, rotY: 0 });
      place(g, kit, "computerKeyboard", cx, cz + 0.12, { y: top });
      place(g, kit, "chairDesk", cx, cz + 1, { rotY: Math.PI });
      place(g, kit, prop.x % 2 ? "books" : "plantSmall2", prop.x + 0.45, cz, { y: top, rotY: Math.PI / 2 });
      return true;
    }
    case "ceo-desk": {
      place(g, kit, "desk", cx, cz, { scale: 1.6, rotY: Math.PI });
      const top = heightOf(kit, "desk", 1.6);
      place(g, kit, "laptop", cx, cz + 0.1, { y: top, rotY: Math.PI });
      place(g, kit, "plantSmall2", cx + 1.4, cz, { y: top });
      place(g, kit, "books", cx - 1.4, cz, { y: top });
      // 대표 의자는 책상 위쪽(-z), 아래쪽(+z)을 본다
      place(g, kit, "chairDesk", cx, cz - 1.15, { scale: 1.15 });
      return true;
    }
    case "table": {
      if (prop.w >= 8) {
        // 회의 테이블: 큰 십자 다리 테이블 + 위·아래 의자
        place(g, kit, "tableCross", cx, cz, { scale: 1.3 });
        for (const dx of [-3, 0, 3]) {
          place(g, kit, "chairModernCushion", cx + dx, prop.y - 0.5, { rotY: 0 });
          place(g, kit, "chairModernCushion", cx + dx, prop.y + prop.h + 0.5, { rotY: Math.PI });
        }
      } else {
        place(g, kit, "tableCoffee", cx, cz, { scale: 1.2 });
      }
      return true;
    }
    case "sofa": {
      // 5칸 폭: 소파 두 개 나란히. 등받이는 위쪽(-z)
      const n = Math.max(1, Math.round(prop.w / 2.4));
      for (let i = 0; i < n; i += 1) place(g, kit, "loungeSofa", prop.x + (i + 0.5) * (prop.w / n), cz, { scale: 1.15 });
      return true;
    }
    case "coffee": {
      place(g, kit, "kitchenBar", cx, cz, { fit: { w: prop.w - 0.2, d: prop.h - 0.2 } });
      place(g, kit, "kitchenCoffeeMachine", cx, cz, { y: heightOf(kit, "kitchenBar") });
      return true;
    }
    case "plant": {
      place(g, kit, "pottedPlant", cx, cz, { rotY: (prop.x * 7 + prop.y * 3) % 6 });
      return true;
    }
    case "shelf": {
      const n = Math.max(1, Math.round(prop.w / 0.9));
      for (let i = 0; i < n; i += 1) place(g, kit, "bookcaseOpen", prop.x + (i + 0.5) * (prop.w / n), cz);
      return true;
    }
    case "cabinet": {
      place(g, kit, "cabinetTelevision", cx, cz, { rotY: Math.PI });
      return true;
    }
    case "rug": {
      place(g, kit, "rugRectangle", cx, cz, { y: 0.09, fit: { w: prop.w, d: prop.h } });
      return true;
    }
    default:
      return false;
  }
  void mats;
}

/** 섬 장식: 광장 벤치·가로등, 대로 끝 가로등 */
function buildDecor(scene: THREE.Scene, kit: Kit) {
  const g = new THREE.Group();
  const plaza = ISLANDS.find((i) => i.kind === "plaza");
  if (plaza) {
    const y = plaza.level * LEVEL_H;
    place(g, kit, "bench", plaza.x + 2.5, plaza.y + plaza.h - 1.5, { rotY: 0, y });
    place(g, kit, "bench", plaza.x + plaza.w - 2.5, plaza.y + plaza.h - 1.5, { rotY: 0, y });
    place(g, kit, "lampRoundFloor", plaza.x + 1, plaza.y + plaza.h - 1, { y });
    place(g, kit, "lampRoundFloor", plaza.x + plaza.w - 1, plaza.y + plaza.h - 1, { y });
  }
  for (const island of ISLANDS) {
    if (island.kind === "project" || island.kind === "plaza") continue;
    const y = island.level * LEVEL_H;
    place(g, kit, "lampRoundFloor", island.x + 1, island.y + 1, { y });
    place(g, kit, "lampRoundFloor", island.x + island.w - 1, island.y + island.h - 1, { y });
  }
  scene.add(g);
}

/** 아크 리액터 — 하우징 링, 회전 스트럿, 코어, 빛 */
function buildReactor(scene: THREE.Scene) {
  const g = new THREE.Group();
  g.position.set(MIMIR_CENTER.x + 0.5, elevationAt(MIMIR_CENTER.x + 0.5, MIMIR_CENTER.y + 0.5), MIMIR_CENTER.y + 0.5);
  const r = MIMIR_RADIUS;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.4, r + 0.8, 0.5, 48), new THREE.MeshPhysicalMaterial({ color: 0xdfe6f3, roughness: 0.3, metalness: 0.1, clearcoat: 1 }));
  base.position.y = 0.25;
  base.receiveShadow = true;
  const housing = new THREE.Mesh(new THREE.TorusGeometry(r - 0.6, 0.45, 12, 48), new THREE.MeshStandardMaterial({ color: 0xd8e0ee, roughness: 0.35, metalness: 0.25 }));
  housing.rotation.x = Math.PI / 2;
  housing.position.y = 0.7;
  housing.castShadow = true;
  const notches = new THREE.Group();
  for (let i = 0; i < 10; i += 1) {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 1.1), new THREE.MeshStandardMaterial({ color: 0x8e9bb5, roughness: 0.5, metalness: 0.5 }));
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
    const s = new THREE.Mesh(new THREE.BoxGeometry(r - 2.2, 0.2, 0.35), new THREE.MeshStandardMaterial({ color: 0xd8e0ee, roughness: 0.35, metalness: 0.25 }));
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
  const label = textSprite("MIMIR · 회사 기억", { bg: "rgba(255,255,255,.88)", color: "#0a6fd6", size: 30, border: "#5ac8fa" });
  label.position.y = 3.2;
  label.scale.multiplyScalar(0.9);
  g.add(base, housing, notches, coil, struts, core, glow, light, label);
  scene.add(g);
  return { notches, struts, core, glow, light };
}

function makeMaterials() {
  return {
    roomFloor: new THREE.MeshStandardMaterial({ color: PALETTE.roomFloor, roughness: 0.9 }),
    wall: new THREE.MeshPhysicalMaterial({ color: PALETTE.wall, roughness: 0.35, metalness: 0, clearcoat: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.26, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false }),
    doorGlow: new THREE.MeshBasicMaterial({ color: 0x0a84ff }),
    desk: new THREE.MeshStandardMaterial({ color: PALETTE.desk, roughness: 0.7 }),
    deskTop: new THREE.MeshStandardMaterial({ color: PALETTE.deskTop, roughness: 0.55 }),
    ceoDeskTop: new THREE.MeshStandardMaterial({ color: 0xd9c39a, roughness: 0.4, metalness: 0.1 }),
    tableTop: new THREE.MeshStandardMaterial({ color: 0xe4e9f3, roughness: 0.4 }),
    monitor: new THREE.MeshStandardMaterial({ color: PALETTE.monitor, roughness: 0.4, metalness: 0.4 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x2b4a66, emissive: PALETTE.screen, emissiveIntensity: 0.6, roughness: 0.3 }),
    screenGold: new THREE.MeshStandardMaterial({ color: 0x5a4a20, emissive: 0xffcf6e, emissiveIntensity: 0.6, roughness: 0.3 }),
    chair: new THREE.MeshStandardMaterial({ color: PALETTE.chair, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.4, metalness: 0.7 }),
    plantPot: new THREE.MeshStandardMaterial({ color: PALETTE.plantPot, roughness: 0.9 }),
    plantLeaf: new THREE.MeshStandardMaterial({ color: PALETTE.plantLeaf, roughness: 0.8 }),
    sofa: new THREE.MeshStandardMaterial({ color: PALETTE.sofa, roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.6 }),
    rug: new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 1 }),
    rugSoft: new THREE.MeshStandardMaterial({ color: 0xe3e8f2, roughness: 1 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff1c9, emissiveIntensity: 1.6, roughness: 0.4 }),
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
    // ACES 는 파스텔 색을 회색으로 눌러서, 색을 보존하는 Neutral 톤매핑을 쓴다
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // 배경: 카메라 뒤쪽 멀리 붙인 판에 화면 세로 그라데이션. 직교 카메라라 매 프레임 프러스텀 크기에 맞춘다
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: gradientBackground(), toneMapped: false, depthWrite: false }));
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    sky.position.z = -650;

    // 고정 아이소메트릭 카메라 (직교 투영). 회전 없음, 이동·확대만.
    const FRUSTUM = 50; // zoom 1 일 때 화면 세로 반높이 (월드 단위)
    const ISO_DIR = new THREE.Vector3(1, 1.15, 1).normalize();
    const ISO_DIST = 260;
    const WORLD_MID = new THREE.Vector3(COLS / 2, 0, ROWS / 2);
    const HOME = WORLD_MID.clone();
    const camera = new THREE.OrthographicCamera(-FRUSTUM, FRUSTUM, FRUSTUM, -FRUSTUM, 1, 700);
    camera.add(sky);
    scene.add(camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableRotate = false;
    controls.screenSpacePanning = false;
    controls.minZoom = 0.6;
    controls.maxZoom = 6;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    let fitZoom = 1;
    const placeCamera = () => camera.position.copy(controls.target).addScaledVector(ISO_DIR, ISO_DIST);
    controls.target.copy(HOME);
    placeCamera();
    resetRef.current = () => {
      controls.target.copy(HOME);
      camera.zoom = fitZoom;
      camera.updateProjectionMatrix();
      placeCamera();
    };

    // 조명
    scene.add(new THREE.HemisphereLight(0xf4f7ff, 0xd5dcea, 1.0));
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xfff6e6, 1.7);
    sun.position.set(COLS * 0.3, 70, ROWS * 0.15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -95;
    sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95;
    sun.shadow.camera.bottom = -95;
    sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0008;
    sun.target.position.set(COLS / 2, 0, ROWS / 2);
    scene.add(sun, sun.target);

    const mats = makeMaterials();

    // 섬 + 다리 (섬 밖은 허공)
    for (const island of ISLANDS) buildIsland(island, scene);
    const plankMat = new THREE.MeshPhysicalMaterial({ map: plankTexture(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.9 });
    const railMat = new THREE.MeshStandardMaterial({ color: PALETTE.rail, roughness: 0.25, metalness: 0.6 });
    for (const bridge of BRIDGES) buildBridge(bridge, scene, plankMat, railMat);
    // 출입구 매트
    const entranceH = elevationAt(ENTRANCE.x + 0.5, ENTRANCE.y + 0.5);
    const mat = addBox(scene, 5, 0.06, 1.6, ENTRANCE.x + 1, entranceH + 0.03, ENTRANCE.y - 0.6, new THREE.MeshStandardMaterial({ color: 0x9fd4ff, emissive: 0x5ac8fa, emissiveIntensity: 0.2 }), false);
    mat.receiveShadow = false;
    const entranceLabel = textSprite("ENTRANCE", { bg: "rgba(255,255,255,.9)", color: "#0a84ff", size: 22, border: "#5ac8fa" });
    entranceLabel.position.set(ENTRANCE.x + 1, entranceH + 1.2, ENTRANCE.y - 0.6);
    entranceLabel.scale.multiplyScalar(0.7);
    scene.add(entranceLabel);

    let disposed = false;
    // 방·가구·리액터
    const roomMeshes = new Map<string, { floor: THREE.Mesh; frame: THREE.Mesh }>();
    for (const room of ROOMS) roomMeshes.set(room.id, buildRoom(room, scene, mats));
    // 가구: Kenney 키트를 읽어서 놓고, 실패하면 절차적 가구
    loadKit().then((kit) => {
      if (disposed) return;
      for (const prop of PROPS) buildProp(prop, scene, mats, kit);
      if (kit) buildDecor(scene, kit);
    });
    const reactor = buildReactor(scene);

    // 아바타
    const avatars = new Map<string, Avatar>();
    for (const agent of engine.agents) avatars.set(agent.id, makeAvatar(agent, scene));
    loadCharacters().then((set) => {
      if (disposed || !set) return;
      for (const agent of engine.agents) {
        const av = avatars.get(agent.id);
        if (!av) continue;
        const rig = buildRig(set, agent);
        if (!rig) continue;
        for (const part of av.parts) part.visible = false;
        av.group.add(rig.root);
        av.rig = rig;
      }
    });

    // 지식 입자
    const MAX_P = 60;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(MAX_P * 3);
    const pCol = new Float32Array(MAX_P * 3);
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setDrawRange(0, 0);
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    scene.add(points);
    const particles: { tx: number; tz: number; t: number; color: THREE.Color }[] = [];
    const reactorH = elevationAt(MIMIR_CENTER.x + 0.5, MIMIR_CENTER.y + 0.5);

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

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, 1, 1);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    // GTAO 는 씬 클립 박스의 모서리 자리에 검은 조각 인공물을 그린다 (기본 박스는 원점 ±1). 박스를 화면 밖 멀리 둔다
    ao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-400, -60, -400), new THREE.Vector3(COLS + 400, 60, ROWS + 400)));
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
    ao.blendIntensity = 0.55;
    // AO 의 노멀 패스는 스프라이트(이름표·말풍선)를 세로 판으로 그려서 뒤에 어두운 마름모가 생긴다 → 그 패스 동안 스프라이트를 숨긴다
    const hiddenSprites: THREE.Object3D[] = [];
    const aoHooks = ao as unknown as { overrideVisibility: () => void; restoreVisibility: () => void };
    const baseOverride = aoHooks.overrideVisibility.bind(ao);
    const baseRestore = aoHooks.restoreVisibility.bind(ao);
    aoHooks.overrideVisibility = () => {
      baseOverride();
      scene.traverse((o) => {
        if ((o as THREE.Sprite).isSprite && o.visible) {
          o.visible = false;
          hiddenSprites.push(o);
        }
      });
    };
    aoHooks.restoreVisibility = () => {
      baseRestore();
      for (const o of hiddenSprites) o.visible = true;
      hiddenSprites.length = 0;
    };
    if (new URLSearchParams(location.search).get("ao") !== "0") composer.addPass(ao);
    // 블룸은 뺐다: 밝은 유리 테마에서는 배경까지 뿌옇게 만들어서. 리액터 빛은 발광 재질 + 점광원으로 충분하다
    // 톤매핑 + sRGB 변환은 마지막 OutputPass 가 맡는다
    composer.addPass(new OutputPass());
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      const aspect = w / h;
      camera.left = -FRUSTUM * aspect;
      camera.right = FRUSTUM * aspect;
      camera.top = FRUSTUM;
      camera.bottom = -FRUSTUM;
      // 전체 보기: 월드 네 귀퉁이(바닥·섬 밑동·벽 높이)를 투영해 화면에 들어오는 배율과 중심을 구한다
      const probe = camera.clone();
      probe.zoom = 1;
      probe.position.copy(WORLD_MID).addScaledVector(ISO_DIR, ISO_DIST);
      probe.lookAt(WORLD_MID);
      probe.updateProjectionMatrix();
      probe.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, z] of [[0, 0], [COLS, 0], [0, ROWS], [COLS, ROWS]] as const)
        for (const y of [-6.5, 3.5 + 2 * LEVEL_H]) {
          const v = new THREE.Vector3(x, y, z).project(probe);
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        }
      fitZoom = Math.min(2 / (maxX - minX), 2 / (maxY - minY)) * 0.96;
      // 투영 상자의 중심이 화면 가운데 오도록 목표점을 옮긴다 (zoom 1 기준 NDC → 월드)
      const cxN = (minX + maxX) / 2, cyN = (minY + maxY) / 2;
      const right = new THREE.Vector3(1, 0, -1).normalize();
      const upGround = new THREE.Vector3(-1, 0, -1).normalize();
      const sinElev = ISO_DIR.y;
      HOME.copy(WORLD_MID).addScaledVector(right, cxN * FRUSTUM * aspect).addScaledVector(upGround, (cyN * FRUSTUM) / sinElev);
      if (zoomRef.current === "fit") {
        camera.zoom = fitZoom;
        controls.target.copy(HOME);
        placeCamera();
      }
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 디버그: ?view=x,z,zoom 으로 카메라 고정 (스크린샷 확인용)
    const debugView = (new URLSearchParams(location.search).get("view") ?? "").split(",").map(Number).filter((n) => Number.isFinite(n));
    if (debugView.length !== 3) debugView.length = 0;
    // 디버그: ?follow=직원id,zoom 으로 그 직원을 따라간다
    const debugNoLabels = new URLSearchParams(location.search).get("labels") === "0";
    const debugFollow = (new URLSearchParams(location.search).get("follow") ?? "").split(",").filter(Boolean);
    const tmpTarget = new THREE.Vector3();
    const tmpCam = new THREE.Vector3();
    let raf = 0;
    let last = performance.now();
    const paint = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = snapRef.current;

      // 카메라: 가까이 + 자동 추적이면 초점으로 스르륵
      if (debugFollow.length >= 1) {
        const a = engine.agentById.get(debugFollow[0]);
        if (a) controls.target.set(a.x + 0.5, 0, a.y + 0.5);
        camera.zoom = Number(debugFollow[1]) || 6;
        camera.updateProjectionMatrix();
      } else if (debugView.length === 3) {
        controls.target.set(debugView[0], 0, debugView[1]);
        camera.zoom = debugView[2];
        camera.updateProjectionMatrix();
      } else if (zoomRef.current === "close" && followRef.current && focusRef.current) {
        tmpTarget.set(focusRef.current.x, 0, focusRef.current.z);
        controls.target.lerp(tmpTarget, 0.04);
        camera.zoom += (3.2 - camera.zoom) * 0.04;
        camera.updateProjectionMatrix();
      } else if (zoomRef.current === "fit") {
        controls.target.lerp(HOME, 0.05);
        camera.zoom += (fitZoom - camera.zoom) * 0.05;
        camera.updateProjectionMatrix();
      }
      // 카메라는 항상 같은 방향에서 목표점을 본다 (아이소메트릭 고정)
      tmpCam.copy(controls.target).addScaledVector(ISO_DIR, ISO_DIST);
      camera.position.copy(tmpCam);
      sky.scale.set(((camera.right - camera.left) / camera.zoom) * 1.02, ((camera.top - camera.bottom) / camera.zoom) * 1.02, 1);
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
        if (hot) floorMat.emissive.lerp(new THREE.Color(0x0a84ff).multiplyScalar(0.10 + Math.sin(now / 250) * 0.04), 0.2);
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
        av.group.position.set(agent.x + 0.5 + agent.jitter, elevationAt(agent.x + 0.5, agent.y + 0.5), agent.y + 0.5);
        // 최단 각도로 회전
        let delta = agent.heading - av.group.rotation.y;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        av.group.rotation.y += delta * 0.18;
        const walking = agent.anim === "walk";
        const sitting = agent.anim === "sit" || agent.anim === "type";
        const swing = walking && !reduced ? Math.sin(av.t * 14) * 0.5 : 0;
        av.legL.rotation.x = swing;
        av.legR.rotation.x = -swing;
        // 업무 상자: 프로젝트·요청자가 기록에 있고 이동 중일 때만. 이름표는 위로 밀어 올린다
        const carrying = walking && Boolean(agent.project && agent.requester);
        av.box.visible = carrying;
        const lift = av.rig ? 0.25 : 0; // 모델 캐릭터는 캡슐보다 조금 커서 머리 위 요소를 올린다
        av.label.position.y = (carrying ? 2.05 : 1.55) + lift;
        av.marker.position.y = 1.62 + lift;
        if (carrying) {
          const key = `${agent.project}|${agent.requester}`;
          if (av.boxKey !== key) {
            av.boxKey = key;
            av.boxMat.color.set(PROJECT_COLOR[agent.project as string] ?? "#50d6ff");
            if (av.boxLabel) {
              av.box.remove(av.boxLabel);
              disposeSprite(av.boxLabel);
            }
            av.boxLabel = textSprite(agent.requester as string, { bg: "rgba(255,255,255,.96)", color: "#1a1f2b", size: 26, pad: 10 });
            av.boxLabel.scale.multiplyScalar(0.5);
            av.boxLabel.position.set(0, 0.02, 0.28);
            av.box.add(av.boxLabel);
          }
          av.box.position.y = 1.62 + lift + (!reduced ? Math.abs(Math.sin(av.t * 14)) * 0.04 : 0);
          av.box.rotation.y = -av.group.rotation.y * 0 + Math.sin(av.t * 2) * 0.05;
        }
        if (carrying) {
          // 두 팔을 위로 들어 상자를 받친다
          av.armL.rotation.x = -Math.PI * 0.92;
          av.armR.rotation.x = -Math.PI * 0.92;
        } else {
          av.armL.rotation.x = agent.anim === "type" && !reduced ? -0.9 + Math.sin(av.t * 18) * 0.15 : -swing * 0.6;
          av.armR.rotation.x = agent.anim === "type" && !reduced ? -0.9 - Math.sin(av.t * 18) * 0.15 : swing * 0.6;
        }
        av.body.position.y = (sitting ? 0.45 : 0.62) + (walking && !reduced ? Math.abs(Math.sin(av.t * 14)) * 0.05 : 0);
        av.head.position.y = (sitting ? 0.95 : 1.12) + (agent.anim === "talk" && !reduced ? Math.sin(av.t * 10) * 0.03 : 0);
        av.legL.visible = av.legR.visible = !sitting && !av.rig;
        // 모델 애니메이션: 걷기 / 상자 들고 걷기 / 앉기 / 대기
        if (av.rig) {
          playRig(av.rig, walking ? (carrying ? "Walk_Carry" : "Walk") : sitting ? "SitDown" : "Idle");
          if (!reduced) av.rig.mixer.update(dt);
          av.rig.mixer.timeScale = walking ? 1.15 : 1;
        }
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
        av.label.visible = !debugNoLabels;
        if (av.bubble) av.bubble.visible = !debugNoLabels;
        av.label.material.opacity = picked === agent.id ? 1 : 0.92;
        (av.label.material as THREE.SpriteMaterial).color.set(picked === agent.id ? 0xffd60a : 0xffffff);
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
              bg: agent.speechKind === "think" ? "rgba(240,238,255,.96)" : "rgba(255,255,255,.96)",
              color: agent.speechKind === "think" ? "#4b47c9" : "#1d1d1f",
              size: 24,
              border: agent.speechKind === "think" ? "#7d78ff" : "#0a84ff",
            });
            av.bubble.position.y = 2.15 + lift;
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
          pPos[i * 3 + 1] = reactorH + 1.2 + Math.sin(p.t * Math.PI) * 6;
          pPos[i * 3 + 2] = MIMIR_CENTER.y + 0.5 + (p.tz - MIMIR_CENTER.y - 0.5) * e;
          pCol[i * 3] = p.color.r;
          pCol[i * 3 + 1] = p.color.g;
          pCol[i * 3 + 2] = p.color.b;
        }
        pGeo.setDrawRange(0, particles.length);
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;
      }

      composer.render();
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      disposed = true;
      controls.dispose();
      composer.dispose();
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
        <div className="world-hint">드래그로 이동 · 휠로 확대 · 직원 클릭하면 프로필</div>
      </div>
    </div>
  );
}
