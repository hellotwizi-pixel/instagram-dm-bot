// Quaternius Ultimate Animated Character Pack (CC0) — public/models/characters/*.glb
// 모델 키는 읽은 뒤 실제로 재서 아바타 키(1.35) 에 맞춘다.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Agent } from "./sim";


export const CHAR_NAMES = [
  "Casual_Male",
  "Casual_Female",
  "Casual2_Male",
  "Casual2_Female",
  "Casual3_Female",
  "Suit_Male",
  "Suit_Female",
  "Doctor_Male_Young",
  "Doctor_Female_Young",
  "Doctor_Male_Old",
  "Doctor_Female_Old",
  "Elf",
] as const;
export type CharName = (typeof CHAR_NAMES)[number];

export type CharSet = Map<CharName, { scene: THREE.Group; clips: THREE.AnimationClip[]; height: number }>;

/** 아바타 키 (월드 단위) — 캡슐 아바타와 같은 크기 */
export const AVATAR_HEIGHT = 1.45;

const base = () => `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}models/characters/`;

async function loadBundle(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${base().replace(/characters\/$/, "")}characters.json`);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, string>;
  } catch {
    return null;
  }
}

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** 캐릭터 전부 읽기. 없으면 null → 캡슐 아바타 유지 */
export async function loadCharacters(): Promise<CharSet | null> {
  const loader = new GLTFLoader();
  const set: CharSet = new Map();
  const probe = await fetch(`${base()}${CHAR_NAMES[0]}.glb`, { method: "HEAD" }).then((r) => r.ok && (r.headers.get("content-type") ?? "").includes("model")).catch(() => false);
  const bundle = probe ? null : await loadBundle();
  if (!probe && !bundle) {
    console.warn("[office] 캐릭터 모델이 없어 기본 아바타를 씁니다");
    return null;
  }
  try {
    await Promise.all(
      CHAR_NAMES.map(async (name) => {
        const gltf = bundle ? await loader.parseAsync(b64ToBuffer(bundle[name]), "") : await loader.loadAsync(`${base()}${name}.glb`);
        // 스킨 적용 후 실제 키를 재서 배율을 정한다 (메시 좌표와 뼈 좌표의 스케일이 다름)
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3();
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.SkinnedMesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false; // 스킨 메시는 바운딩이 T포즈 기준이라 잘못 컬링됨
          if (mesh.isSkinnedMesh) {
            mesh.skeleton.update();
            mesh.computeBoundingBox();
            box.union(mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
          } else box.expandByObject(mesh);
        });
        const height = Math.max(0.01, box.max.y - box.min.y);
        set.set(name, { scene: gltf.scene, clips: gltf.animations, height });
      }),
    );
    return set;
  } catch (err) {
    console.warn("[office] 캐릭터 모델을 못 읽어 기본 아바타를 씁니다", err);
    return null;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 직원별 모델 고르기: 대표·팀장·PM 은 정장, 관리동(법무·보안·AI-OS)은 흰 가운, 헤르메스 배달부는 엘프, 나머지는 캐주얼 */
export function pickCharacter(agent: Agent): CharName {
  const h = hash(agent.id);
  if (agent.rank === "ceo") return "Suit_Male";
  if (agent.deptId === "hermes") return h % 3 === 0 ? "Elf" : h % 2 ? "Suit_Male" : "Suit_Female";
  if (agent.rank === "lead") return h % 2 ? "Suit_Male" : "Suit_Female";
  if (["legal", "sec", "aios"].includes(agent.deptId)) {
    const docs: CharName[] = ["Doctor_Male_Young", "Doctor_Female_Young", "Doctor_Male_Old", "Doctor_Female_Old"];
    return docs[h % docs.length];
  }
  const casual: CharName[] = ["Casual_Male", "Casual_Female", "Casual2_Male", "Casual2_Female", "Casual3_Female"];
  return casual[h % casual.length];
}

export type Rig = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
};

/** 모델 사본을 만들고 셔츠·머리 색을 직원 색으로 입힌다 */
export function buildRig(set: CharSet, agent: Agent): Rig | null {
  const entry = set.get(pickCharacter(agent));
  if (!entry) return null;
  const root = cloneSkinned(entry.scene) as THREE.Group;
  root.scale.setScalar((AVATAR_HEIGHT / entry.height) * (agent.rank === "ceo" ? 1.08 : 1));
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = mat;
    mat.roughness = 0.85;
    mat.metalness = 0;
    // 원본 glTF 의 색은 거의 검정에 가깝게 저장돼 있어서, 이름별로 직원 색을 입힌다
    switch (mat.name) {
      case "Skin":
        mat.color.set(agent.skin);
        break;
      case "Face":
        mat.color.set("#fff6e8");
        break;
      case "Shirt":
      case "Clothes":
        mat.color.set(agent.shirt);
        break;
      case "Main": // 흰 가운
        mat.color.set("#e9ecf4");
        break;
      case "Black": // 정장 상의 · 가운 아래 바지
        mat.color.set(agent.rank === "ceo" ? "#2a2f45" : "#20232f");
        break;
      case "Details": // 넥타이·단추
      case "Gold":
        mat.color.set(agent.accent);
        break;
      case "Pants":
        mat.color.set("#2f3547");
        break;
      case "Belt":
      case "Brown":
        mat.color.set("#4a3626");
        break;
      case "Hair":
        mat.color.set(agent.hair);
        break;
      case "Hat":
        mat.color.set(agent.accent);
        break;
      default:
        break;
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const clip of entry.clips) {
    const action = mixer.clipAction(clip);
    if (clip.name === "SitDown" || clip.name === "PickUp") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[clip.name] = action;
  }
  // 직원마다 동작 시작점을 흩어 놓는다
  const idle = actions.Idle;
  if (idle) {
    idle.play();
    idle.time = (hash(agent.id) % 1000) / 1000 * idle.getClip().duration;
  }
  return { root, mixer, actions, current: "Idle" };
}

/** 동작 전환 (짧게 크로스페이드) */
export function playRig(rig: Rig, name: string, fade = 0.18) {
  if (rig.current === name) return;
  const next = rig.actions[name];
  if (!next) return;
  const prev = rig.actions[rig.current];
  next.reset();
  next.enabled = true;
  next.setEffectiveWeight(1);
  if (prev && prev !== next) {
    prev.crossFadeTo(next, fade, false);
    next.play();
  } else next.fadeIn(fade).play();
  rig.current = name;
}
