// 作り方：組んだ指輪（この石・このデザイン）から、鋳造と手作りの 2 通りの工程を、計算した数字つきで出す。画面に依存しない。
//
// 数字は、形から計算したもの（腕の材料の長さ、爪の線材の太さと長さ、座を彫る位置 など）。
// 手順は宝飾の一般的な作り方の例で、作者（宝飾の彫金職人）が確かめて直す。温度や縮みの量のように、
// 形から出せず出典もない数字は書かない（鋳造所・職人の値を使う、と書く）。
import type { PlacedStone, RingDesign } from "../geometry/ring";
import { SHANK_SECTION_LABEL, reliefWords, shankSizeWords } from "../geometry/shank";
import { perimeter } from "../geometry/polygon";
import { tensionInsert } from "../rules/checks";
import { GUIDES, type Guides } from "../rules/guides";
import { SPRING_SHORT_TEXT, tensionSpring, type SpringMetalId } from "../rules/tension-calc";
import { howtoFor, type HowtoStep } from "../rules/howto-steps";
import { TSUCHIME_STYLE_LABEL, TSUCHIME_STYLE_NOTE, tsuchimeSpec, tsuchimeStyleOf, type RingFinish } from "../geometry/finish";
import { NUNOME_AROUND, NUNOME_FORM, NUNOME_LABEL, NUNOME_METAL_LABEL, NUNOME_NOTE, defaultNunome, nunomeLayout, nunomeMetal, nunomeOf } from "../geometry/nunome";
import { holdAdvice, HOLD_WORDS, holdSummary, isAdvised, setSummary, tensionHoldSet } from "../rules/tension-hold";
import type { AlloyId, Detail } from "./process";
import { castSteps, dropVDetails, finishStep, forgeSteps, settingStep } from "./steps";

export type Method = "cast" | "hand";

export interface Spec {
  label: string;
  value: string;
}

export interface Step {
  /** 工程の名前（詳しくの中身や道具を引くため） */
  id?: string;
  title: string;
  /** 1 行の説明 */
  text: string;
  specs: Spec[];
  /** 気をつける所（1 行、なければ空） */
  watch?: string;
  /** 「詳しく」の細かい手順（出典つき） */
  details?: Detail[];
  /** V 字の爪がある指輪か（記録から帳面を作るときに、V 字の爪の手順を出すか決める） */
  vProngs?: boolean;
  /** 出どころ（技の作り方の目安帳 ledger/technique-howto.json の工程から。札の下に小さく出す） */
  sources?: { label: string; url?: string }[];
  /** 職人がこの工程を読んで確かめた（だれが・いつ） */
  checkedBy?: string;
}

/** 技の作り方の目安帳の工程（題で引く）。出どころと、職人が確かめたことを、札に渡す形で */
function ledgerStep(tech: "tsuchime" | "milgrain" | "nunome", title: string): HowtoStep {
  const st = howtoFor(tech).steps.find((x) => x.title === title);
  if (!st) throw new Error(`作り方の目安帳に ${tech} の「${title}」がない`);
  return st;
}
const srcOf = (...steps: HowtoStep[]): Pick<Step, "sources" | "checkedBy"> => {
  const seen = new Set<string>();
  const sources = steps.flatMap((st) => st.sources).filter((x) => (seen.has(x.label) ? false : (seen.add(x.label), true))).map((x) => ({ label: x.label, ...(x.url ? { url: x.url } : {}) }));
  const checked = steps.map((st) => st.checkedBy).filter((x): x is string => !!x);
  return { sources, ...(checked.length ? { checkedBy: [...new Set(checked)].join("、") } : {}) };
};

/**
 * 布目象嵌の工程（作者の声 2026-11-07：象嵌を選んだら、どう作るのかが分かるように）。
 * 手順・道具・失敗しやすい所・出どころは、技の作り方の目安帳（ledger/technique-howto.json の nunome）のまま。指輪の数字（帯・線）は GUIDES.finish.nunome（仮）。
 * 伝統の布目象嵌は鉄の地で、最後に錆を出して止め、焼き付けて地を黒くする。鉄でない地金の指輪では、その工程は「代わりにどうするか」を書く（色金なら煮色、ほかは職人に聞く）
 */
