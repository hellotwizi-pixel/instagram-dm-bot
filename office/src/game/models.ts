// Kenney Furniture Kit (CC0) 로더 — public/models/kenney/*.glb
// 키트 단위는 대략 1 = 2m 라서, 아바타(키 ≈ 1.35) 에 맞춰 1.9 배로 쓴다.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const KIT_SCALE = 1.9;

export const KIT_NAMES = [
  "desk",
  "chairDesk",
  "chairModernCushion",
  "loungeSofa",
  "tableCoffee",
  "tableCross",
  "pottedPlant",
  "plantSmall2",
  "cardboardBoxClosed",
  "computerScreen",
  "computerKeyboard",
  "laptop",
  "bookcaseOpen",
  "kitchenBar",
  "kitchenCoffeeMachine",
  "lampRoundFloor",
  "bench",
  "cabinetTelevision",
  "rugRectangle",
  "sideTable",
  "books",
  "coatRackStanding",
] as const;
export type KitName = (typeof KIT_NAMES)[number];

export type Kit = Map<KitName, { root: THREE.Group; size: THREE.Vector3; center: THREE.Vector3 }>;

const base = () => `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}models/kenney/`;

/** GLB 파일을 따로 못 올리는 호스팅(미리보기 등)용: models/kenney.json = { 이름: base64 } */
async function loadBundle(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${base().replace(/kenney\/$/, "")}kenney.json`);
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

/** 모델 전부 읽기. 개별 .glb 가 없으면 kenney.json 묶음을 시도하고, 그것도 없으면 null → 절차적 가구로 대체 */
export async function loadKit(): Promise<Kit | null> {
  const loader = new GLTFLoader();
  const kit: Kit = new Map();
  const probe = await fetch(`${base()}${KIT_NAMES[0]}.glb`, { method: "HEAD" }).then((r) => r.ok && (r.headers.get("content-type") ?? "").includes("model")).catch(() => false);
  const bundle = probe ? null : await loadBundle();
  if (!probe && !bundle) {
    console.warn("[office] Kenney 가구 키트 파일이 없어 절차적 가구로 대체합니다");
    return null;
  }
  try {
    await Promise.all(
      KIT_NAMES.map(async (name) => {
        const gltf = bundle ? await loader.parseAsync(b64ToBuffer(bundle[name]), "") : await loader.loadAsync(`${base()}${name}.glb`);
        const root = gltf.scene;
        root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            const m = o as THREE.Mesh;
            m.castShadow = true;
            m.receiveShadow = true;
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat && mat.isMeshStandardMaterial) {
              mat.roughness = Math.max(mat.roughness, 0.7);
              mat.metalness = Math.min(mat.metalness, 0.1);
            }
          }
        });
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        center.y = box.min.y;
        kit.set(name, { root, size, center });
      }),
    );
    return kit;
  } catch (err) {
    console.warn("[office] Kenney 가구 키트를 못 읽어 절차적 가구로 대체합니다", err);
    return null;
  }
}

/**
 * 모델 사본을 (x, z) 바닥 중심에 놓는다. 회전은 y축(라디안). scale 은 KIT_SCALE 배율에 곱한다.
 * fit 을 주면 그 가로·세로(월드 단위)에 맞춰 늘린다 (러그 등).
 */
export function place(
  parent: THREE.Object3D,
  kit: Kit,
  name: KitName,
  x: number,
  z: number,
  opts: { rotY?: number; scale?: number; y?: number; fit?: { w: number; d: number } } = {},
): THREE.Group {
  const entry = kit.get(name)!;
  const wrap = new THREE.Group();
  const inner = entry.root.clone(true);
  inner.position.set(-entry.center.x, -entry.center.y, -entry.center.z);
  const s = KIT_SCALE * (opts.scale ?? 1);
  if (opts.fit) wrap.scale.set(opts.fit.w / entry.size.x, s, opts.fit.d / entry.size.z);
  else wrap.scale.setScalar(s);
  wrap.add(inner);
  wrap.position.set(x, opts.y ?? 0, z);
  wrap.rotation.y = opts.rotY ?? 0;
  parent.add(wrap);
  return wrap;
}

/** 모델의 실제 높이 (월드 단위) */
export function heightOf(kit: Kit, name: KitName, scale = 1): number {
  return kit.get(name)!.size.y * KIT_SCALE * scale;
}
