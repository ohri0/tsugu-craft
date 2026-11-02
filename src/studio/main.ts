// 継ぐ：デザインを、職人の判断で「作れる形」にする。
// 生む。  石の写真・デザインの絵・希望の言葉 → Claude が指輪を組み、職人の決まりで確かめ、直す（作業の記録が見える）。
// 整える。作れない所が赤く光り、誰のどの決まりかと、見た目への影響つきの直し方が出る。人も同じつまみで直せる。
// 渡す。  職人への指示書・原寸の型紙・3D データ。
// 帳面   職人が声で決まりを足すと、その場で確かめが変わる。
import "../app/app.css";
import "../cad/cad.css";
import "./studio.css";
import { findCorners } from "../geometry/corners";
import { measureOutline, type StoneOutline } from "../geometry/measure";
import { outlineIndexAtT } from "../geometry/setting";
import { nameShape } from "../geometry/shape";
import { runClaude, type LogEntry } from "../claude/loop";
import { designPrompt, keepPrompt } from "../claude/prompt";
import { TOOLS, type ProposeRuleInput, type ProposeRuleResult, type ToolHost, type Metal } from "../claude/tools";
import type { ClaudeContentBlockParam } from "../claude/wire";
import { instructionHtml } from "../pattern/instruction";
import { patternSvg } from "../pattern/sheet";
import { rulePlans } from "../ui/design";
import { loadPhoto } from "../ui/photo";
import { Viewer } from "../ui/viewer";
import { extractStone, type Extraction } from "../vision/extract";
import { activeRules, addRule, sourceLabel, type Rule } from "../rules/ledger";
import { askPassword, resetPassword } from "../app/password";
import { esc, store, today } from "../app/store";
import { bindVoice, canListen } from "../app/voice";
import { masterName } from "../app/master";
import { toStl } from "../cad/solid";
import { METAL_LABEL, RingSession, type Built } from "./session";

type Mode = "make" | "refine" | "hand";
const MODES: { id: Mode; word: string; sub: string }[] = [
  { id: "make", word: "生む。", sub: "石と絵と言葉から" },
  { id: "refine", word: "整える。", sub: "職人の決まりで確かめる" },
  { id: "hand", word: "渡す。", sub: "職人への指示書" },
];
const SAMPLE = { url: "stones/triangle.jpg", longMm: 8.88, depthMm: 4.24, label: "作者の石（淡い青の三角）" };

interface Stone {
  photo: ImageData;
  label: string;
  extraction: Extraction;
  measured: StoneOutline;
  longMm: number;
  depthMm: number;
  shapeName: string;
  cornerIdx: { index: number; angle: number }[];
}
let stone: Stone | null = null;
let sketch: { dataUrl: string; base64: string; media: "image/jpeg" | "image/png" } | null = null;
let session: RingSession | null = null;
let reason = "";
let undoClaude: (() => boolean) | null = null;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="cad dark studio">
  <div class="gl"></div>
  <header class="cad-top">
    <a class="brand" href="./"><span class="seal">継</span><span class="name">継ぐ</span></a>
    <nav class="modes">${MODES.map((m) => `<button type="button" data-mode="${m.id}">${m.word}</button>`).join("")}</nav>
    <button type="button" class="book-btn">帳面<i class="book-n"></i></button>
  </header>
  <div class="word"><h1></h1><p class="word-sub"></p><p class="word-name"></p></div>
  <ol class="worklog" hidden></ol>
  <dl class="specs"></dl>
  <div class="verdict-chip" hidden></div>

  <div class="make-bar studio-make">
    <div class="inputs">
      <label class="in-card stone-card"><canvas class="stone-thumb" width="120" height="120"></canvas><span><b>石の写真</b><small class="stone-sub">撮る・選ぶ</small></span><input type="file" accept="image/*" class="stone-file" hidden></label>
      <div class="in-card size-card"><label>長辺<input type="number" step="0.01" class="in-long" inputmode="decimal"> mm</label><label>深さ<input type="number" step="0.01" class="in-depth" inputmode="decimal"> mm</label></div>
      <label class="in-card sketch-card"><span class="sketch-thumb">絵</span><span><b>デザインの絵</b><small class="sketch-sub">なくてもよい</small></span><input type="file" accept="image/*" class="sketch-file" hidden></label>
    </div>
    <form class="prompt"><input type="text" class="wish" placeholder="希望（例：華奢に。毎日つける。石を大きく見せたい）" aria-label="希望"><button type="submit">生む</button></form>
    <p class="make-status"></p>
  </div>

  <aside class="refine-panel studio-refine" hidden></aside>
  <div class="hand-panel" hidden></div>
  <aside class="book-panel" hidden></aside>