function nunomeSteps(o: TradCtx): Step[] {
  const d = nunomeOf(o.finish) ?? defaultNunome();
  const metal = NUNOME_METAL_LABEL[nunomeMetal(d, o.goldBase)];
  const lay = nunomeLayout(d, o.circumferenceMm);
  const fill = NUNOME_FORM[d.pattern] === "fill";
  const foil = d.foilMm ?? GUIDES.inlay.foilMm;
  const around = NUNOME_AROUND.find((a) => a.v === (d.around ?? 1))?.label ?? "一周";
  const lengthMm = lay.u1 - lay.u0;
  const area = `${mm(d.widthMm, 1)} × ${mm(lengthMm, 1)}（帯の幅 × ${around}の長さ）`;
  const where = o.kind === "band" ? "指輪の外の面の真ん中" : "腕の外の真ん中";
  const transform = [d.rotateDeg ? `${d.rotateDeg}° 回す` : "", d.stretch && d.stretch !== 1 ? `腕に沿って ${d.stretch} 倍に伸ばす` : "", d.mirror ? "上下に裏返す" : "", d.offsetMm ? `${mm(d.offsetMm, 1)} ずらす` : ""].filter(Boolean).join("・");
  const patternWords = `${NUNOME_LABEL[d.pattern]}（くり返しの大きさ ${mm(d.scaleMm, 2)}${transform ? `・${transform}` : ""}）${d.border !== false ? "と両縁の線" : ""}`;
  const prep = ledgerStep("nunome", "地鉄をみがき、下絵を描く");
  const cut = ledgerStep("nunome", "布目を切る");
  const set = ledgerStep("nunome", "金銀を打ちこむ（入嵌）");
  const close = ledgerStep("nunome", "叩きしめ、布目を消す");
  const rust = ledgerStep("nunome", "錆を出し、錆を止める");
  const bake = ledgerStep("nunome", "焼き付けて仕上げる");
  return [
    {
      id: "nunome_prep",
      title: "象嵌の下ごしらえ（みがく・図案を写す）",
      text: `はめこむ所（${where}の帯）を、少しの水をのせたサンドペーパーでみがき、汚れを全部とる。和紙に描いた図案（この指輪では ${patternWords}）を、筆ではめこむ所へ写す。`,
      specs: [
        { label: "模様", value: `${patternWords}。${NUNOME_NOTE[d.pattern]}` },
        { label: "模様の範囲", value: `${area}・${where}（仮）` },
        { label: "道具", value: "サンドペーパー・水・和紙の図案・筆（肥後象嵌の工程）" },
      ],
      watch: prep.fail,
      ...srcOf(prep),
    },
    {
      id: "nunome_cut",
      title: "布目を切る",
      text: `${cut.text}この指輪では、模様の範囲 ${mm(d.widthMm, 1)} × ${mm(lengthMm, 1)}${fill ? `、平金の形の所` : `、線の太さ ${mm(d.lineMm, 2)} の線の所`}に切る。`,
      specs: [
        { label: "模様の範囲", value: area },
        { label: fill ? "平金の形" : "線の太さ", value: fill ? `${NUNOME_LABEL[d.pattern]}の四角（一辺 約 ${mm(d.pattern === "jiyu" ? d.scaleMm / 4 : d.scaleMm, 2)}）${d.border !== false ? `・縁の線 ${mm(d.lineMm, 2)}` : ""}` : mm(d.lineMm, 2) },
        { label: "布目", value: "京象嵌の例：1 mm 四方に 7〜8 本、縦横に" },
        { label: "道具", value: cut.tools ?? "布目切り鏨・金づち" },
      ],
      watch: cut.fail,
      ...srcOf(cut),
    },
    {
      id: "nunome",
      title: `${metal}を打ちこむ（入嵌）`,
      text: set.text,
      specs: [
        ...(fill
          ? [{ label: "平金", value: `${metal}の平金 厚み 約 ${mm(foil, 2)}（厚みは資料に無い。仮）・面積 約 ${lay.foilAreaMm2.toFixed(1)} mm²` }]
          : []),
        ...(!fill || d.border !== false
          ? [{ label: "線", value: `${metal} ø 約 ${mm(d.lineMm, 2)}（資料：${GUIDES.inlay.wireMinMm}〜${GUIDES.inlay.wireMaxMm} mm の線）・長さ 約 ${Math.ceil(lay.wireLengthMm)} mm（模様から計算）` }]
          : []),
        { label: "道具", value: set.tools ?? "鹿の角の槌" },
      ],
      watch: set.fail,
      ...srcOf(set),
    },
    {
      id: "nunome_close",
      title: "叩きしめ、布目を消す",
      text: close.text,
      specs: close.tools ? [{ label: "道具", value: close.tools }] : [],
      watch: close.fail,
      ...srcOf(close),
    },
    {
      id: "nunome_ground",
      title: "地を仕上げる（錆付け・焼き付けの代わり）",
      text:
        "伝統の布目象嵌は鉄の地で、ここで錆を出して止め（肥後象嵌：錆出しの液を塗って焼く → お茶の液で煮る）、焼き付けて地を黒くし、金銀を引き立てる（京象嵌は漆を 3〜4 回焼き付けて研ぎ出す。肥後象嵌は油を塗って焼き付ける）。" +
        (o.irogane
          ? `この指輪は${IROGANE_WORDS[o.irogane].name}なので、錆付けのかわりに、あとの煮色で地の色（${IROGANE_WORDS[o.irogane].color}）を出す。はめこんだ金・銀は色が変わらない。`
          : `この指輪の地金（${o.metalLabel}）は鉄ではないので、錆付け・焼き付けはしない。地をどう仕上げるか（みがく・いぶす など）は資料に無い（職人に聞く）。`),
      specs: [],
      watch: o.irogane ? "煮色の前に、脂をよく落とす（あとの工程）。" : "錆出しの液の中身・日数・回数は資料に無い（秘伝。職人に聞く）。",
      ...srcOf(rust, bake),
    },
  ];
}

/** 伝統の仕上げの工程に要る、指輪の値（石の指輪と、地金のみの指輪で同じ） */
export interface TradCtx {
  finish?: RingFinish;
  irogane?: Irogane;
  metalLabel: string;
  /** 槌目を打つ所のいちばん薄い厚み（mm） */
  thicknessMm: number;
  milgrain?: { count: number; beadMm: number } | null;
  /** 象嵌を入れる面の一周（mm） */
  circumferenceMm: number;
  /** 金の地金か（はめこむのは純銀） */
  goldBase: boolean;
  kind: "ring" | "band";
}

const mm = (v: number, d = 1) => `${v.toFixed(d)} mm`;

export interface HowToInput {
  ring: RingDesign;
  /** 石の縁の形（mm） */
  outlineMm: readonly { x: number; y: number }[];
  longMm: number;
  widthMm: number;
  depthMm: number;
  metalLabel: string;
  /** 温度を出す地金（分からなければ null か省く） */
  alloy?: AlloyId | null;
  /** テンションの計算に使う地金（K18 の色まで。なければ形の地金の値） */
  springMetal?: SpringMetalId;
  /** 煮色で色を出す色金（なければ、ふつうの地金） */
  irogane?: Irogane;
  /** 目安帳を当てはめた目安（外れにくさの落とす高さなど。なければ GUIDES） */
  guides?: Guides;
}

export type Irogane = "shakudo" | "shibuichi" | "copper";
/** 色金の名前と、煮色の色（辞典：ledger/techniques.json の mokume-irogane） */
export const IROGANE_WORDS: Record<Irogane, { name: string; color: string }> = {
  shakudo: { name: "赤銅", color: "ほとんど黒（うっすら青紫の艶）" },
  shibuichi: { name: "四分一", color: "銀灰" },
  copper: { name: "銅", color: "赤茶" },
};

/** 形から出す数字（どちらの作り方でも使う） */
export function measures(o: HowToInput) {
  const r = o.ring;
  const s = r.setting;
  const h = s.heights;
  const sh = r.shank;
  // 平たい線を丸めるときの長さ：（内径 ＋ 厚み）× π（厚みの真ん中の線の長さ）
  const shankLength = (sh.innerDiameterMm + sh.thicknessMm) * Math.PI;
  const girdleLen = perimeter(o.outlineMm as { x: number; y: number }[]);
  // 縁（ガードル）の下の高さ：石の一番下から下側（パビリオン）の高さ
  const girdleBottomZ = h.culetZ + h.pavilionMm;
  const prongWire = s.prongs.length
    ? {
        // 1 本ずつ太さを変えた爪があれば、いちばん太い線材で（細い爪は削る）
        diameter: Math.max(...s.prongs.map((p) => p.diameterMm)),
        count: s.prongs.reduce((n, p) => n + p.legs, 0),
        // 石座の下の端から爪の先まで ＋ 先を整える分（線の太さ 1 本ぶん）
        length: Math.max(...s.prongs.map((p) => p.tipZ)) - h.baseZ + s.prongs[0].diameterMm,
        vCount: s.prongs.filter((p) => p.isV).length,
      }
    : null;
  return {
    shankLength,
    girdleLen,
    prongWire,
    // 爪の先から、座（石の縁が入る溝）までの深さ
    seatFromTip: h.tipZ !== null ? h.tipZ - girdleBottomZ : null,
    heightAboveFinger: h.heightAboveFingerMm,
    culetGap: r.culetGapMm,
    bezel: s.bezel ? { wall: s.bezel.wallMm, height: s.bezel.topZ - s.bezel.bottomZ, length: perimeter(s.bezel.innerOutline as { x: number; y: number }[]) } : null,
    galleryWire: s.rings[0]?.wireMm ?? null,
  };
}

