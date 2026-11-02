// 鋳造と鍛造の共通の工程（指輪の種類によらない所）。各工程に「詳しく」の細かい手順を付ける。
// 細かい手順と温度は process.ts（出典つき）から。形から出る数字（長さ・内径など）は呼ぶ側が渡す。画面に依存しない。
import type { Spec, Step } from "./howto";
import { ALLOY, BEZEL_DETAILS, CAST_DETAILS, FINISH_DETAILS, FORGE_DETAILS, PRONG_DETAILS, rangeC, type AlloyId, type Detail } from "./process";

/** 細かい手順のまとまりに、見出し（「焼成：」など）を付けてつなぐ */
const lead = (head: string, list: Detail[]): Detail[] => list.map((d) => ({ ...d, text: `${head}：${d.text}` }));

/** 地金ごとの温度の行（分からない地金は「使う地金の表を見る」） */
function alloySpecs(alloy: AlloyId | null, what: ("cast" | "flask" | "anneal" | "investment")[]): Spec[] {
  if (!alloy) return [{ label: "温度", value: "使う地金の表を見る" }];
  const a = ALLOY[alloy];
  return what.map((w) =>
    w === "cast"
      ? { label: "鋳込みの温度", value: rangeC(a.castC) }
      : w === "flask"
        ? { label: "フラスコの温度", value: rangeC(a.flaskC) }
        : w === "anneal"
          ? { label: "焼きなまし", value: rangeC(a.annealC) }
          : { label: "埋没材", value: a.investment === "gypsum" ? "石膏系" : "リン酸塩系" },
  );
}

export interface CastInput {
  modelSpecs: Spec[];
  /** 湯道を付ける所（言葉） */
  sprueAt: string;
  metalLabel: string;
  weightG: number;
  alloy: AlloyId | null;
  innerMm: number;
  gou: number;
}

/** 鋳造：原型 → 湯道 → 埋没・焼成 → 鋳込み → 型から出して洗う → 湯道を切る */
export function castSteps(o: CastInput): Step[] {
  return [
    { id: "model", title: "原型を作る", text: "3D データ（STL）から樹脂で 3D 印刷するか、ワックスを彫る。", specs: o.modelSpecs, watch: "地金が縮む分は、鋳造所の値で大きめに。", details: CAST_DETAILS.model },
    { id: "sprue", title: "湯道を付ける", text: "地金の通り道を、いちばん厚い所に付ける。", specs: [{ label: "付ける所", value: o.sprueAt }], watch: "細い所（爪の先など）には付けない。", details: CAST_DETAILS.sprue },
    {
      id: "invest",
      title: "埋没して、焼く",
      text: "原型をフラスコの中で埋没材に埋め、炉で焼いて原型を消す。",
      specs: alloySpecs(o.alloy, ["investment"]),
      details: [...lead("埋没", CAST_DETAILS.invest), ...lead("焼成", CAST_DETAILS.burnout)],
    },
    {
      id: "pour",
      title: "鋳込む",
      text: "地金を溶かして型に流しこむ。鋳造所に頼むときは、地金と重さを伝える。",
      specs: [{ label: "地金", value: `${o.metalLabel} ・ 約 ${o.weightG.toFixed(1)} g（湯道の分は別）` }, ...alloySpecs(o.alloy, ["cast", "flask"])],
      watch: "熱い地金と炉。保護めがねと、燃えにくい服で。",
      details: CAST_DETAILS.pour,
    },
    { id: "divest", title: "型から出し、洗う", text: "少し置いてから水に入れて型を崩し、酸洗いで黒い膜を落とす。", specs: [], details: [...lead("型から出す", CAST_DETAILS.divest), ...lead("酸洗い", CAST_DETAILS.clean)] },
    { id: "cut_sprue", title: "湯道を切り、整える", text: "湯道を切って跡を削り、内側を真円に、号を合わせる。", specs: [{ label: "内径", value: `${o.innerMm.toFixed(1)} mm（${o.gou} 号）` }], details: CAST_DETAILS.cut_sprue },
  ];
}

export interface ForgeInput {
  materialSpecs: Spec[];
  materialText: string;
  alloy: AlloyId | null;
  innerMm: number;
  gou: number;
}

/** 鍛造（板と線から）：材料 → 焼きなましてのばす → 切って丸める → ロウ付け → 芯金で整える */
export function forgeSteps(o: ForgeInput): Step[] {
  return [
    { id: "material", title: "材料を用意する", text: o.materialText, specs: o.materialSpecs, watch: "長さは（内径 ＋ 厚み）× 3.14。", details: FORGE_DETAILS.material },
    {
      id: "anneal",
      title: "焼きなまして、のばす",
      text: "地金をやわらかくしてから、圧延機や線引き板で寸法まで細く・薄くする。",
      specs: alloySpecs(o.alloy, ["anneal"]),
      watch: "3〜4 回のばしたら、また焼きなます。",
      details: [...lead("焼きなまし", FORGE_DETAILS.anneal), ...lead("のばす", FORGE_DETAILS.roll)],
    },
    { id: "bend", title: "切って、丸める", text: "計算した長さで切り、両端をまっすぐにして丸める。", specs: [], details: [...lead("切る", FORGE_DETAILS.cut), ...lead("丸める", FORGE_DETAILS.bend)] },
    { id: "solder", title: "ロウ付けで閉じる", text: "継ぎ目をぴったり合わせ、フラックスを塗ってロウ付けする。", specs: [], watch: "ロウはすき間を埋めない。", details: FORGE_DETAILS.solder },
    { id: "true", title: "芯金で丸く整える", text: "芯金にはめて叩き、真円にして号を合わせる。", specs: [{ label: "内径", value: `${o.innerMm.toFixed(1)} mm（${o.gou} 号）` }], details: FORGE_DETAILS.true },
  ];
}

/** 石を留める工程（爪留め・覆輪留め） */
export function settingStep(style: "prong" | "bezel", specs: Spec[], watch: string, coverMm?: number): Step {
  return style === "bezel"
    ? {
        id: "bezel",
        title: "石を入れて、覆輪を倒す",
        text: "壁の内側に座を彫り、石を入れて、向かい合う所から少しずつ壁を倒して包む。",
        specs: coverMm !== undefined ? [{ label: "壁がかかる高さ", value: `縁の上 約 ${coverMm.toFixed(2)} mm` }, ...specs] : specs,
        watch,
        details: BEZEL_DETAILS,
      }
    : { id: "prong", title: "座を彫って、石を留める", text: "爪の内側に石の縁が入る座を彫り、石を入れて、向かい合う爪を組にして倒す。", specs, watch, details: PRONG_DETAILS };
}

export function finishStep(specs: Spec[], text = "ヤスリの跡を消し、全体を磨く。"): Step {
  return { id: "finish", title: "仕上げ", text, specs, details: FINISH_DETAILS };
}