</div>`;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

// ---- 3D ----
const viewer = new Viewer($(".gl"));
viewer.setDark(true);

// ---- 石を読む ----
async function loadStone(img: ImageData, label: string, longMm: number, depthMm: number) {
  const extraction = extractStone(img);
  const measured = measureOutline({ outlinePx: extraction.outlinePx, longMm });
  const corners = findCorners(measured.outlineMm);
  stone = {
    photo: img,
    label,
    extraction,
    measured,
    longMm,
    depthMm,
    shapeName: nameShape(measured.outlineMm, corners).name,
    cornerIdx: corners.map((c) => ({ index: outlineIndexAtT(measured.outlineMm, c.t), angle: Math.round(c.angleDeg) })),
  };
  $<HTMLInputElement>(".in-long").value = String(longMm);
  $<HTMLInputElement>(".in-depth").value = String(depthMm);
  $(".stone-sub").textContent = `${stone.shapeName}・${measured.longMm.toFixed(2)} × ${measured.widthMm.toFixed(2)} mm`;
  drawThumb();
  session = new RingSession(
    { outlineMm: measured.outlineMm, longMm: measured.longMm, widthMm: measured.widthMm, depthMm },
    () => store.ledger(),
    onBuilt,
    (view) => viewer.snapshotFrom(view).split(",")[1],
  );
  // 最初は、決まりごとから作った案（Claude なしでも形が出る）
  const plan = rulePlans(session.stone, corners)[0];
  session.state.style = plan.design.style;
  session.state.height = plan.design.height;
  reason = `${plan.name}：${plan.reason}（決まりごとから）`;
  session.build("最初の案");
}

function drawThumb() {
  if (!stone) return;
  const c = $<HTMLCanvasElement>(".stone-thumb");
  const g = c.getContext("2d")!;
  const p = stone.photo;
  const pts = stone.extraction.outlinePx;
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.75;
  const tmp = document.createElement("canvas");
  tmp.width = p.width;
  tmp.height = p.height;
  tmp.getContext("2d")!.putImageData(p, 0, 0);
  g.drawImage(tmp, cx - half, cy - half, half * 2, half * 2, 0, 0, c.width, c.height);
  g.strokeStyle = "#e9c46a";
  g.lineWidth = 2;
  g.beginPath();
  pts.forEach((q, i) => {
    const x = ((q.x - (cx - half)) / (half * 2)) * c.width;
    const y = ((q.y - (cy - half)) / (half * 2)) * c.height;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
  g.stroke();
}

async function loadSample() {
  const img = new Image();
  img.src = SAMPLE.url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  await loadStone(g.getImageData(0, 0, c.width, c.height), SAMPLE.label, SAMPLE.longMm, SAMPLE.depthMm);
}

$<HTMLInputElement>(".stone-file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const img = await loadPhoto(f);
    await loadStone(img, f.name, Number($<HTMLInputElement>(".in-long").value) || 8, Number($<HTMLInputElement>(".in-depth").value) || 4);
    $(".make-status").textContent = "石を読みました。長辺と深さをノギスの値にしてから「生む」を押してください。";
  } catch (err) {
    $(".make-status").textContent = `石が読めませんでした：${(err as Error).message}`;
  }
});
for (const sel of [".in-long", ".in-depth"]) {
  $<HTMLInputElement>(sel).addEventListener("change", () => {
    if (!stone) return;
    void loadStone(stone.photo, stone.label, Number($<HTMLInputElement>(".in-long").value) || stone.longMm, Number($<HTMLInputElement>(".in-depth").value) || stone.depthMm);
  });
}
$<HTMLInputElement>(".sketch-file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  sketch = { dataUrl, base64: dataUrl.split(",")[1], media: "image/jpeg" };
  $(".sketch-thumb").innerHTML = `<img alt="" src="${dataUrl}">`;
  $(".sketch-sub").textContent = "読み取ります";
});

// ---- 組めたら：3D・数字・赤い所 ----
function onBuilt(b: Built, _why: string) {
  if (!stone) return;
  viewer.setRing(b.ring, { color: stone.extraction.color, colorless: stone.extraction.colorless }, b.problems);
  const r = b.ring;
  const s = session!.state;
  const st = r.setting;
  const rows: [string, string][] = [
    ["石", `${stone.shapeName} ・ ${stone.measured.longMm.toFixed(2)} × ${stone.measured.widthMm.toFixed(2)} × ${stone.depthMm.toFixed(2)} mm`],
    ["留め方", st.style === "bezel" ? `覆輪 ・ 壁 ${st.bezel?.wallMm.toFixed(2)} mm` : `爪 ${st.prongs.length}（V 字 ${st.prongs.filter((p) => p.isV).length}）・ ø ${st.prongs[0]?.diameterMm.toFixed(2)} mm`],
    ["号 ・ 腕", `${s.gou} 号 ・ ${r.shank.widthMm.toFixed(1)} × ${r.shank.thicknessMm.toFixed(1)} mm`],
    ["石と指のすき間", `${r.culetGapMm.toFixed(2)} mm`],
    ["地金", `${METAL_LABEL[s.metal]} ・ 約 ${r.metalWeightG.toFixed(1)} g`],
  ];
  $(".specs").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  const n = b.problems.length;
  const chip = $(".verdict-chip");
  chip.hidden = false;
  chip.className = `verdict-chip ${n ? "ng" : "ok"}`;
  chip.textContent = n ? `作れない所 ${n}` : "職人の決まりの内側";
  $(".word-name").textContent = `${stone.shapeName}の一粒石の指輪`;
  if (!$(".refine-panel").hidden) renderRefine();
}

// ---- 場面 ----
function setMode(m: Mode) {
  const w = MODES.find((x) => x.id === m)!;
  $(".word h1").textContent = w.word;
  $(".word-sub").textContent = w.sub;
  document.querySelectorAll<HTMLButtonElement>(".modes button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.mode === m)));
  $(".make-bar").hidden = m !== "make";
  $(".refine-panel").hidden = m !== "refine";
  $(".hand-panel").hidden = m !== "hand";
  $(".cad").setAttribute("data-mode", m);
  viewer.setAutoRotate(m === "make");
  // スマホでは、下の板に隠れないよう品を上に寄せる
  viewer.setLift(window.innerWidth <= 760 ? (m === "hand" ? 0.1 : 0.16) : 0);
  if (m === "refine") renderRefine();
  if (m === "hand") renderHand();
}
document.querySelectorAll<HTMLButtonElement>(".modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode as Mode)));

// ---- 生む。：Claude が組んで、確かめて、直す ----
const TOOL_WORD: Record<string, string> = { set_setting: "石座", set_shank: "腕", check: "確かめ", look: "見る" };
function logLine(e: LogEntry) {
  const ol = $(".worklog");
  ol.hidden = false;
  const li = document.createElement("li");
  if (e.kind === "note") {
    li.className = "note";
    li.textContent = e.text.replace(/\*\*/g, "").split("\n")[0].slice(0, 120);
  } else {
    const input = e.input as Record<string, unknown>;
    const res = e.result as Record<string, unknown> | undefined;
    li.className = `tool ${e.tool}`;
    let text = "";
    if (e.tool === "check") {
      const probs = (res?.problems as unknown[] | undefined)?.length ?? 0;
      text = probs ? `確かめ：作れない所 ${probs}` : "確かめ：すべて決まりの内側";
      li.classList.add(probs ? "ng" : "ok");
    } else if (e.tool === "look") text = `見る：${{ top: "上から", side: "横から", front: "正面から", angle: "斜めから" }[String(input.view)] ?? ""}`;
    else {
      const parts = Object.entries(input)
        .filter(([k]) => k !== "reason")
        .map(([k, v]) => `${{ style: "留め方", prong_count: "爪", prong_mm: "爪の太さ", height: "高さ", orientation: "向き", prong_positions: "爪の位置", width_mm: "幅", thickness_mm: "厚み", gou: "号", metal: "地金" }[k] ?? k} ${Array.isArray(v) ? v.join("・") : v}`);
      text = `${TOOL_WORD[e.tool] ?? e.tool}：${parts.join("、")}${input.reason ? ` ― ${String(input.reason)}` : ""}`;
    }
    li.textContent = text;
  }
  ol.appendChild(li);
  ol.scrollTop = ol.scrollHeight;
}

function stoneText(): string {
  if (!stone) return "";
  const m = stone.measured;
  const corners = stone.cornerIdx.length ? stone.cornerIdx.map((c) => `輪郭の点 ${c.index} 番（内角 ${c.angle}°）`).join("、") : "なし";
  return `石：${stone.shapeName}。長辺 ${m.longMm.toFixed(2)} mm、幅 ${m.widthMm.toFixed(2)} mm（${m.widthFromPhoto ? "写真から" : "測った値"}）、深さ ${stone.depthMm.toFixed(2)} mm。輪郭の点は ${m.outlineMm.length} 個（0 番から反時計回り）。尖った角：${corners}。色：${stone.extraction.colorless ? "無色" : "色のある石"}。`;
}

let making = false;
$(".studio-make .prompt").addEventListener("submit", (e) => {
  e.preventDefault();
  void make();
});
async function make() {
  if (!session || !stone || making) return;
  const wish = $<HTMLInputElement>(".wish").value.trim();
  const st = $(".make-status");
  const pass = store.password() || (await askPassword());
  if (!pass) {
    st.textContent = "生むには Claude が要ります。合言葉がないので、決まりごとから作った案を出しています。";
    return;
  }
  making = true;
  $(".worklog").innerHTML = "";
  st.innerHTML = `<span class="pulse"></span> Claude が組んで、職人の決まりで確かめています…`;
  const content: ClaudeContentBlockParam[] = [{ type: "text", text: `${stoneText()}\n${wish ? `希望：${wish}` : "希望：特になし（ふつうの普段使いの一粒石の指輪）"}` }];
  if (sketch) {
    content.push({ type: "text", text: "デザイナーの絵：この雰囲気に近づけてください。絵から分かることと分からないことを分けて書いてください。" });
    content.push({ type: "image", source: { type: "base64", media_type: sketch.media, data: sketch.base64 } });
  }
  content.push({ type: "text", text: "この石で指輪を組み、check で確かめ、作れない所があれば直してください。最後に、やったこと・確かめたこと・残っていることを短く書いてください。" });
  const r = await runClaude({
    host: session,
    messages: [{ role: "user", content }],
    system: designPrompt(store.ledger()),
    tools: TOOLS.filter((t) => ["set_setting", "set_shank", "check", "look"].includes(t.name)),
    password: pass,
    speed: "fast",
    maxTurns: 8,
    onLog: logLine,
  });
  making = false;
  undoClaude = r.undo;
  if (r.offline || (r.error && !r.log.length)) {
    if (r.error?.code === "wrong_password") resetPassword();
    st.textContent = `Claude につながりませんでした${r.error?.message ? `（${r.error.message}）` : ""}。決まりごとから作った案を出しています。`;
    return;
  }
  reason = r.finalText.replace(/\*\*/g, "");
  st.innerHTML = `${r.remaining !== undefined ? `今日あと ${r.remaining} 回 ・ ` : ""}<button type="button" class="link go-refine">整える →</button><button type="button" class="link undo-claude">Claude の作業を戻す</button>`;
  st.querySelector(".go-refine")!.addEventListener("click", () => setMode("refine"));
  st.querySelector(".undo-claude")!.addEventListener("click", () => {
    undoClaude?.();
    st.textContent = "Claude の作業を戻しました。";
  });
}

// ---- 整える。 ----
function ruleChip(r?: Rule): string {
  if (!r) return "";
  const who = r.source.kind === "craftsman" ? `${r.source.name}さんの決まり` : r.source.kind === "public" ? "公開情報の目安" : "仮の目安";
  return `<div class="rule-chip ${r.source.kind}"><b>${esc(who)}</b><span>${r.quote ? `「${esc(r.quote)}」` : esc(r.text)}</span><small>${esc(r.title)} ・ ${esc(r.date)}</small></div>`;
}
function renderRefine() {
  if (!session?.built) return;
  const b = session.built;
  const s = session.state;
  // 同じ確かめ・同じ数字の問題（爪 1・2・3 など）は 1 つにまとめる
  const groups = new Map<string, { p: (typeof b.problems)[number]; where: string[] }>();
  for (const p of b.problems) {
    const k = `${p.check}|${p.current}|${p.required}`;
    const g = groups.get(k);
    if (g) g.where.push(p.where);
    else groups.set(k, { p, where: [p.where] });
  }
  const probs = [...groups.values()].map((g) => ({ ...g.p, where: g.where.length > 1 ? `${g.where[0]} ほか ${g.where.length - 1} か所` : g.where[0] }));
  const box = $(".refine-panel");
  const pick = <T extends string | number>(name: string, cur: T, list: [T, string][]) =>
    `<div class="pick"><span>${name}</span><div>${list.map(([v, l]) => `<button type="button" data-k="${name}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div></div>`;
  box.innerHTML = `
    <section><h3>${b.problems.length ? `作れない所 ${b.problems.length}` : "職人の決まりの内側です"}</h3>
      ${
        probs.length
          ? `<ul class="probs">${probs
              .map(
                (p, i) => `<li><p class="p-where">${esc(p.where)}</p><p class="p-num">今 <b>${esc(p.current)}</b> ／ 必要 ${esc(p.required)}</p><p class="p-why">${esc(p.reason)}</p>${ruleChip(p.rule)}
              <div class="fixes">${p.options.map((o, j) => `<button type="button" data-p="${i}" data-o="${j}">${esc(o.label)}<small>${esc(o.effectOnLook)}</small></button>`).join("")}</div></li>`,
              )
              .join("")}</ul>`
          : `<p class="tech-what">爪の太さ・石と指のすき間・石の留まり・尖った角の守りは、どれも帳面の決まりの内側です。数字は目安・最後は職人が決める。</p>`
      }
    </section>
    ${reason ? `<section><h3>決めた理由</h3><p class="tech-what">${esc(reason).replace(/\n/g, "<br>")}</p></section>` : ""}
    <section class="manual"><h3>手で整える</h3>
      ${pick("留め方", s.style, [["prong", "爪"], ["bezel", "覆輪"]])}
      ${s.style === "prong" ? pick("爪の本数", s.prongCount ?? 0, [[0, "自動"], [3, "3"], [4, "4"], [5, "5"], [6, "6"]]) : ""}
      ${pick("高さ", s.height, [["low", "低め"], ["standard", "標準"], ["high", "高め"]])}
      ${pick("向き", s.orientation, [["along", "縦"], ["across", "横"]])}
      ${pick("地金", s.metal, (["k18yg", "pt900", "k18wg", "k18pg", "sv925"] as Metal[]).map((m) => [m, METAL_LABEL[m]] as [Metal, string]))}
      <div class="sliders">
        ${s.style === "prong" ? `<label><span>爪の太さ</span><input type="range" class="r-prong" min="0.4" max="1.6" step="0.05" value="${b.ring.setting.prongs[0]?.diameterMm.toFixed(2) ?? 0.8}"><output>${b.ring.setting.prongs[0]?.diameterMm.toFixed(2)} mm</output></label>` : ""}
        <label><span>号</span><input type="range" class="r-gou" min="5" max="25" step="1" value="${s.gou}"><output>${s.gou} 号</output></label>
      </div>
    </section>`;
  box.querySelectorAll<HTMLButtonElement>(".fixes button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const p = probs[Number(btn.dataset.p)];
      const o = p.options[Number(btn.dataset.o)];
      applyFix(o.id);
    }),
  );
  box.querySelectorAll<HTMLButtonElement>(".pick button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const k = btn.dataset.k!;
      const v = btn.dataset.v!;
      if (k === "留め方") session!.setSetting({ style: v as "prong" | "bezel", reason: "手で" });
      if (k === "爪の本数") session!.setSetting({ prong_count: Number(v) || undefined, reason: "手で" });
      if (k === "高さ") session!.setSetting({ height: v as "low", reason: "手で" });
      if (k === "向き") session!.setSetting({ orientation: v as "along", reason: "手で" });
      if (k === "地金") session!.setShank({ metal: v as Metal, reason: "手で" });
      if (k === "爪の本数" && !Number(v)) {
        session!.state.prongCount = undefined;
        session!.build("自動");
      }
    }),
  );
  box.querySelector<HTMLInputElement>(".r-prong")?.addEventListener("change", (e) => session!.setSetting({ prong_mm: Number((e.target as HTMLInputElement).value), reason: "手で" }));
  box.querySelector<HTMLInputElement>(".r-gou")?.addEventListener("change", (e) => session!.setShank({ gou: Number((e.target as HTMLInputElement).value), reason: "手で" }));
}
function applyFix(id: string) {
  const s = session!.state;
  const std = session!.built!.ring.setting.standardProngMm;
  switch (id) {
    case "raise":
      session!.setSetting({ height: s.height === "low" ? "standard" : "high", reason: "直し方から" });
      break;
    case "lower":
      session!.setSetting({ height: s.height === "high" ? "standard" : "low", reason: "直し方から" });
      break;
    case "thicker":
      session!.setSetting({ prong_mm: Math.round(Math.max(std, (s.prongMm ?? std) * 1.15) * 100) / 100, reason: "直し方から" });
      break;
    case "moreProngs":
    case "addProng":
      session!.setSetting({ prong_count: Math.min(8, session!.built!.ring.setting.prongs.length + 1), reason: "直し方から" });
      break;
    case "bezel":
      session!.setSetting({ style: "bezel", reason: "直し方から" });
      break;
    default:
      session!.build("直し方から");
  }
}