export function howToMake(o: HowToInput, method0: Method): Step[] {
  // 色金は板と線から作る（鋳造の温度や型の資料がない。鋳造の工程は出さない）
  const method: Method = o.irogane ? "hand" : method0;
  const steps = withTraditional((o.ring.stones?.length ?? 1) > 1 ? multiSteps(o, method) : soloSteps(o, method), o);
  // V 字の爪の手順は、V 字の爪のある指輪にだけ出す（ない爪の話が細かい手順に残っていた）
  const settings = o.ring.stones?.length ? o.ring.stones.map((st) => st.setting) : [o.ring.setting];
  const hasV = settings.some((st) => st.prongs.some((p) => p.isV));
  const list = hasV ? steps.map((s) => (s.id === "prong" ? { ...s, vProngs: true } : s)) : steps.map((s) => (s.details ? { ...s, details: dropVDetails(s.details) } : s));
  return settings.some((st) => st.prongTip === "oni") ? list.map(oniStep) : list;
}

/**
 * 伝統の仕上げの工程を、作り方に足す（槌目・ミル打ち・布目象嵌・煮色）。手順と数字は ledger/technique-howto.json と techniques.json から。
 * 順（**仮**。職人に聞く）：腕を丸めたら槌目を打つ → 石座を付ける → ミル打ち・象嵌 → みがく → 煮色（脱脂 → 大根おろし → 煮る）→ 石を留める。
 * 石は煮色のあとに留める（煮る液と熱に石を入れない）。槌目の面は、ヤスリや紙ヤスリで跡を消さない
 */
function withTraditional(steps: Step[], o: HowToInput): Step[] {
  const sh = o.ring.shank;
  return withTraditionalCtx(steps, {
    finish: o.ring.params.finish,
    irogane: o.irogane,
    metalLabel: o.metalLabel,
    thicknessMm: sh.minThicknessMm ?? sh.thicknessMm,
    milgrain: o.ring.milgrain ? { count: o.ring.milgrain.count, beadMm: o.ring.milgrain.beadMm } : null,
    circumferenceMm: 2 * Math.PI * sh.outerRadiusMm,
    goldBase: o.metalLabel.startsWith("K18"),
    kind: "ring",
  });
}

/** 伝統の仕上げの工程を足す（石の指輪と、地金のみの指輪で同じ）。地金のみの指輪には石座がないので、象嵌とミルは仕上げの前 */
export function withTraditionalCtx(steps: Step[], o: TradCtx): Step[] {
  const f = o.finish;
  const ir = o.irogane;
  if (!f && !ir) return steps;
  const out = [...steps];
  const at = (id: string) => out.findIndex((x) => x.id === id);
  // 色金の焼きなまし：銅は資料の温度。赤銅・四分一は資料に無い
  if (ir) {
    const i = at("anneal");
    if (i >= 0)
      out[i] = {
        ...out[i],
        specs: [
          ir === "copper"
            ? { label: "温度", value: "500〜600 ℃（暗い赤・小豆色になるまで。表面技術の学会誌の記事）" }
            : { label: "温度", value: `${IROGANE_WORDS[ir].name}の焼きなましの温度は資料に無い（職人に聞く）` },
          { label: "冷まし方", value: "ゆっくり冷ます。水で急に冷やすと曲がる（石川工房）" },
        ],
      };
  }
  // 槌目：腕を丸めて芯金で整えたあと（鋳造なら鋳込んだあと）、石座を付ける前に
  if (f?.tsuchime) {
    const t = tsuchimeSpec(f.tsuchime);
    const style = tsuchimeStyleOf(f.tsuchime);
    const where = f.tsuchime.area === "all" ? "腕の外の面と横の面" : "腕の外の面";
    // 鎚の選び方は目安帳（tsuchime-hammer-kind：ならし鎚・いも鎚・荒らし鎚）。縦槌目の鎚の名前は資料に無い
    const how: Record<typeof style, string> = {
      maru: `腕を芯金にはめ、丸みのあるいも鎚で、${where}に丸い跡を、半分ほど重ねながらむらなく並べて打つ。`,
      kaku: `腕を芯金にはめ、面をみがいたならし鎚（平らな面）を少し傾けて当て、${where}に平らな小さな面を並べて打つ。`,
      tate: `腕を芯金にはめ、細長い面の鎚で、${where}に腕に沿った細長い跡を、少しずつずらして並べて打つ（鎚の名前と形は職人に聞く）。`,
      arashi: `面を荒らした荒らし鎚で、${where}を細かく密に打つ。荒らし鎚は焼きが入っているので、芯金や金床の上では使わない（当て方は職人に聞く）。`,
    };
    const size = style === "arashi" ? "細かく密に（大きさは選ばない）" : f.tsuchime.size === "small" ? "小さい槌：細かな輝き" : f.tsuchime.size === "large" ? "大きい槌：荒々しい表情" : "中くらいの槌";
    const pick = ledgerStep("tsuchime", "金づちと当て金を選ぶ");
    const even = ledgerStep("tsuchime", "そろえて打つ");
    const step: Step = {
      id: "tsuchime",
      title: `槌目を打つ（${TSUCHIME_STYLE_LABEL[style]}）`,
      text: `${how[style]}指に当たる内側は打たない。`,
      specs: [
        { label: "種類", value: TSUCHIME_STYLE_NOTE[style] },
        { label: "跡の大きさ", value: `${style === "tate" ? `幅 約 ${mm(t.markMm)} × 長さ 約 ${mm(t.lengthMm)}` : `約 ${mm(t.markMm)}`}（${size}。大きさは仮の目安）` },
        { label: "跡の深さ", value: `約 ${mm(t.depthMm, 2)}（仮）・打ったあとの${o.kind === "band" ? "厚み" : "腕の厚み"} 約 ${mm(o.thicknessMm - t.depthMm, 2)}` },
      ],
      watch: "打つたびに形がゆがむので、ゆがみを取りながら、跡の大きさと深さをそろえる。材や厚みが変わったら、先に見本を打って確かめる。硬くなったら焼きなます。",
      ...srcOf(pick, even),
    };
    const i = Math.max(at("true"), at("cut_sprue"));
    const seat = out.findIndex((x) => x.id === "prong" || x.id === "bezel");
    out.splice(i >= 0 ? i + 1 : seat >= 0 ? seat : out.length - 1, 0, step);
  }
  // ミル打ち・象嵌・煮色は、みがき（仕上げ）と石留めのまわり
  const extra: Step[] = [];
  if (f?.milgrain) {
    const mg = o.milgrain;
    const d = mg?.beadMm ?? GUIDES.finish.milgrain.beadMm;
    extra.push({
      id: "milgrain",
      title: "ミルを打つ",
      text: "腕の外の面の両縁に、粒の幅の細い縁を残す。基準の 1 粒を打ち、毛彫り鏨で縁と平行な溝を同じ深さで彫る。その溝に合わせて、ミル鏨を一粒ずつ押しこむ（粒は縁の地金を押し上げてでき、半分ほど縁に埋まる）。",
      specs: [
        { label: "粒", value: `ø ${mm(d, 2)}（手打ちの鏨は 0.25〜0.75 mm。大きさは仮の目安）` },
        { label: "間かく", value: `${mm(d, 2)}（となりと離さず、重ねず）` },
        ...(mg?.count ? [{ label: "粒の数", value: `${mg.count} 粒（片側 約 ${Math.round(mg.count / 2)} 粒。3D データに入っている）` }] : []),
      ],
      watch: "鏨をすべらせない（えぐれた縁は直せない）。何粒か打つたびにルーペで、列がまっすぐか、粒がそろっているかを見る。",
      ...srcOf(ledgerStep("milgrain", "縁に溝を彫る"), ledgerStep("milgrain", "一粒ずつ打つ")),
    });
  }
  if (f?.inlay) extra.push(...nunomeSteps(o));
  const fin = at("finish");
  if (fin >= 0 && f?.tsuchime) out[fin] = { ...out[fin], watch: [out[fin].watch, "槌目の面は、ヤスリや紙ヤスリをかけない（跡が消える）。"].filter(Boolean).join(" ") };
  const niiro: Step[] = ir
    ? [
        {
          id: "degrease",
          title: "脂を落とす（脱脂）",
          text: "みがいたら、重曹や洗剤で、油（脂）をきれいに落とす（大学の研究室の方法でも、みがいたあと重曹で脱脂する）。",
          specs: [{ label: "地金", value: `${IROGANE_WORDS[ir].name}（煮色で${IROGANE_WORDS[ir].color}になる）` }],
          watch: "脂が残ると、色がむらになる。石川工房：きれいに落とさないとダメ。",
        },
        {
          id: "daikon",
          title: "大根おろしの汁にひたす",
          text: "すりおろした大根の汁に、10 分ほどひたしてから、煮色の液へ（大学の研究室の方法。石川工房も同じ）。",
          specs: [],
          watch: "大根おろしは、煮色が「かぶる」（むらになる）のを防ぐ、とされる。",
        },
        {
          id: "niiro",
          title: "煮色で色を出す",
          text: "緑青と硫酸銅（と明礬）を水にとかした液で煮る。煮たら水でよく洗い、ふいて乾かす。",
          specs: [
            { label: "色", value: `${IROGANE_WORDS[ir].name} → ${IROGANE_WORDS[ir].color}${f?.inlay ? "（はめこんだ金・銀は色が変わらない）" : ""}` },
            { label: "液の例", value: "水 1 L に緑青 3.3 g・硫酸銅 3.3 g・明礬 0.25 g、90 ℃で 60 分（大学の研究室の方法）" },
          ],
          watch: "配合と時間は資料で食いちがう。見本で確かめ、職人に聞く。煮色の面はみがかない。",
        },
      ]
    : [];
  // 石留め（爪・覆輪）の前に、ミル・象嵌 → みがき → 煮色 を置く（色金でなければ、ミル・象嵌は仕上げの前）
  const seat = out.findIndex((x) => x.id === "prong" || x.id === "bezel" || x.id === "tension_set");
  if (ir && seat >= 0 && fin > seat) {
    const finish = out.splice(at("finish"), 1)[0];
    const s2 = out.findIndex((x) => x.id === "prong" || x.id === "bezel" || x.id === "tension_set");
    const seatStep = out[s2];
    out.splice(s2, 1, ...extra, { ...finish, title: "みがく", text: finish.text.replace("全体を磨く", "全体を磨く（煮色の前）") }, ...niiro, { ...seatStep, watch: [seatStep.watch, "石は煮色のあとに留める（煮る液と熱に石を入れない。仮の順・職人に聞く）。煮色の面を傷つけないよう、道具の当たる所を守る。"].filter(Boolean).join(" ") });
  } else {
    // 象嵌は叩いて打ちこむので石を留める前に。ミルは石留めのあと、仕上げの前（日本の作り手の例）
    const inlay = extra.filter((x) => x.id?.startsWith("nunome"));
    const mil = extra.filter((x) => x.id === "milgrain");
    const si = out.findIndex((x) => x.id === "prong" || x.id === "bezel" || x.id === "tension_set");
    // 石座のない指輪（地金のみ）は、仕上げ（みがく）の前
    const fiIn = at("finish");
    if (inlay.length) out.splice(si >= 0 ? si : fiIn >= 0 ? fiIn : out.length, 0, ...inlay);
    const fi = at("finish");
    out.splice(fi >= 0 ? fi : out.length, 0, ...mil);
    if (niiro.length) out.push(...niiro);
  }
  return out;
}

