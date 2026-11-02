// 「組み立て直す」で Claude に渡す指示。
// 仮説を立てる段には手がかりだけを渡す（出典の URL は渡さない。URL に技の名前が入っていることがあるため）。
// 答え合わせの段には、答えと仮説を渡す。
import { cluesFor, type AnswerItem, type Clue, type Condition, type Technique } from "./material";
import { GRADE_PROCESS, PROPOSE_PROCESS, STEP_RANGE, TRIAL_RANGE, type Hypothesis } from "./tools";

const URL = /https?:\/\/\S+/g;

/** 手がかりを見出しごとにまとめて、番号・名前・本文だけを並べる */
function clueList(clues: Clue[]): string {
  const out: string[] = [];
  let section: string | null = null;
  for (const c of clues) {
    if (c.section !== section) {
      section = c.section;
      out.push(`\n### ${section}`);
    }
    out.push(`${c.id} ${c.title}\n${c.text.replace(URL, "").trim()}`);
  }
  return out.join("\n").trim();
}

export function hypothesisPrompt(t: Technique, c: Condition): string {
  const clues = cluesFor(t, c);
  const ids = clues.map((x) => x.id);
  const partial =
    c.sections === "all"
      ? "手がかりは、集めたものをすべて渡しています。"
      : "手がかりは、集めたもののうち一部（品物そのものと、使われている金属）だけを渡しています。時代と土地、そのころの道具、物理の事実などの手がかりは渡していません。";
  return `あなたは「継ぐ」の中で働く助手です。伝え手がいなくなるかもしれない伝統の金工の技を、職人のために組み立て直します。
ここで扱うのは「${t.hiddenName}」です。名前はわざと隠してあります。

## やること

下の手がかりだけを読んで、この品がどう作られたかを、作る順の工程として組み立て直してください。
${partial}

## 決まり

- 技の名前を書かないでください。名前を当てようともしないでください。品物の名前（鍔など）は、手がかりにある言葉なら使ってかまいません。
- 考えてよいのは、下の手がかりと、一般に知られている物理の事実（熱すると金属がやわらかくなる、など）だけです。
- ウェブで調べた、本で読んだ、とは書かないでください。あなたは調べることができません。
- どの工程にも、根拠にした手がかりの番号を clue_ids に書いてください。使えるのは ${ids.join("・") || "（なし）"} だけです。
- 手がかりからではなく、もともと知っていたことから出てきた工程は、basis を prior にして、clue_ids を空にしてください。
  手がかりの番号を挙げられるなら clues、挙げられないなら prior です。
  この試しでは、正直さのほうが、合っているように見えることより大事です。prior が多くても減点しません。
- 分からないこと（温度、時間、順番など）は、推し量って埋めずに uncertain に書いてください。推し量った工程は confidence を低くしてください。
- 工程は ${STEP_RANGE[0]}〜${STEP_RANGE[1]} 個。次に職人に小さく試してほしいことを ${TRIAL_RANGE[0]}〜${TRIAL_RANGE[1]} 個、trials に書いてください。
- 文は短く、やさしい日本語で。専門用語にはふつうの言葉を添えてください。Markdown の記号（** や # など）は使わないでください。
- 答えは ${PROPOSE_PROCESS.name} の道具を 1 回だけ呼んで出してください。文だけの返事は受け取れません。

## 手がかり

${clueList(clues)}
`;
}

export function hypothesisUserMessage(t: Technique, c: Condition): string {
  return `手がかり（${c.label}）から、「${t.hiddenName}」の作り方を作る順に組み立て直し、${PROPOSE_PROCESS.name} を 1 回だけ呼んでください。`;
}

function answerLine(a: AnswerItem): string {
  return `${a.id} ${a.title}\n${a.text.replace(URL, "").replace(/[ \t]+$/gm, "").trim()}`;
}

function hypothesisText(h: Hypothesis): string {
  return h.steps
    .map((s, i) => {
      const basis = s.basis === "clues" ? `手がかり ${s.clue_ids.join("・")}` : "もともとの知識から";
      return `${i + 1}. ${s.title}（${basis}）\n${s.detail}`;
    })
    .join("\n");
}

export function gradePrompt(t: Technique, h: Hypothesis): string {
  const by = (k: AnswerItem["kind"]) => t.answer.filter((a) => a.kind === k).map(answerLine).join("\n\n");
  return `あなたは「継ぐ」の中で働く採点の係です。伝統の金工の技「${t.name}（${t.reading}）」の作り方について、
名前を隠して手がかりだけから組み立てた仮説を、発表されている本当の工程と照らし合わせて採点します。

## 採点の決まり

- 仮説の工程すべてに、1 つずつ判定を付けてください（n は仮説の番号、1 から ${h.steps.length}）。
- match：本当の工程（A の番号）と、肝心の作業が同じ。道具が少しちがう（金づちと圧延機など）だけなら match。
- partial：向きは合っているが、肝心なところが欠けている、あいまい、または今のやり方（M の番号）にだけ当たる。
- miss：本当の工程に無い、またはちがう。miss なら answer_ids は空にしてください。
- 1 つの工程が本当の工程のいくつかにまたがるときは、answer_ids に全部書いてください。
- 本当の工程のうち、仮説のどの工程も match・partial で当たらなかったものを、missed に A の番号で挙げてください。
- きびしく、でも公平に。言葉がちがっても、していることが同じなら認めてください。長く書いてあるだけで点を上げないでください。
- 答えの中で「未確認」「食いちがい」とある所（つなぐ温度や仕組みなど）は、仮説が別の説をとっていても、それだけで miss にしないでください。
- 根拠（手がかりから / もともとの知識から）は、判定に入れないでください。数えるのは別にします。
- note と summary は短く、やさしい日本語で。Markdown の記号は使わないでください。
- 答えは ${GRADE_PROCESS.name} の道具を 1 回だけ呼んで出してください。

## 本当の工程（伝統のやり方）

${by("step")}

## 参考：今のやり方でちがうところ

${by("modern")}

## 参考：歴史

${by("history")}

## 採点する仮説

${hypothesisText(h)}

仮説のあらまし：${h.summary}
`;
}

export function gradeUserMessage(): string {
  return `この仮説を、本当の工程と照らし合わせて採点し、${GRADE_PROCESS.name} を 1 回だけ呼んでください。`;
}
