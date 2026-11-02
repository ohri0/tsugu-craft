// 形：指輪（甲丸・平打ち）と、板もの（帯留め・ペンダント・鍔のような平らな形）。単位は mm、z が上。
// 面の模様をほんとうの大きさで貼るため、UV は mm で持つ（指輪は、外まわりの長さ × 幅）。
import * as THREE from "three";

export type FormId = "ring" | "circle" | "square" | "ume" | "hyotan";

export interface FormParams {
  /** 指輪：号（内まわりの長さ − 40 ＝ 号 の目安で、内径を出す） */
  gou: number;
  /** 指輪：幅・厚み（mm） */
  ringWidth: number;
  ringThick: number;
  /** 指輪：甲丸（外が丸い）か */
  rounded: boolean;
  /** 板：大きさ（いちばん長い所、mm）・厚み（mm） */
  plateSize: number;
  plateThick: number;
}

export const DEFAULT_FORM: FormParams = { gou: 12, ringWidth: 6, ringThick: 1.6, rounded: true, plateSize: 30, plateThick: 2 };

export const FORMS: { id: FormId; name: string; use: string }[] = [
  { id: "ring", name: "指輪", use: "平打ち・甲丸" },
  { id: "circle", name: "丸", use: "帯留め・ペンダント" },
  { id: "square", name: "角丸", use: "帯留め・鍔の地板" },
  { id: "ume", name: "梅", use: "帯留め・かんざし" },
  { id: "hyotan", name: "瓢箪", use: "根付・帯留め" },
];

/** 号から内径（mm）。日本の号は内まわり（mm）− 40 がおよその目安 */
export function innerDiameter(gou: number): number {
  return (gou + 40) / Math.PI;
}

/** 板の輪郭（中心 0,0、いちばん長い所が size） */
export function outline(id: Exclude<FormId, "ring">, size: number): THREE.Vector2[] {
  const n = 160;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 1;
    let x = 0;
    let y = 0;
    switch (id) {
      case "circle":
        x = Math.cos(a);
        y = Math.sin(a);
        break;
      case "square": {
        // 角の丸い四角（超楕円）
        const e = 4;
        x = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** (2 / e);
        y = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** (2 / e);
        break;
      }
      case "ume":
        // 5 枚の花びら：丸の上に、花びらごとの丸みを足す
        r = 0.78 + 0.22 * Math.abs(Math.cos((5 * a) / 2 + Math.PI / 2)) ** 0.6;
        x = r * Math.cos(a);
        y = r * Math.sin(a);
        break;
      case "hyotan": {
        // 大小 2 つの丸をつないだ形（上が小さい）
        const t = a;
        const big = { cy: -0.32, r: 0.62 };
        const small = { cy: 0.55, r: 0.42 };
        const dir = new THREE.Vector2(Math.cos(t), Math.sin(t));
        // 2 つの丸の和の輪郭を、中心からの光線で求める
        const hit = (c: { cy: number; r: number }) => {
          const b = -2 * dir.y * c.cy;
          const cc = c.cy * c.cy - c.r * c.r;
          const disc = b * b - 4 * cc;
          return disc < 0 ? 0 : (-b + Math.sqrt(disc)) / 2;
        };
        const rr = Math.max(hit(big), hit(small), 0.3);
        x = rr * dir.x;
        y = rr * dir.y;
        break;
      }
    }
    pts.push(new THREE.Vector2(x, y));
  }
  // いちばん長い所を size にそろえる
  const box = new THREE.Box2().setFromPoints(pts);
  const k = size / Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  return pts.map((p) => new THREE.Vector2((p.x - cx) * k, (p.y - cy) * k));
}

/** 板もの：輪郭を厚みの分だけ押し出し、ふちを丸める。表の UV は mm */
export function plateGeometry(id: Exclude<FormId, "ring">, f: FormParams): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline(id, f.plateSize));
  const bevel = Math.min(0.6, f.plateThick * 0.35);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: f.plateThick - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 64 });
  geo.translate(0, 0, bevel);
  geo.computeVertexNormals();
  return geo;
}

/** 指輪：断面（幅 × 厚み、甲丸なら外が丸い）を指の軸のまわりに回す。軸は x、いちばん下を z ＝ 0 に置く */
export function ringGeometry(f: FormParams): THREE.BufferGeometry {
  const rIn = innerDiameter(f.gou) / 2;
  const w = f.ringWidth;
  const t = f.ringThick;
  // 断面の点（幅の向き s：−w/2〜w/2、半径 r）を、内側 → 外側 → 内側 と一周
  const prof: { s: number; r: number }[] = [];
  const m = 24;
  for (let i = 0; i <= m; i++) {
    const s = -w / 2 + (w * i) / m;
    const q = (2 * s) / w;
    const bulge = f.rounded ? Math.sqrt(Math.max(0, 1 - q * q)) : 1;
    // 平打ちでも角はわずかに丸める
    const edge = f.rounded ? 0.35 : Math.min(1, (1 - Math.abs(q)) * 8);
    prof.push({ s, r: rIn + t * (edge + (1 - edge) * bulge) * (f.rounded ? 1 : 1) });
  }
  const outer = prof.map((p) => ({ s: p.s, r: f.rounded ? rIn + Math.max(t * 0.35, t * Math.sqrt(Math.max(0, 1 - ((2 * p.s) / w) ** 2))) : p.r }));
  const inner = [...outer].reverse().map((p) => ({ s: p.s, r: rIn }));
  const loop = [...outer, ...inner];
  const seg = 160;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rOut = rIn + t;
  const circ = 2 * Math.PI * rOut;
  // 断面にそった長さ（UV の v）
  const len: number[] = [0];
  for (let k = 1; k < loop.length; k++) len.push(len[k - 1] + Math.hypot(loop[k].s - loop[k - 1].s, loop[k].r - loop[k - 1].r));
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let k = 0; k < loop.length; k++) {
      const { s, r } = loop[k];
      pos.push(s, r * Math.sin(a), rOut - r * Math.cos(a));
      uv.push((i / seg) * circ, len[k]);
    }
  }
  const L = loop.length;
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < L - 1; k++) {
      const a = i * L + k;
      const b = (i + 1) * L + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 地金の体積（mm³）。重さの目安に使う */
export function volumeMm3(geo: THREE.BufferGeometry): number {
  const p = geo.getAttribute("position");
  const index = geo.getIndex();
  let v = 0;
  const tri = (a: number, b: number, c: number) => {
    const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a);
    const bx = p.getX(b), by = p.getY(b), bz = p.getZ(b);
    const cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  };
  if (index) for (let i = 0; i < index.count; i += 3) tri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  else for (let i = 0; i < p.count; i += 3) tri(i, i + 1, i + 2);
  return Math.abs(v);
}
