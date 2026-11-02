// 石のない指輪（甲丸・平打ち・かまぼこ）：形・作れるかの判定・作り方。画面に依存しない。
// 形は src/cad/solid.ts の、断面を回して作る指輪（上と下で断面を変えられる）を使う。
import { SECTION_PRESETS, meshVolume, ringSolid, type Section } from "../cad/solid";
import { GUIDES } from "../rules/guides";
import type { ClaudeTool } from "../claude/wire";
import type { Step } from "./howto";
import type { AlloyId } from "./process";
import { castSteps, finishStep, forgeSteps } from "./steps";

export type SectionKind = "kouman" | "hirauchi" | "kamaboko";
export const SECTION_LABEL: Record<SectionKind, string> = { kouman: "甲丸", hirauchi: "平打ち", kamaboko: "かまぼこ" };

export interface Band {
  gou: number;
  kind: SectionKind;
  /** 上（見える側）と下（手のひら側）の幅・厚み（mm） */
  top: { width: number; thickness: number };
  bottom: { width: number; thickness: number };
  /** 比重（g/cm³）と地金の名前 */
  density: number;
  metalLabel: string;
}

/** 号から内径（指輪の画面と同じ式：13.0 ＋（号 − 1）÷ 3） */
export function bandInnerDiameter(gou: number): number {
  return GUIDES.shank.innerDiameterBaseMm + (gou - 1) / GUIDES.shank.gouPerMm;
}

export function sections(b: Band): { top: Section; bottom: Section } {
  return { top: SECTION_PRESETS[b.kind](b.top.width, b.top.thickness), bottom: SECTION_PRESETS[b.kind](b.bottom.width, b.bottom.thickness) };
}

/** 形（三角形の並び、mm）と、重さの目安（g） */
export function bandMesh(b: Band): { positions: Float32Array; weightG: number } {
  const { top, bottom } = sections(b);
  const r = ringSolid({ innerDiameter: bandInnerDiameter(b.gou), top, bottom, blendDeg: 140, around: 192, across: 20 });
  const tris = new Float32Array(r.indices.length * 3);
  r.indices.forEach((v, i) => tris.set(r.positions.subarray(v * 3, v * 3 + 3), i * 3));
  return { positions: tris, weightG: (Math.abs(meshVolume(tris)) / 1000) * b.density };
}

export interface BandProblem {
  title: string;
  current: string;
  required: string;
  why: string;
  fix: { label: string; apply: (b: Band) => Band };
}

/** 作れるかの判定（目安） */
export function checkBand(b: Band): BandProblem[] {
  const g = GUIDES.band;
  const out: BandProblem[] = [];
  const thin = Math.min(b.top.thickness, b.bottom.thickness);
  if (thin < g.minThicknessMm) {
    out.push({
      title: "腕が薄い",
      current: `${thin.toFixed(2)} mm`,
      required: `${g.minThicknessMm} mm 以上`,
      why: "仕上げで最大 0.2 mm 削れる。薄い腕は曲がりやすく、やわらかい金ではとくに弱い。",
      fix: { label: "厚くする", apply: (x) => ({ ...x, top: { ...x.top, thickness: Math.max(x.top.thickness, g.minThicknessMm) }, bottom: { ...x.bottom, thickness: Math.max(x.bottom.thickness, g.minThicknessMm) } }) },
    });
  }
  const narrow = Math.min(b.top.width, b.bottom.width);
  if (narrow < g.minWidthMm) {
    out.push({
      title: "幅が細い",
      current: `${narrow.toFixed(2)} mm`,
      required: `${g.minWidthMm} mm 以上`,
      why: "細い腕は曲がって丸くなくなる。",
      fix: { label: "幅を広げる", apply: (x) => ({ ...x, top: { ...x.top, width: Math.max(x.top.width, g.minWidthMm) }, bottom: { ...x.bottom, width: Math.max(x.bottom.width, g.minWidthMm) } }) },
    });
  }
  return out;
}

const mm = (v: number, d = 1) => `${v.toFixed(d)} mm`;

/** 作り方（手作り・鋳造）。数字は形から計算した目安 */
export function bandHowTo(b: Band, method: "hand" | "cast", weightG: number, alloy?: AlloyId | null): Step[] {
  const id = bandInnerDiameter(b.gou);
  const t = Math.max(b.top.thickness, b.bottom.thickness);
  const w = Math.max(b.top.width, b.bottom.width);
  const length = (id + t) * Math.PI;
  const taper = b.top.width !== b.bottom.width || b.top.thickness !== b.bottom.thickness;
  const finish = finishStep([{ label: "地金", value: `${b.metalLabel} ・ 約 ${weightG.toFixed(1)} g` }], "角を整え、ヤスリの跡を消して、全体を磨く。");
  const shape: Step[] = taper
    ? [{ id: "shape", title: "形を整える", text: "手のひら側を細く・薄く削り、上から下へなめらかにつなぐ。", specs: [{ label: "上", value: `${b.top.width} × ${b.top.thickness} mm` }, { label: "下", value: `${b.bottom.width} × ${b.bottom.thickness} mm` }] }]
    : [];
  if (method === "cast") {
    return [
      ...castSteps({
        modelSpecs: [{ label: "号", value: `${b.gou} 号（内径 ${mm(id)}）` }, { label: "断面", value: `${SECTION_LABEL[b.kind]} ・ 上 ${b.top.width}×${b.top.thickness} ・ 下 ${b.bottom.width}×${b.bottom.thickness} mm` }],
        sprueAt: "腕の下（手のひら側）",
        metalLabel: b.metalLabel,
        weightG,
        alloy: alloy ?? null,
        innerMm: id,
        gou: b.gou,
      }),
      finish,
    ];
  }
  return [
    ...forgeSteps({
      materialText: taper ? "いちばん太い所の寸法の線を用意する。細くする所は、あとで削る。" : "断面の寸法の線を用意する。",
      materialSpecs: [
        { label: "号", value: `${b.gou} 号（内径 ${mm(id)}）` },
        { label: "線", value: `${SECTION_LABEL[b.kind] === "平打ち" ? "平角線" : "甲丸線か平角線"} ${mm(w)} × ${mm(t)}` },
        { label: "長さ", value: `約 ${mm(length)}` },
      ],
      alloy: alloy ?? null,
      innerMm: id,
      gou: b.gou,
    }),
    ...shape,
    finish,
  ];
}