// ---- 渡す。 ----
function sheet(): string | undefined {
  if (!stone) return;
  const m = stone.measured;
  return patternSvg({ ...m, depthMm: stone.depthMm, shapeName: stone.shapeName, label: stone.label, date: new Date().toLocaleDateString("ja-JP") });
}
function openPrint(html: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}
function renderHand() {
  if (!session?.built || !stone) return;
  const b = session.built;
  const img = viewer.snapshot();
  $(".hand-panel").innerHTML = `<div class="sheet-preview">
    <img alt="" src="${img}">
    <div><h3>${esc(stone.shapeName)}の一粒石の指輪</h3><p>${b.problems.length ? `まだ作れない所が ${b.problems.length} あります。指示書にもそのまま書きます。` : "職人の決まりの内側です。"}</p>
    <div class="row"><button type="button" class="primary p-instr">指示書を印刷</button><button type="button" class="ghost-d p-sheet">原寸の型紙</button><button type="button" class="ghost-d p-stl">3D データ（STL）</button></div>
    <p class="note">指示書には、何を作るか・確かめた結果・根拠にした職人の決まりを書きます。作り方の手順は書きません（職人が決める）。型紙は「実際のサイズ」で印刷します。</p></div>
  </div>`;
  $(".hand-panel .p-instr").addEventListener("click", () => {
    const svg = sheet();
    if (!svg) return;
    openPrint(
      instructionHtml({
        ring: b.ring,
        problems: b.problems,
        shapeName: stone!.shapeName,
        depthMm: stone!.depthMm,
        widthFromPhoto: stone!.measured.widthFromPhoto,
        reason: reason || "手で整えた設計",
        imageDataUrl: img,
        patternSvg: svg,
        craftsmanRules: activeRules(store.ledger()).filter((r) => r.source.kind === "craftsman"),
        date: today(),
      }),
    );
  });
  $(".hand-panel .p-sheet").addEventListener("click", () => {
    const svg = sheet();
    if (svg) openPrint(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>継ぐ 型紙</title><style>@page{size:A4;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm}</style></head><body>${svg}</body></html>`);
  });
  $(".hand-panel .p-stl").addEventListener("click", () => {
    const r = b.ring.ringPositions;
    const all = new Float32Array(r.setting.length + r.shank.length);
    all.set(r.setting, 0);
    all.set(r.shank, r.setting.length);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toStl(all)], { type: "model/stl" }));
    a.download = `継ぐ_${stone!.shapeName}_${session!.state.gou}号.stl`;
    a.click();
  });
}

// ---- 帳面：職人が声で決まりを足すと、その場で確かめが変わる ----
function bookCount() {
  const n = activeRules(store.ledger()).filter((r) => r.source.kind === "craftsman").length;
  $(".book-n").textContent = String(n);
}
$(".book-btn").addEventListener("click", () => {
  const p = $(".book-panel");
  p.hidden = !p.hidden;
  if (!p.hidden) renderBook();
});
function renderBook() {
  const rules = activeRules(store.ledger());
  const mine = rules.filter((r) => r.source.kind === "craftsman");
  const others = rules.filter((r) => r.source.kind !== "craftsman");
  const name = masterName(store.ledger());
  const item = (r: Rule) => `<li class="${r.source.kind}"><b>${esc(r.title)}</b><p>${esc(r.text)}</p>${r.quote ? `<p class="q">「${esc(r.quote)}」</p>` : ""}<small>${esc(sourceLabel(r.source))} ・ ${esc(r.date)}</small></li>`;
  $(".book-panel").innerHTML = `<div class="bp-head"><h3>帳面</h3><button type="button" class="ghost-d bp-close">閉じる</button></div>
    <div class="add-rule">
      <p class="tech-what">${esc(name)}さんが話すと、決まりになって、今の設計の確かめにすぐ効きます。</p>
      <textarea rows="2" class="ar-text" placeholder="${canListen() ? "マイクを押して話す（例：石の下と指の間は 1 mm は空ける。汗がたまるから）" : "決まりを書く"}"></textarea>
      <div class="row"><button type="button" class="ghost-d ar-mic">話す</button><button type="button" class="primary ar-go">決まりにする</button></div>
      <div class="ar-proposal"></div>
    </div>
    <h4>${esc(name)}さんの決まり（${mine.length}）</h4><ul class="rules-l">${mine.map(item).join("")}</ul>
    <h4>公開情報の目安（${others.length}）</h4><ul class="rules-l">${others.map(item).join("")}</ul>
    <h4>ほかの道具</h4><p class="tech-what"><a class="link" href="app.html#rebuild">組み立て直す（途切れた技を、手がかりから）</a><br><a class="link" href="app.html#keep">残す（職人が手本を撮る・質問に答える）</a><br><a class="link" href="cad.html">技法の面（木目金・魚々子・布目象嵌・鎚目）</a></p>`;
  $(".bp-close").addEventListener("click", () => ($(".book-panel").hidden = true));
  const field = $<HTMLTextAreaElement>(".ar-text");
  const voice = bindVoice($<HTMLButtonElement>(".ar-mic"), field);
  $(".ar-go").addEventListener("click", () => {
    voice.stop();
    void addRuleFromWords(field.value.trim());
  });
}
async function addRuleFromWords(said: string) {
  if (!said) return;
  const name = masterName(store.ledger());
  const slot = $(".ar-proposal");
  const pass = store.password() || (await askPassword());
  if (!pass) {
    slot.innerHTML = `<p class="tech-what">決まりの案を作るには Claude が要ります。</p>`;
    return;
  }
  slot.innerHTML = `<p class="tech-what"><span class="pulse"></span> Claude が決まりの案にしています…</p>`;
  const host: ToolHost<null> = {
    setSetting: () => Promise.reject(new Error("使わない")),
    setShank: () => Promise.reject(new Error("使わない")),
    check: () => Promise.reject(new Error("使わない")),
    look: () => Promise.reject(new Error("使わない")),
    snapshot: () => null,
    restore: () => undefined,
    proposeRule: (p) => propose(slot, p, name),
  };
  const r = await runClaude({ host, messages: [{ role: "user", content: `${name}さんが話したこと：${said}` }], system: keepPrompt(store.ledger(), name), tools: TOOLS.filter((t) => t.name === "propose_rule"), password: pass, maxTurns: 3, speed: "fast" });
  if (r.offline || (r.error && !r.log.length)) {
    if (r.error?.code === "wrong_password") resetPassword();
    slot.innerHTML = `<p class="tech-what">Claude につながりませんでした。${esc(r.error?.message ?? "")}</p>`;
  }
}
function propose(slot: HTMLElement, p: ProposeRuleInput, name: string): Promise<ProposeRuleResult> {
  return new Promise((resolve) => {
    slot.innerHTML = `<div class="proposal-d"><b>${esc(p.title)}</b><p>${esc(p.text)}</p><p class="tech-what">なぜ：${esc(p.reason)}</p>${p.param ? `<p class="tech-what">値：${p.value}</p>` : ""}
      <div class="row"><button type="button" class="primary ok">これでいい</button><button type="button" class="ghost-d no">いらない</button></div></div>`;
    slot.querySelector(".no")!.addEventListener("click", () => {
      slot.innerHTML = "";
      resolve({ status: "declined", note: "職人が見送った" });
    });
    slot.querySelector(".ok")!.addEventListener("click", () => {
      const before = session?.built?.problems.length ?? 0;
      const next = addRule(store.ledger(), { title: p.title, text: p.text, reason: p.reason, example: p.example, quote: p.quote, param: p.param, value: p.value, bySize: p.by_size?.map((x) => ({ upToMm: x.up_to_mm, value: x.value })), source: { kind: "craftsman", name }, date: today() });
      store.setLedger(next);
      const id = next.rules[next.rules.length - 1].id;
      resolve({ status: "accepted", rule_id: id });
      const after = session ? session.build("帳面が変わった").problems.length : 0;
      toast(p.param ? `${name}さんの決まりで確かめ直しました：作れない所 ${before} → ${after}` : `${name}さんの決まりを帳面に足しました`);
      bookCount();
      renderBook();
    });
  });
}
function toast(t: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = t;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

setMode("make");
bookCount();
void loadSample().catch((e) => ($(".make-status").textContent = `見本の石を読めませんでした：${(e as Error).message}`));
(window as unknown as { __studio: unknown }).__studio = { get session() { return session; }, setMode };