/** 尖り爪の言い方（作り方の中の「先を丸くする」を、尖らせる言い方に）。数字は足さない */
const ONI_WORDS = "尖り爪（先が尖り、石の上に少しかかる形）";
function oniStep(s: Step): Step {
  if (s.id !== "prong" && s.id !== "finish") return s;
  return {
    ...s,
    text: s.text.replace("爪の先を丸め", `爪の先を${ONI_WORDS}に整え`),
    details: s.details?.map((d) => (d.text.startsWith("爪を切りそろえ、先をヤスリで丸くして") ? { ...d, text: `爪を切りそろえ、先をヤスリで${ONI_WORDS}に尖らせる。尖り具合は職人が決める。` } : d)),
  };
}

/** 石の場所の言葉（腕のいちばん上から、腕に沿って） */
export function placeText(st: Pick<PlacedStone, "atMm">): string {
  if (Math.abs(st.atMm) < 0.005) return "腕のいちばん上";
  return `腕のいちばん上から、腕に沿って ${st.atMm > 0 ? "右" : "左"}へ ${mm(Math.abs(st.atMm), 2)}`;
}

/**
 * 石を並べた指輪：石ごとに、一粒と同じ石座の作り方をくり返す（石座を組む・腕に付ける・石を留める）。
 * 腕と仕上げは 1 回。石の番号は 3D・確かめと同じ（石 1 ＝ 真ん中の石）
 */