// ---- Claude が言葉から石のない指輪を決める道具 ----

export const MAKE_BAND: ClaudeTool = {
  name: "make_band",
  description: "言葉の希望から、石のない指輪（甲丸・平打ち・かまぼこ）の断面と大きさを決めて、画面に出す。必ず 1 回だけ呼ぶ。数は mm。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      section: { type: "string", enum: ["kouman", "hirauchi", "kamaboko"], description: "kouman＝甲丸（外が丸い）、hirauchi＝平打ち（外が平ら）、kamaboko＝かまぼこ（ゆるい丸み）" },
      top_width_mm: { type: "number", description: "上（見える側）の幅（mm）" },
      top_thickness_mm: { type: "number", description: "上の厚み（mm）" },
      bottom_width_mm: { type: "number", description: "下（手のひら側）の幅（mm）。同じ太さなら上と同じ" },
      bottom_thickness_mm: { type: "number", description: "下の厚み（mm）" },
      gou: { type: "number", description: "号（分からなければ 12）" },
      metal: { type: "string", enum: ["k18yg", "pt900", "k18wg", "k18pg", "sv925"], description: "地金" },
      reason: { type: "string", description: "そう決めた理由（1〜2 文、やさしい日本語）" },
      cannot_do: { type: "string", description: "希望のうち、この道具では表せないこと（模様・彫り・石 など）。正直に短く。すべて表せたときは空の文字" },
    },
    required: ["section", "top_width_mm", "top_thickness_mm", "bottom_width_mm", "bottom_thickness_mm", "gou", "metal", "reason", "cannot_do"],
    additionalProperties: false,
  },
};

export interface BandDraft {
  kind: SectionKind;
  top: { width: number; thickness: number };
  bottom: { width: number; thickness: number };
  gou: number;
  metal: "k18yg" | "pt900" | "k18wg" | "k18pg" | "sv925";
  reason: string;
  cannotDo: string;
}

const inRange = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function parseBand(input: unknown): { ok: true; value: BandDraft } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "入力の形が正しくありません" };
  const r = input as Record<string, unknown>;
  const kind = (["kouman", "hirauchi", "kamaboko"] as const).find((k) => k === r.section);
  if (!kind) return { ok: false, error: "section は kouman / hirauchi / kamaboko のどれかです" };
  const metal = (["k18yg", "pt900", "k18wg", "k18pg", "sv925"] as const).find((m) => m === r.metal) ?? "k18yg";
  const tw = inRange(r.top_width_mm, 1, 15, 4);
  const tt = inRange(r.top_thickness_mm, 0.6, 4, 1.6);
  return {
    ok: true,
    value: {
      kind,
      top: { width: tw, thickness: tt },
      bottom: { width: inRange(r.bottom_width_mm, 1, 15, tw), thickness: inRange(r.bottom_thickness_mm, 0.6, 4, tt) },
      gou: Math.round(inRange(r.gou, 3, 30, 12)),
      metal,
      reason: typeof r.reason === "string" ? r.reason.trim() : "",
      cannotDo: typeof r.cannot_do === "string" ? r.cannot_do.trim() : "",
    },
  };
}

export function bandPrompt(): string {
  return `あなたは「継ぐ」の中で、言葉の希望から、石のない指輪（甲丸・平打ち・かまぼこ）を決める係です。make_band を 1 回だけ呼びます。
- 希望に書かれたこと（太さ・形・号・地金・使い方）を先に守り、書かれていないことは、ふつうの値にします（幅 3〜5 mm、厚み 1.5〜1.8 mm、12 号、K18 イエロー）。
- 華奢・細め・存在感・太め・手のひら側を細く、のような言い方は、幅と厚み、上と下の太さの差で表します。
- この道具で変えられるのは、断面の形と、上と下の幅・厚み、号、地金だけです。模様・彫り・石・ねじり などは表せないので、cannot_do に正直に書きます。表せなかったのに「ご希望どおり」とは書きません。
- 厚みや幅が細すぎて作りにくい値は選びません（いちばん厚い所 ${GUIDES.band.minThicknessMm} mm 以上、幅 ${GUIDES.band.minWidthMm} mm 以上が目安）。
- reason はやさしい日本語で 1〜2 文。Markdown の記号は使いません。`;
}
