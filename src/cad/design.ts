// Claude が言葉から設計を作る道具 make_design。画面に依存しない。
import type { ClaudeTool } from "../claude/wire";
import { FORMS, type FormId } from "./forms";
import { newDesign, type Design } from "./model";
import { SECTION_PRESETS } from "./solid";
import { METALS, MOKUME_PALETTES, TECHNIQUES, type MetalId } from "./techniques";

/** 受け付ける範囲（明らかにおかしい値を通さないため。職人の目安ではない） */
export const BOUNDS = {
  gou: [3, 30],
  ringWidth: [1.5, 15],
  ringThick: [0.8, 4],
  plateSize: [10, 80],
  plateThick: [0.8, 6],
  layers: [2, 40],
  dotMm: [0.2, 1.2],
  motifMm: [3, 20],
  dentMm: [1, 5],
} as const;

const clamp = (k: keyof typeof BOUNDS, v: unknown, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
  return Math.min(BOUNDS[k][1], Math.max(BOUNDS[k][0], n));
};

export const MAKE_DESIGN: ClaudeTool = {
  name: "make_design",
  description:
    "言葉の希望から、金工・宝飾の設計（形・技法・地金・大きさ）を 1 つ作って画面に出す。必ず 1 回だけ呼ぶ。" +
    "数は mm。分からない値は、ふつうの大きさにする（指輪 12 号・幅 4〜6 mm・厚み 1.5〜1.8 mm、帯留め 25〜35 mm・厚み 2 mm ほど）。",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "作品の名前（例：木目金の梅の帯留め）。20 文字まで" },
      form: { type: "string", enum: FORMS.map((f) => f.id), description: FORMS.map((f) => `${f.id}＝${f.name}（${f.use}）`).join("、") },
      ring_section: { type: "string", enum: ["kouman", "hirauchi", "kamaboko"], description: "指輪の断面：kouman＝甲丸（外が丸い）、hirauchi＝平打ち（外が平ら）、kamaboko＝かまぼこ（ゆるい丸み）。指輪でなければ kouman" },
      technique: { type: "string", enum: TECHNIQUES.map((t) => t.id), description: TECHNIQUES.map((t) => `${t.id}＝${t.name}：${t.what}`).join(" ") },
      metal: { type: "string", enum: Object.keys(METALS), description: Object.entries(METALS).map(([k, m]) => `${k}＝${m.name}（${m.note}）`).join("、") + "。木目金のときは使わない（mokume_palette で決める）" },
      mokume_palette: { type: "integer", enum: MOKUME_PALETTES.map((_, i) => i), description: MOKUME_PALETTES.map((p, i) => `${i}＝${p.name}`).join("、") + "（木目金のときだけ意味がある）" },
      size_mm: { type: "number", description: "板もの：いちばん長い所（mm）。指輪：幅（mm）" },
      thickness_mm: { type: "number", description: "厚み（mm）" },
      ring_size_gou: { type: "number", description: "指輪の号（指輪でなければ 0）" },
      fineness: { type: "number", description: "技法の細かさ。木目金＝層の数、魚々子＝粒の大きさ（mm）、布目象嵌＝模様の大きさ（mm）、鎚目＝叩きの大きさ（mm）、磨き＝0" },
      reason: { type: "string", description: "そう決めた理由（1〜2 文、やさしい日本語）" },
    },
    required: ["name", "form", "ring_section", "technique", "metal", "mokume_palette", "size_mm", "thickness_mm", "ring_size_gou", "fineness", "reason"],
    additionalProperties: false,
  },
};

/** make_design の入力を、確かめて設計にする（範囲の外はおさめる） */
export function designFromTool(input: unknown, seed = 7): { ok: true; value: Design } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "入力の形が正しくありません" };
  const r = input as Record<string, unknown>;
  const form = FORMS.find((f) => f.id === r.form)?.id as FormId | undefined;
  const tech = TECHNIQUES.find((t) => t.id === r.technique)?.id;
  if (!form) return { ok: false, error: `form は ${FORMS.map((f) => f.id).join(" / ")} のどれかです` };
  if (!tech) return { ok: false, error: `technique は ${TECHNIQUES.map((t) => t.id).join(" / ")} のどれかです` };
  let d: Design;
  if (form === "ring") {
    const w = clamp("ringWidth", r.size_mm, 5);
    const t = clamp("ringThick", r.thickness_mm, 1.6);
    const sec = (["kouman", "hirauchi", "kamaboko"] as const).find((k) => k === r.ring_section) ?? "kouman";
    d = newDesign("ring");
    d.gou = Math.round(clamp("gou", r.ring_size_gou, 12));
    d.top = SECTION_PRESETS[sec](w, t);
    d.bottom = SECTION_PRESETS[sec](Math.max(1.5, w * 0.8), Math.max(0.8, t * 0.9));
  } else {
    d = newDesign(form, clamp("plateSize", r.size_mm, 30), clamp("plateThick", r.thickness_mm, 2));
  }
  d.tech = tech;
  d.metal = (Object.keys(METALS) as MetalId[]).includes(r.metal as MetalId) ? (r.metal as MetalId) : TECHNIQUES.find((t) => t.id === tech)!.metals[0];
  d.palette = typeof r.mokume_palette === "number" && MOKUME_PALETTES[r.mokume_palette] ? r.mokume_palette : 0;
  d.tp.seed = seed;
  const f = r.fineness;
  if (typeof f === "number" && f > 0) {
    if (tech === "mokume") d.tp.layers = Math.round(clamp("layers", f, d.tp.layers));
    if (tech === "nanako") {
      d.tp.dotMm = clamp("dotMm", f, d.tp.dotMm);
      d.tp.pitchMm = Math.max(d.tp.dotMm * 1.25, d.tp.pitchMm);
    }
    if (tech === "nunome") d.tp.motifMm = clamp("motifMm", f, d.tp.motifMm);
    if (tech === "tsuchime") d.tp.dentMm = clamp("dentMm", f, d.tp.dentMm);
  }
  d.name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 24) : "";
  d.reason = typeof r.reason === "string" ? r.reason.trim() : "";
  return { ok: true, value: d };
}

/** 生む。の指示 */
export function designPrompt(rulesText: string): string {
  return `あなたは「継ぐ」のかんたん CAD の中で、言葉の希望から、金工・宝飾の品の設計を 1 つ作る係です。
相手は職人、デザイナー、学ぶ人、お客さまです。make_design を 1 回だけ呼び、形・技法・地金・大きさを決めます。

## 決め方

- 希望に書かれたことを先に守ります（形、技法、色、大きさ、使い道）。書かれていないことは、その使い道でふつうの値にします。
- 技法は、その品と地金に合うものを選びます。木目金は色のちがう金属を重ねる技なので、地金ではなく重ねる金属の組（mokume_palette）で色を決めます。
- 魚々子は赤銅や金の地に打つことが多く、布目象嵌は鉄などの地に金や銀の線を打ち込みます。
- reason には、なぜその形・技法・大きさにしたかを、やさしい日本語で 1〜2 文書きます。
- 職人の決まり（下の帳面）に当たるときは、それに合わせ、reason で触れます。帳面にない数字の目安を作りません。
- Markdown の記号は使いません。

## 職人の帳面（いまある決まり）

${rulesText || "（まだありません）"}`;
}