function multiSteps(o: HowToInput, method: Method): Step[] {
  const r = o.ring;
  const one = (st: PlacedStone): Step[] =>
    soloSteps({ ...o, ring: { ...r, setting: st.setting, culetGapMm: st.culetGapMm, solder: st.solder ? { ...st.solder, triangles: { start: 0, count: 0 } } : null, notchDepthMm: 0 }, outlineMm: st.params.outlineMm, longMm: st.params.longMm, widthMm: st.params.widthMm, depthMm: st.params.depthMm }, method);
  const per = r.stones.map((st, i) => ({ st, i, steps: one(st) }));
  const base = per[0].steps;
  const name = (i: number, t: string) => `${t}（石 ${i + 1}）`;
  const tag = (i: number, st: PlacedStone, x: Step): Step => ({ ...x, title: name(i, x.title), specs: [{ label: "場所", value: placeText(st) }, ...x.specs] });
  const layout: Step = {
    id: "layout",
    title: "石の並びを腕に写す",
    text: `腕の外側に、石の真ん中の位置を ${r.stones.length} か所、ケガキで印をつける（腕のいちばん上から、腕に沿って測る）。`,
    specs: r.stones.map((st, i) => ({ label: `石 ${i + 1}`, value: `${st.params.longMm.toFixed(2)} mm ・ ${placeText(st)}` })),
    watch: "石座は腕に直角に立てる（腕の丸みに沿って、石の向きが少しずつ外へ開く）。",
  };
  const zaguri = r.notchDepthMm > 0 ? [{ label: "ザグり", value: `石ごとに、石の先の真下 ・ いちばん深い所 ${mm(r.notchDepthMm, 2)}（3D データに入っている）` }] : [];
  if (method === "cast") {
    // 原型（3D データ）に石座がぜんぶ入っているので、型と鋳造は 1 回。石留めだけ石ごとに
    // 石留めは、最後の「仕上げ」の前（castSteps のあと）
    const seatIdx = base.length - 2;
    const head = base.slice(0, seatIdx);
    const tail = base.slice(seatIdx + 1);
    const model = head.map((x, k) => (k === 0 ? { ...x, specs: [...x.specs, ...layout.specs, ...zaguri] } : x));
    const seats = per.map(({ st, i, steps }) => tag(i, st, steps[seatIdx]));
    return [...model, ...seats, ...tail];
  }
  // 手作り：材料と腕は 1 回、石座を組む・付ける・留めるは石ごと
  const idx = (id: string) => base.findIndex((x) => x.id === id);
  const iHead = idx("head") >= 0 ? idx("head") : idx("bezel_make");
  const iAttach = idx("attach");
  const before = base.slice(0, iHead);
  const finish = base[base.length - 1];
  const heads = per.map(({ st, i, steps }) => tag(i, st, steps[iHead]));
  const attaches = per.map(({ st, i, steps }) => tag(i, st, steps[iAttach]));
  const seats = per.map(({ st, i, steps }) => tag(i, st, steps[iAttach + 1]));
  return [...before, ...heads, layout, ...attaches, ...seats, finish];
}

/**
 * 腕の間に挟む石座の、形から出す数字（職人 石川の言葉 2026-11-04 の作り方）。
 * 腕を切る長さ：腕の厚みの真ん中の線で測った、両端の間の弧。下の輪の板：厚み × 高さ（いちばん高い所。下は指の丸みに合わせて削る）× 長さ（板の厚みの真ん中の線の周）。
 * 上の輪の丸線：太さ × 長さ（線の中心の周）。ザグりの深さ：線の太さ × 目安の割合
 */
export function betweenMeasures(r: RingDesign) {
  const c = r.setting.collar;
  const ends = r.shank.ends;
  if (!c || !ends) return null;
  const sh = r.shank;
  const rm = sh.innerRadiusMm + sh.thicknessMm / 2;
  const y = (Math.abs(ends[0].y) + Math.abs(ends[1].y)) / 2;
  const cutArc = 2 * rm * Math.asin(Math.min(1, y / rm));
  const mid = c.outer.map((q, i) => ({ x: (q.x + c.inner[i].x) / 2, y: (q.y + c.inner[i].y) / 2 }));
  const sheetLength = perimeter(mid);
  const sheetHeight = c.topZ - c.bottomZ;
  const upper = r.setting.upperRail;
  const wire = upper ? 2 * upper.radiusMm : 0;
  const wireLength = upper ? perimeter(upper.pts.map(([x, yy]) => ({ x, y: yy }))) : 0;
  return {
    bandLength: (sh.innerDiameterMm + sh.thicknessMm) * Math.PI - cutArc,
    cutArc,
    cutChord: 2 * y,
    sheet: { thickness: c.wallMm, height: sheetHeight, length: sheetLength, lowest: c.heightMm },
    upperWire: { diameter: wire, length: wireLength },
    seatDepth: wire * GUIDES.join.between.seatDepthRatio,
  };
}

/**
 * テンション（挟む）の作り方（職人 石川の言葉 2026-11-05 ＋ 資料 docs/RESEARCH-tension.md の 5 節）。
 * 数字は形から計算した物と職人の値、それと地金ごとの大まかな計算（src/rules/tension-calc.ts。画面の表と同じ値）。
 * 硬さや、最後にどこまで詰めるかは、資料にもよい数字がないので「職人が決める」
 */
function tensionSteps(o: HowToInput, method: Method): Step[] {
  const r = o.ring;
  const sh = r.shank;
  const info = r.setting.tension!;
  const line = `${SHANK_SECTION_LABEL[sh.section]} ${sh.section === "maru" ? `ø ${mm(sh.widthMm)}` : sh.along ? shankSizeWords(sh, 2) : `${mm(sh.widthMm)} × ${mm(sh.thicknessMm)}`}`;
  const head: Spec[] = [
    { label: "石", value: `${o.longMm.toFixed(2)} × ${o.widthMm.toFixed(2)} × ${o.depthMm.toFixed(2)} mm` },
    { label: "号", value: `${sh.gou} 号（内径 ${mm(sh.innerDiameterMm)}）` },
  ];
  // 深さの出どころ：三角の短い辺を溝に（side）で職人の値のままなら職人の値。ほかの既定は、戻りきらない分を見込んだおすすめ（仮。作者 2026-11-07 が前の 0.8・0.5 を外した）
  const t = (o.guides ?? GUIDES).tension;
  const craftDepth = (e: (typeof info.ends)[number]) => info.grip === "side" && Math.abs(e.depthMm - (e.kind === "pit" ? t.shortSidePitMm : t.shortSideGrooveMm)) < 1e-6;
  const springMetalId = (o.springMetal ?? sh.metal) as SpringMetalId;
  const sm = (o.guides ?? GUIDES).tension.spring.metals[springMetalId in (o.guides ?? GUIDES).tension.spring.metals ? springMetalId : "k18y"];
  const advice = holdAdvice(tensionSpring(r.setting, sh, "hardened", o.guides ?? GUIDES)!, info.ends, { youngGpa: sm.young.gpa, proofMpa: sm.hardened.proofMpa, densityGPerCm3: (o.guides ?? GUIDES).metals[sh.metal].densityGPerCm3 }, o.guides ?? GUIDES, r.metalWeightG);
  const depthFrom = (e: (typeof info.ends)[number]) => (craftDepth(e) ? "職人の値" : isAdvised(info.ends, advice) ? "戻りきらない分を見込んだおすすめ・仮" : "選んだ深さ");
  const endSpecs: Spec[] = info.ends.map((e) =>
    e.kind === "pit"
      ? { label: "角のくぼみ", value: `石の角の先を ${mm(e.depthMm, 2)} 入れる（底まで ${mm(e.floorMm, 2)}。${depthFrom(e)}）` }
      : { label: "辺の溝", value: `石の辺を ${mm(e.depthMm, 2)} 入れる（底まで ${mm(e.floorMm, 2)}。${e.straight ? "腕の幅いっぱいに抜けてよい。" : "石の丸みに沿う。"}${depthFrom(e)}）` },
  );
  const gap: Spec = { label: "図面の開き", value: `${mm(info.gapMm, 2)}（石が入る寸法。腕の周りの向きの石の長さ ${mm(info.spanMm, 2)} − 両はしの深さ）` };
  // 地金ごとの大まかな計算（画面の表と同じ値。硬い状態のとき）。合否にしない
  const spring = tensionSpring(r.setting, sh)!;
  const row = spring.rows.find((x) => x.metal === (o.springMetal ?? sh.metal))!;
  const kari = row.provisional ? "・仮" : "";
  const insert = tensionInsert(info);
  const closeSpecs: Spec[] =
    row.shrinkMm !== null
      ? [
          { label: "縮める量", value: `図面の開きより、いちばん 約 ${row.shrinkMm.toFixed(2)} mm まで狭く作れる（${row.verdict === "room" ? `${HOLD_WORDS.safe}。` : ""}${row.name}・硬い状態の大まかな計算${kari}。${HOLD_WORDS.limit} 約 ${row.shrinkMaxMm!.toFixed(2)} mm。そこまで広げると、戻りきらない分 約 ${row.setMm!.toFixed(2)} mm が残る見込み。最後は職人が決める）` },
          { label: HOLD_WORDS.make, value: `いちばん狭くて 約 ${row.makeGapMm!.toFixed(2)} mm（同じ計算${kari}）` },
        ]
      : [{ label: "縮める量", value: `${row.name}は、この腕のままでは開ききらない見込み（限界 約 ${row.limitMm.toFixed(2)} mm、要る量 ${spring.needMm.toFixed(2)} mm。大まかな計算${kari}）。地金ごとに腕の太さ・形を変えて組み直す。${SPRING_SHORT_TEXT}` }];
  // 外れにくさ（浅く留めたいとき。src/rules/tension-hold.ts）：選んだ深さで、石を留めるのに縮める量と、答え
  const hold = tensionHoldSet(spring, r.metalWeightG, row.metal, row.metal, o.guides ?? GUIDES);
  const depthWords = info.ends.map((e) => `${e.kind === "pit" ? "くぼみ" : "溝"} ${mm(e.depthMm, 2)}`).join("・");
  const holdSpecs: Spec[] = [
    // 広げたあと戻りきらない分（仮。作者の声 2026-11-07）を見込んだ作り方
    ...(row.shrinkMm !== null ? [{ label: HOLD_WORDS.makeWithSet, value: `この深さで石を留めるなら：${setSummary(hold.now)}。大まかな計算・仮。最後は職人が決める` }] : []),
    { label: "深さ", value: `${depthWords}（和 ${mm(hold.now.depthSumMm, 2)}）` },
    { label: "外れにくさ（目安・仮）", value: `${holdSummary(hold.now, row.name)}${hold.atAppSqueeze ? `。上の縮める量なら、求める分の 約 ${hold.atAppSqueeze.margin.toFixed(2)} 倍` : ""}。最後は職人が決める` },
  ];
  const close: Step = {
    id: "tension_close",
    title: "開きを縮める",
    text: "地金を硬くしながら、腕の開きを図面の開きより少し狭く縮める（プリロード＝石を押さえる力の分）。図面の開きには入れない。",
    specs: [gap, ...closeSpecs, ...holdSpecs],
    watch: "硬くなったあとに曲げすぎると割れやすい（資料の声）。",
  };
  const set: Step = {
    id: "tension_set",
    title: "石を入れる",
    text: `${insert.how}。${insert.hold}。開け方（心金・くさびなど）は職人が決める。`,
    specs: [
      ...endSpecs,
      ...(row.spreadMm !== null
        ? [{ label: HOLD_WORDS.spread, value: `約 ${row.spreadMm.toFixed(2)} mm（作る時の開きから石が通る ${mm(spring.spanMm, 2)} まで。${HOLD_WORDS.spreadLimit} 約 ${row.limitMm.toFixed(2)} mm。大まかな計算${kari}。最後は職人が決める）` }]
        : []),
      ...(row.slideShrinkMm !== null ? [{ label: "横から滑らせるとき", value: `開くのは締まりの分だけ。小さめに作れる量は 約 ${row.slideShrinkMm.toFixed(2)} mm まで（大まかな計算${kari}。作者の考えで、まだ試していない）` }] : []),
      { label: "石と指のすき間", value: mm(r.culetGapMm, 2) },
    ],
    watch: "火を使わない（熱で地金がやわらかくなると、ばねが消える。資料の声）。欠けやすい石は、職人が向くかを確かめる。",
  };
  const finish = finishStep([{ label: "地金", value: `${o.metalLabel} ・ 約 ${r.metalWeightG.toFixed(1)} g` }], "ヤスリの跡を消し、全体を磨く。");
  const lift: Spec[] = info.liftMm > 0 ? [{ label: "両はしの持ち上げ", value: `指の丸みから ${mm(info.liftMm, 2)}（石の先が指に当たらないように。仮の目安）` }] : [];
  if (method === "cast") {
    return [
      ...castSteps({
        modelSpecs: [...head, { label: "腕", value: line }, gap, ...lift, ...endSpecs],
        sprueAt: "腕の下（開きの反対側）",
        metalLabel: o.metalLabel,
        weightG: r.metalWeightG,
        alloy: o.alloy ?? null,
        innerMm: sh.innerDiameterMm,
        gou: sh.gou,
      }),
      {
        id: "harden",
        title: "硬くする",
        text: "鋳造のままでは、地金が硬い状態にならない。硬い状態でないと、石が取れる（職人の言葉）。硬くする方法は職人が決める。",
        specs: [{ label: "硬さ", value: "職人が決める（形からは確かめられない）" }],
        watch: "資料には、熱で硬くする合金の例がある（特許の文）。使う地金で試してから。",
      },
      close,
      set,
      finish,
    ];
  }
  return [
    {
      id: "material",
      title: "丸線を用意する",
      text: "腕の丸線を、切り口を整える分を足して切る。腕の両はしはロウ付けしないので、継ぎ目はない。",
      specs: [...head, { label: "腕の線", value: `${line} ・ 長さ 約 ${mm(info.wireLengthMm)}（真ん中の線）` }],
    },
    {
      id: "bend",
      title: "輪に曲げる",
      text: "芯金で輪に曲げる。両はしは閉じず、石が入る開きを残す。",
      specs: [{ label: "内径", value: `${mm(sh.innerDiameterMm)}（${sh.gou} 号）` }, gap, ...lift],
    },
    {
      id: "harden",
      title: "叩いて硬くする",
      text: "叩く・打つなどで、地金を硬い状態にする（加工硬化）。硬い状態でないと、石が取れる（職人の言葉）。K18・Pt900・シルバーでもできなくはない（職人の言葉）。",
      specs: [{ label: "硬さ", value: "職人が決める（形からは確かめられない）" }],
      watch: "このあと火を入れない。焼きなましの温度まで熱すると、やわらかくなる（資料の声）。",
    },
    {
      id: "tension_cut",
      title: "溝とくぼみを切る",
      text: `${info.mode === "corner-edge" ? "片方の端に角の先が入るくぼみを、もう片方の端に辺が入る溝を切る" : info.mode === "corner-corner" ? "両方の端に、角の先が入るくぼみを切る" : "両方の端に、石の縁が入る溝を切る"}。石を当てて確かめながら。溝の高さは、石の縁（ガードル）の厚みに合わせる。`,
      specs: [...endSpecs, { label: "石とのすき間", value: `${mm(info.clearanceMm, 2)}（仮の目安）` }],
      watch: "資料には、硬くする前に溝を切る例もある。順は職人が決める。",
    },
    close,
    set,
    finish,
  ];
}

function soloSteps(o: HowToInput, method: Method): Step[] {
  const r = o.ring;
  if (r.setting.tension) return tensionSteps(o, method);
  const bm = betweenMeasures(r);
  const m = measures(o);
  const sh = r.shank;
  const s = r.setting;
  const head: Spec[] = [
    { label: "石", value: `${o.longMm.toFixed(2)} × ${o.widthMm.toFixed(2)} × ${o.depthMm.toFixed(2)} mm` },
    { label: "号", value: `${sh.gou} 号（内径 ${mm(sh.innerDiameterMm)}）` },
  ];
  const settingSpecs: Spec[] =
    s.style === "bezel" && m.bezel
      ? [
          { label: "覆輪の壁", value: `厚み ${mm(m.bezel.wall, 2)} ・ 高さ ${mm(m.bezel.height)}` },
          { label: "帯の長さ", value: `約 ${mm(m.bezel.length)}（内側の周）` },
        ]
      : m.prongWire
        ? [
            { label: "爪", value: `${s.prongs.length} か所${m.prongWire.vCount ? `（うち V 字 ${m.prongWire.vCount}）` : ""}${s.prongTip === "oni" ? " ・ 尖り爪" : ""}${s.prongs.some((p) => p.look) ? " ・ 手で形を直した爪あり（図面と 3D を見る）" : ""}` },
            { label: "爪の線材", value: `ø ${mm(m.prongWire.diameter, 2)} × ${m.prongWire.count} 本 ・ 1 本 約 ${mm(m.prongWire.length)}` },
          ]
        : [];
  const seat = settingStep(
    s.style === "bezel" ? "bezel" : "prong",
    s.style === "bezel"
      ? []
      : [...(m.seatFromTip !== null ? [{ label: "座の位置", value: `爪の先から 約 ${mm(m.seatFromTip, 2)} 下` }] : []), { label: "石と指のすき間", value: mm(m.culetGap, 2) }],
    s.style === "bezel" ? "一か所から倒さず、向かい合う所を交互に。" : m.prongWire && m.prongWire.vCount ? "V 字の爪は、角の先が金属に当たらないよう逃がす。" : "爪は向かい合う 2 本ずつ倒す。",
    s.bezel?.coverMm,
  );
  const finish = finishStep([{ label: "地金", value: `${o.metalLabel} ・ 約 ${r.metalWeightG.toFixed(1)} g` }], "爪の先を丸め、ヤスリの跡を消して、全体を磨く。");
  const alloy = o.alloy ?? null;

  if (method === "cast") {
    return [
      ...castSteps({
        modelSpecs: [
          ...head,
          { label: "腕", value: `${SHANK_SECTION_LABEL[sh.section]} ・ ${sh.along ? shankSizeWords(sh, 2) : `幅 ${mm(sh.widthMm)} × 厚み ${mm(sh.thicknessMm)}`}` },
          ...(reliefWords(sh) ? [{ label: "腕の彫り", value: `${reliefWords(sh)}（3D データに入っている。形の案。仕上げは職人が決める）` }] : []),
          ...(r.notchDepthMm > 0 ? [{ label: "ザグり", value: `腕の上 深さ ${mm(r.notchDepthMm, 2)}・丸いくぼみ 直径 約 ${mm(r.shank.notchBallDiameterMm, 1)}（3D データに入っている）` }] : []),
          ...(bm
            ? [
                { label: "石座の座", value: `腕のいちばん上を ${mm(bm.cutChord, 2)} 切り、腕の両はしの間に下の輪をはさむ形（3D データに入っている）` },
                { label: "下の輪", value: `板を丸めた輪 ・ 厚み ${mm(bm.sheet.thickness, 2)} ・ 高さ ${mm(bm.sheet.lowest, 2)}（いちばん低い所。仮の目安）` },
              ]
            : r.solder
              ? [{ label: "石座の座", value: `腕の上に、下の輪の形の溝 深さ ${mm(r.shank.railSeatDepthMm, 2)}（3D データに入っている。ロウの丸みは原型に入れない）` }]
              : []),
          ...settingSpecs,
        ],
        sprueAt: "腕の下（石座の反対側）",
        metalLabel: o.metalLabel,
        weightG: r.metalWeightG,
        alloy,
        innerMm: sh.innerDiameterMm,
        gou: sh.gou,
      }),
      seat,
      finish,
    ];
  }
  if (bm) return betweenHandSteps(o, bm, head, settingSpecs, seat, finish);
  return [
    ...forgeSteps({
      materialText: "腕の線と、石座の材料を用意する。",
      materialSpecs: [
        ...head,
        { label: "腕の線", value: `${SHANK_SECTION_LABEL[sh.section]} ${sh.along ? shankSizeWords(sh, 2) : `${mm(sh.widthMm)} × ${mm(sh.thicknessMm)}`} ・ 長さ 約 ${mm(m.shankLength)}` },
        ...settingSpecs,
        ...(m.galleryWire && s.style !== "bezel" ? [{ label: "支えの輪", value: `ø ${mm(m.galleryWire, 2)} ・ 長さ 約 ${mm(m.girdleLen)}（石の縁の周）` }] : []),
      ],
      alloy,
      innerMm: sh.innerDiameterMm,
      gou: sh.gou,
    }),
    s.style === "bezel"
      ? { id: "bezel_make", title: "覆輪を作る", text: "帯を石の縁に沿わせて輪にし、ロウ付けする。", specs: settingSpecs, watch: "石を当てて、すき間がないか確かめる。" }
      : { id: "head", title: "石座を組む", text: "支えの輪に爪の線を立て、ロウ付けする。", specs: settingSpecs, watch: m.prongWire?.vCount ? "V 字の爪は、石の尖った角に合わせて置く。" : "爪は石の周りに均等に。" },
    {
      id: "attach",
      title: "石座を腕に付ける",
      // 石の先が腕に入りこむときは、形の方でもうザグってある（geometry/notch.ts、球のビット）。
      // 石座の下の輪が腕を横切る所は、腕の上を輪の形に合わせて削り（座）、両側の接点にロウを流す（geometry/joint.ts）
      text: attachText(r),
      specs: [
        { label: "指から石座の上まで", value: mm(m.heightAboveFinger, 2) },
        { label: "石と指のすき間", value: mm(m.culetGap, 2) },
        ...(r.notchDepthMm > 0 ? [{ label: "ザグり", value: `深さ ${mm(r.notchDepthMm, 2)}・丸いビット 直径 約 ${mm(r.shank.notchBallDiameterMm, 1)}（石とのすき間 ${mm(GUIDES.bezel.clearanceMm, 2)} を含む）` }] : []),
        ...(r.solder ? [{ label: "石座の座", value: `腕の上に、下の輪の形の溝 深さ ${mm(r.shank.railSeatDepthMm, 2)}（${r.solder.contacts} か所）` }, { label: "ロウ付け", value: `接点 ${r.solder.contacts} か所・すみの丸み 約 ${mm(r.solder.filletMm, 2)}（仮の目安）` }] : []),
      ],
    },
    seat,
    finish,
  ];
}

/**
 * 「石座を腕に付ける」の文。どこを、どう付けるか：
 * 石の先が腕に入りこむときは、先に丸いビットでザグる。下の輪が腕を横切る所は、腕の上を輪の丸みに合わせてヤスリで削り、
 * 石座がぐらつかずに座るようにする。両側の接点に小さなロウを置いて流す
 */
function attachText(r: RingDesign): string {
  const zaguri = r.notchDepthMm > 0 ? `石の先が当たる所は、丸いビット（直径 約 ${mm(r.shank.notchBallDiameterMm, 1)}）を真上から下ろして、腕の上を深さ ${mm(r.notchDepthMm, 2)} ザグる。` : "";
  if (!r.solder) return `${zaguri}腕のいちばん上に石座をのせ、ロウ付けする。`;
  const where = r.solder.contacts === 2 ? "石座の下の輪が腕を横切る 2 か所（腕に沿って前と後ろ）" : "石座の下の輪が腕にのる所";
  return `${zaguri}${where}は、腕の上を輪の丸みに合わせてヤスリで削り（深さ ${mm(r.shank.railSeatDepthMm, 2)}）、石座がぐらつかずに座るようにする。両側の接点に小さなロウを置いて流す（すみに小さな丸みが入るくらい。ロウは見えないくらい少し）。`;
}


/**
 * 手作り・腕の間に挟む石座（職人 石川の言葉 2026-11-04）：石座と腕は別に作る。腕のいちばん上を切り、
 * 板を丸めた下の輪を腕の両はしの間にはさんでロウ付けする。上の輪は丸線で、石の座をリューターでザグる
 */
function betweenHandSteps(o: HowToInput, bm: NonNullable<ReturnType<typeof betweenMeasures>>, head: Spec[], settingSpecs: Spec[], seat: Step, finish: Step): Step[] {
  const r = o.ring;
  const sh = r.shank;
  const m = measures(o);
  const sheet: Spec = { label: "下の輪の板", value: `厚み ${mm(bm.sheet.thickness, 2)} × 幅 ${mm(bm.sheet.height, 2)} × 長さ 約 ${mm(bm.sheet.length)}` };
  const wire: Spec = { label: "上の輪の丸線", value: `ø ${mm(bm.upperWire.diameter, 2)} ・ 長さ 約 ${mm(bm.upperWire.length)}（線の中心の周）` };
  return [
    ...forgeSteps({
      materialText: "腕の線と、石座の材料（下の輪の板・上の輪の丸線・爪の線）を用意する。",
      materialSpecs: [...head, { label: "腕の線", value: `${SHANK_SECTION_LABEL[sh.section]} ${sh.along ? shankSizeWords(sh, 2) : `${mm(sh.widthMm)} × ${mm(sh.thicknessMm)}`} ・ 長さ 約 ${mm(m.shankLength)}` }, sheet, wire, ...settingSpecs],
      alloy: o.alloy ?? null,
      innerMm: sh.innerDiameterMm,
      gou: sh.gou,
    }),
    {
      id: "cut_top",
      title: "腕の上を切る",
      text: `腕のいちばん上を、下の輪の外の幅だけ切り取る。切り口は、輪の外の丸みに合わせてヤスリで整える。`,
      specs: [
        { label: "切る幅", value: `${mm(bm.cutChord, 2)}（腕の真ん中で。腕の厚みの真ん中の線で 約 ${mm(bm.cutArc, 2)}）` },
        { label: "残る腕の長さ", value: `約 ${mm(bm.bandLength)}` },
      ],
      watch: "切りすぎると、腕の端が輪に届かない。少し長めに切って、輪を当てながら削る。",
    },
    {
      id: "collar",
      title: "下の輪を板から作る",
      text: "板を石の形に沿って丸め、継ぎ目をロウ付けして輪にする（断面が四角い短い筒）。下の面は、指の丸みに合わせてヤスリで削る。",
      specs: [sheet, { label: "高さ", value: `いちばん低い所 ${mm(bm.sheet.lowest, 2)}・いちばん高い所 ${mm(bm.sheet.height, 2)}（仮の目安）` }],
      watch: "継ぎ目は、腕の端が当たる所からずらす（ロウが 2 回流れないように）。",
    },
    {
      id: "attach",
      title: "下の輪を腕の間に挟んでロウ付けする",
      text: "腕の両はしの間に下の輪をはさみ、腕の端が輪の横にぴったり当たるようにして、両側にロウを流す。上にのせるのではなく、腕の間に入れる。",
      specs: [
        { label: "ロウ付け", value: `腕の端 ${r.solder?.contacts ?? 2} か所${r.solder ? `・すみの丸み 約 ${mm(r.solder.filletMm, 2)}（仮の目安）` : ""}` },
        { label: "指から石座の上まで", value: mm(m.heightAboveFinger, 2) },
      ],
      watch: "輪の下の面と腕の内側が、指の側でそろうように。",
    },
    {
      id: "head",
      title: "上の輪と爪をロウ付けする",
      text: "丸線を輪にして閉じ、下の輪の外に爪を立ててロウ付けし、爪の外から上の輪をロウ付けする（上の輪は石の縁の真下）。",
      specs: [wire, ...settingSpecs],
      watch: "爪は石の周りに均等に。上の輪は下の輪と平らに。",
    },
    {
      id: "bur_seat",
      title: "上の輪をリューターでザグる",
      text: "上の輪の内側の上を、リューターで石の下側の形に合わせて削り、石の縁が座る所を作る（丸線のままでは石が座らない）。",
      specs: [{ label: "ザグる深さ", value: `線の太さの約 ${Math.round(GUIDES.join.between.seatDepthRatio * 100)}%・約 ${mm(bm.seatDepth, 2)}（仮の目安）` }],
      watch: "石を当てて、縁がぐるりと同じ高さで座るか確かめる。",
    },
    seat,
    finish,
  ];
}
