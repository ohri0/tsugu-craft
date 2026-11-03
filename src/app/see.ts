// 見る：職人の手本を見て、自分の手を撮って比べる。言葉ではなく、動きの違いを目で見せる。
//
// 1. 手本：職人の動画に、手の骨組みと、職人がその瞬間に言った言葉を重ねて見せる。
// 2. 比べる：学ぶ人が同じ仕事を撮ると、手の点を読み、手本と違う瞬間を時間の帯に赤く出す。
// 3. 違う瞬間：手本のいちばん似た形のこまと並べ、手のひらの中心が通った跡（ふらつき）を描く。
//    「Claude に赤ペン」で、Claude が 2 枚を見比べ、印を描いて職人の決まりの言葉で直し方を言う。
// 4. 画像から分からないことは、その瞬間ごと職人に回す（残す に届く）。
import { trackVideo } from "../craft/hand-tracker";
import { createRecord, importRecord, type SkillRecord } from "../craft/record";
import { comparePose, poseSummary, poseTrack, type Moment, type PoseComparison, type PoseTrack, type Side } from "../craft/pose";
import { RED_PEN, marksSvg, parseRedPen, redPenPrompt, type RedPen } from "../claude/redpen";
import { callTool } from "../rebuild/run";
import { activeRules, ledgerText, type Rule } from "../rules/ledger";
import { findRules } from "../rules/search";
import { addQuestion } from "../rules/teacher-queue";
import { savedRecords } from "../ui/motion-ui";
import { drawFrame, poseAt, seek, trailAround } from "./draw";
import { masterName } from "./master";
import { askPassword, resetPassword } from "./password";
import { esc, store, today } from "./store";
import { getVideo } from "./video-store";

/** 手本：記録と、その動画の URL */
interface Example {
  id: string;
  record: SkillRecord;
  videoUrl: string;
  sample: boolean;
}

/** 公開してよい見本（public/samples/ にあるときだけ） */
interface SampleManifest {
  master: { record: string; video: string };
  learner?: { record: string; video: string };
}

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

async function loadSamples(): Promise<{ master: Example; learner?: Example } | null> {
  try {
    const res = await fetch("samples/manifest.json", { cache: "no-store" });
    if (!res.ok) return null;
    const m = (await res.json()) as SampleManifest;
    const load = async (x: { record: string; video: string }, id: string): Promise<Example> => {
      const r = importRecord(await (await fetch(`samples/${x.record}`)).text());
      return { id, record: r, videoUrl: `samples/${x.video}`, sample: true };
    };
    return { master: await load(m.master, "sample-master"), learner: m.learner ? await load(m.learner, "sample-learner") : undefined };
  } catch {
    return null;
  }
}

async function localExamples(): Promise<Example[]> {
  const out: Example[] = [];
  for (const r of savedRecords()) {
    const blob = await getVideo(r.id);
    if (blob) out.push({ id: r.id, record: r, videoUrl: URL.createObjectURL(blob), sample: false });
  }
  return out;
}

export function mountSee(root: HTMLElement): { refresh(): void } {
  root.innerHTML = `
  <section class="view see">
    <header class="view-head">
      <p class="eyebrow">学ぶ</p>
      <h2 class="see-title"></h2>
      <p class="lead">言葉ではなく、手の動きで比べます。手本と同じ仕事を撮ると、どの瞬間がどれだけ違うかを見せます。</p>
      <a class="ask-link" href="#ask">言葉で聞く（決まりと理由）→</a>
    </header>
    <div class="examples"></div>
    <div class="stage master-stage" hidden>
      <div class="frame"><video class="mv" playsinline muted preload="auto"></video><canvas class="mc"></canvas>
        <div class="said" hidden></div>
        <button type="button" class="play" aria-label="再生">▶</button>
      </div>
      <div class="scrub"><div class="bar"><i class="fill"></i></div><div class="pins"></div></div>
      <p class="small master-meta"></p>
    </div>
    <div class="cta" hidden>
      <div>
        <b>あなたの手を撮って比べる</b>
        <small>手本と同じ向き・同じ距離で、手首から指先まで入るように 20〜30 秒。</small>
      </div>
      <div class="row">
        <label class="primary btnlike">撮る<input type="file" accept="video/*" capture="environment" class="pick-cam" hidden></label>
        <label class="ghost btnlike">動画を選ぶ<input type="file" accept="video/*" class="pick-file" hidden></label>
        <button type="button" class="ghost try-sample" hidden>見本の動画で試す</button>
      </div>
    </div>
    <div class="progress" hidden><div class="pbar"><i></i></div><p class="small ptext"></p></div>
    <div class="result" hidden></div>
    <p class="small status"></p>
    <video class="lv" playsinline muted preload="auto" hidden></video>
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const mv = $<HTMLVideoElement>(".mv");
  const mc = $<HTMLCanvasElement>(".mc");
  const lv = $<HTMLVideoElement>(".lv");
  const status = (t: string) => ($(".status").textContent = t);

  let examples: Example[] = [];
  let sampleLearner: Example | undefined;
  let current: Example | null = null;
  let masterTrack: { left: PoseTrack; right: PoseTrack } | null = null;
  let learner: { record: SkillRecord; videoUrl: string } | null = null;
  let cmp: PoseComparison | null = null;

  // ---- 手本 ----
  async function refresh() {
    const name = masterName(store.ledger());
    $(".see-title").textContent = `${name}さんの手本`;
    const samples = await loadSamples();
    const local = await localExamples();
    examples = [...(samples ? [samples.master] : []), ...local];
    sampleLearner = samples?.learner;
    $(".try-sample").hidden = !sampleLearner;
    if (!examples.length) {
      $(".examples").innerHTML = `<div class="no-example"><p>まだ手本の動画がありません。</p><p class="small">「残す」の「手本を撮る」で職人が作業を撮ると、ここに手本として出ます。それまでは、職人が残した決まりに「なぜ？」と聞いて学べます。</p><div class="row"><a class="primary btnlike" href="#ask">言葉で聞く</a><a class="ghost btnlike to-motion" href="#keep">手本を撮る（職人）</a></div></div>`;
      $(".examples").querySelector(".to-motion")?.addEventListener("click", () => setTimeout(() => document.querySelector<HTMLButtonElement>('[data-open="motion"]')?.click(), 60));
      $(".master-stage").hidden = true;
      $(".cta").hidden = true;
      return;
    }
    $(".examples").innerHTML = `<div class="ex-list">${examples
      .map((e, i) => `<button type="button" class="ex" data-i="${i}" aria-pressed="false"><b>${esc(e.record.title)}</b><small>${esc(e.record.craftsman || name)}さん ・ ${clock(e.record.durationS)}${e.record.notes.length ? ` ・ 言葉 ${e.record.notes.length}` : ""}${e.sample ? " ・ 見本" : ""}</small></button>`)
      .join("")}</div>`;
    root.querySelectorAll<HTMLButtonElement>(".ex").forEach((b) => b.addEventListener("click", () => choose(examples[Number(b.dataset.i)])));
    if (!current || !examples.some((e) => e.id === current!.id)) choose(examples[0]);
  }

  function choose(e: Example) {
    current = e;
    root.querySelectorAll<HTMLButtonElement>(".ex").forEach((b) => b.setAttribute("aria-pressed", String(examples[Number(b.dataset.i)] === e)));
    masterTrack = { left: poseTrack(e.record.landmarksSampled, "left"), right: poseTrack(e.record.landmarksSampled, "right") };
    mv.src = e.videoUrl;
    $(".master-stage").hidden = false;
    $(".cta").hidden = false;
    $(".result").hidden = true;
    cmp = null;
    $(".master-meta").textContent = `${e.record.craftsman || masterName(store.ledger())}さん ・ ${e.record.date} ・ 線は手の骨組み（動画から読んだ手の点）`;
    $(".pins").innerHTML = e.record.notes
      .map((n, i) => `<button type="button" class="pin" data-i="${i}" style="left:${((100 * n.t) / Math.max(1, e.record.durationS)).toFixed(2)}%" title="${esc(n.text)}"></button>`)
      .join("");
    root.querySelectorAll<HTMLButtonElement>(".pin").forEach((p) =>
      p.addEventListener("click", () => {
        const n = e.record.notes[Number(p.dataset.i)];
        mv.currentTime = n.t;
        void mv.play();
      }),
    );
  }

  // 手本の再生：骨組みと、その瞬間の職人の言葉を重ねる
  function paintMaster() {
    if (!current || !masterTrack || !mv.videoWidth) return;
    const w = mc.clientWidth * devicePixelRatio;
    const h = mc.clientHeight * devicePixelRatio;
    if (mc.width !== w || mc.height !== h) Object.assign(mc, { width: w, height: h });
    const ctx = mc.getContext("2d")!;
    const t = mv.currentTime;
    ctx.clearRect(0, 0, w, h);
    for (const side of ["left", "right"] as const) {
      const p = poseAt(masterTrack[side], t);
      if (!p) continue;
      // drawFrame は動画も描くので、ここでは骨組みだけ（動画は video 要素がそのまま見える）
      drawSkeleton(ctx, p.pts, w, h, "#e9c46a");
    }
    const note = current.record.notes.filter((n) => t >= n.t - 0.2 && t <= n.t + 2.8).pop();
    const said = $(".said");
    said.hidden = !note;
    if (note) said.textContent = `「${note.text}」`;
    $<HTMLElement>(".scrub .fill").style.width = `${(100 * t) / Math.max(0.1, mv.duration || current.record.durationS)}%`;
  }
  function drawSkeleton(ctx: CanvasRenderingContext2D, pts: number[], w: number, h: number, color: string) {
    const C = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.5, w / 260);
    for (const [a, b] of C) {
      ctx.beginPath();
      ctx.moveTo(pts[2 * a] * w, pts[2 * a + 1] * h);
      ctx.lineTo(pts[2 * b] * w, pts[2 * b + 1] * h);
      ctx.stroke();
    }
  }
  let raf = 0;
  const loop = () => {
    paintMaster();
    raf = mv.paused ? 0 : requestAnimationFrame(loop);
  };
  mv.addEventListener("play", () => {
    $(".play").hidden = true;
    if (!raf) raf = requestAnimationFrame(loop);
  });
  mv.addEventListener("pause", () => ($(".play").hidden = false));
  mv.addEventListener("seeked", paintMaster);
  mv.addEventListener("loadeddata", paintMaster);
  $(".play").addEventListener("click", () => void mv.play());
  $(".master-stage .frame").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".play")) return;
    if (mv.paused) void mv.play();
    else mv.pause();
  });
  $(".scrub .bar").addEventListener("click", (e) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    mv.currentTime = ((e.clientX - r.left) / r.width) * (mv.duration || 0);
  });

  // ---- 学ぶ人の動画を読む ----
  async function readLearner(file: File | Example) {
    if (!current) return;
    $(".result").hidden = true;
    let record: SkillRecord;
    let url: string;
    if ("record" in file) {
      record = file.record;
      url = file.videoUrl;
    } else {
      url = URL.createObjectURL(file);
      lv.src = url;
      $(".progress").hidden = false;
      const bar = $<HTMLElement>(".pbar i");
      $(".ptext").textContent = "手を読む道具を用意しています（初めては 20 MB ほど読み込みます）…";
      try {
        const input = await trackVideo(lv, {
          fps: 10,
          onProgress: (d, n) => {
            bar.style.width = `${(100 * d) / n}%`;
            $(".ptext").textContent = `あなたの手を読んでいます ${Math.round((100 * d) / n)}%`;
          },
        });
        record = createRecord(input, { title: "あなたの動画", craftsman: "", videoName: file.name || "動画" });
      } catch (e) {
        $(".progress").hidden = true;
        status(`手を読めませんでした：${(e as Error).message}`);
        return;
      }
      $(".progress").hidden = true;
    }
    learner = { record, videoUrl: url };
    lv.src = url;
    compare();
  }

  function compare() {
    if (!current || !learner) return;
    // 左右の手のうち、手本と学ぶ人の両方でよく見えていて、違いが大きいほうを見せる
    const sides: Side[] = ["right", "left"];
    const cands = sides.map((s) => comparePose(current!.record.landmarksSampled, learner!.record.landmarksSampled, s)).filter((c) => c.seen.master > 0.3 && c.seen.learner > 0.3);
    if (!cands.length) {
      status("両方の動画で、同じ手がよく見えませんでした。手首から指先まで入るように撮り直してください。");
      return;
    }
    cmp = cands.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))[0];
    renderResult();
  }

  function holdRule(): Rule | undefined {
    const rules = activeRules(store.ledger());
    return findRules("金属を持つ手 すり板 押し付けて 動かさない", rules, 0.2, 1)[0];
  }

  function renderResult() {
    if (!cmp || !current || !learner) return;
    const c = cmp;
    const name = current.record.craftsman || masterName(store.ledger());
    const rule = holdRule();
    const r = c.ratio;
    const head = r >= 1.3 ? `手が、手本の <em>${r.toFixed(1)} 倍</em> 動いています` : r <= 0.77 ? `手本より、手の動きが小さいです` : `手本とほぼ同じ動きです`;
    const max = Math.max(c.masterWobble, c.learnerWobble) || 1;
    const dur = learner.record.durationS || 1;
    $(".result").hidden = false;
    $(".result").innerHTML = `
      <div class="verdict">
        <p class="eyebrow">比べた結果 ・ ${c.side === "right" ? "画面の右の手" : "画面の左の手"}</p>
        <h3>${head}</h3>
        <div class="bars">
          <div><span>${esc(name)}さん</span><i style="--w:${((100 * c.masterWobble) / max).toFixed(1)}%" class="gold"></i></div>
          <div><span>あなた</span><i style="--w:${((100 * c.learnerWobble) / max).toFixed(1)}%" class="red"></i></div>
        </div>
        <p class="small">手のひらの中心が、前後 1 秒の真ん中の位置からどれだけ離れたか（ふらつき）の平均。手本 ${c.masterWobble.toFixed(2)}・あなた ${c.learnerWobble.toFixed(2)}（手のひらの長さを 1 として）。</p>
        ${rule ? `<blockquote>「${esc(rule.quote || rule.text)}」<small>${esc(rule.source.kind === "craftsman" ? `${rule.source.name}さん` : "")} ・ ${esc(rule.title)}</small></blockquote>` : ""}
      </div>
      <div class="heat">
        <p class="small">あなたの動画で、手本より大きく揺れた所（赤いほど違う）</p>
        <div class="heatbar">${c.heat
          .map((h, i) => {
            const next = c.heat[i + 1]?.t ?? h.t + 0.1;
            const v = h.v ?? 0;
            const col = h.v === null ? "transparent" : v < 0.5 ? `rgba(140,106,51,${(0.15 + v * 0.5).toFixed(2)})` : `rgba(224,65,43,${(0.35 + (v - 0.5) * 1.2).toFixed(2)})`;
            return `<i style="left:${((100 * h.t) / dur).toFixed(2)}%;width:${((100 * (next - h.t)) / dur + 0.2).toFixed(2)}%;background:${col}"></i>`;
          })
          .join("")}
          ${c.moments.map((m, i) => `<button type="button" class="mk" data-m="${i}" style="left:${((100 * m.t) / dur).toFixed(2)}%">${i + 1}</button>`).join("")}
        </div>
        <div class="ticks"><span>0:00</span><span>${clock(dur)}</span></div>
      </div>
      ${c.moments.length ? `<div class="moment"></div>` : `<p class="small">手本より大きく違う瞬間は見つかりませんでした。</p>`}`;
    root.querySelectorAll<HTMLButtonElement>(".mk").forEach((b) => b.addEventListener("click", () => void showMoment(c.moments[Number(b.dataset.m)], Number(b.dataset.m))));
    if (c.moments.length) void showMoment(c.moments[0], 0);
    $(".result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function showMoment(m: Moment, i: number) {
    if (!current || !learner || !cmp) return;
    root.querySelectorAll<HTMLButtonElement>(".mk").forEach((b) => b.classList.toggle("on", Number(b.dataset.m) === i));
    const box = $(".moment");
    const name = current.record.craftsman || masterName(store.ledger());
    box.innerHTML = `
      <div class="pair">
        <figure><div class="shot"><canvas class="cm"></canvas><div class="pen pen-m"></div></div><figcaption>${esc(name)}さん ・ ${m.masterT !== null ? clock(m.masterT) : "-"}<small>いちばん似た形のこま</small></figcaption></figure>
        <figure><div class="shot"><canvas class="cl"></canvas><div class="pen pen-l"></div></div><figcaption>あなた ・ ${clock(m.t)}<small>違いがいちばん大きいこま</small></figcaption></figure>
      </div>
      <p class="legend"><i class="gold"></i>手本の手の通った跡 <i class="red"></i>あなたの手の通った跡（前後 1 秒）${m.angleDiff !== null && Math.abs(m.angleDiff) >= 8 ? ` ・ 手の向きが手本より ${Math.abs(m.angleDiff).toFixed(0)}° ${m.angleDiff > 0 ? "左に回っています" : "右に回っています"}` : ""}</p>
      <div class="pen-note" hidden></div>
      <div class="row moment-actions">
        <button type="button" class="primary pen-go">Claude に赤ペンを頼む</button>
        <button type="button" class="ghost play-both">並べて再生</button>
        <button type="button" class="ghost ask-master">この瞬間を${esc(name)}さんに聞く</button>
      </div>`;
    const side = cmp.side;
    const lt = poseTrack(learner.record.landmarksSampled, side);
    const mt = masterTrack![side];
    const shoot = async (video: HTMLVideoElement, src: string, canvas: HTMLCanvasElement, tr: PoseTrack, t: number, color: string, trail: string) => {
      if (!video.src.endsWith(src)) video.src = src;
      if (video.readyState < 2) await new Promise((r) => video.addEventListener("loadeddata", r, { once: true }));
      await seek(video, t);
      const aspect = video.videoWidth / video.videoHeight || 9 / 16;
      const W = 720;
      const H = Math.round(W / aspect);
      Object.assign(canvas, { width: W, height: H });
      drawFrame(canvas.getContext("2d")!, video, W, H, { pose: poseAt(tr, t), trail: trailAround(tr, t), color, trailColor: trail });
    };
    const mvid = document.createElement("video");
    mvid.muted = true;
    mvid.playsInline = true;
    mvid.preload = "auto";
    await shoot(mvid, current.videoUrl, box.querySelector(".cm")!, mt, m.masterT ?? 0, "rgba(233,196,106,0.9)", "#e9c46a");
    await shoot(lv, learner.videoUrl, box.querySelector(".cl")!, lt, m.t, "rgba(255,255,255,0.85)", "#e0412b");
    box.querySelector(".pen-go")!.addEventListener("click", () => void redPen(m, box));
    box.querySelector(".ask-master")!.addEventListener("click", () => {
      store.setQueue(
        addQuestion(store.queue(), {
          question: `この瞬間（${clock(m.t)}）の手の動きで、どこを直せばいい？`,
          whyUnanswered: `手の点から分かったのは「${poseSummary(cmp!)}」まで。何を見て直すかは${name}さんに聞きたい`,
          context: `学ぶ人の動画 ${clock(m.t)}、手本の似た形 ${m.masterT !== null ? clock(m.masterT) : "-"}`,
          date: today(),
        }).queue,
      );
      const b = box.querySelector<HTMLButtonElement>(".ask-master")!;
      b.textContent = `${name}さんに回しました（残す に届きます）`;
      b.disabled = true;
    });
    box.querySelector(".play-both")!.addEventListener("click", async () => {
      // 違う瞬間の 1 秒前から、2 本を並べて 3 秒だけ再生する（下の 2 枚がそのまま動く）
      const cm = box.querySelector<HTMLCanvasElement>(".cm")!;
      const cl = box.querySelector<HTMLCanvasElement>(".cl")!;
      const t0m = Math.max(0, (m.masterT ?? 0) - 1);
      const t0l = Math.max(0, m.t - 1);
      await Promise.all([seek(mvid, t0m), seek(lv, t0l)]);
      void mvid.play();
      void lv.play();
      const end = performance.now() + 3000;
      const tick = () => {
        drawFrame(cm.getContext("2d")!, mvid, cm.width, cm.height, { pose: poseAt(mt, mvid.currentTime), trail: trailAround(mt, mvid.currentTime), color: "rgba(233,196,106,0.9)", trailColor: "#e9c46a" });
        drawFrame(cl.getContext("2d")!, lv, cl.width, cl.height, { pose: poseAt(lt, lv.currentTime), trail: trailAround(lt, lv.currentTime), color: "rgba(255,255,255,0.85)", trailColor: "#e0412b" });
        if (performance.now() < end) requestAnimationFrame(tick);
        else {
          mvid.pause();
          lv.pause();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  async function redPen(m: Moment, box: HTMLElement) {
    if (!current || !learner || !cmp) return;
    const name = current.record.craftsman || masterName(store.ledger());
    const pass = store.password() || (await askPassword(true));
    const note = box.querySelector<HTMLElement>(".pen-note")!;
    note.hidden = false;
    if (!pass) {
      note.innerHTML = `<p class="small">赤ペンには Claude が要ります。合言葉を入れてください。</p>`;
      return;
    }
    const btn = box.querySelector<HTMLButtonElement>(".pen-go")!;
    btn.disabled = true;
    note.innerHTML = `<p class="thinking"><span></span><span></span><span></span></p><p class="small">Claude が 2 枚を見比べています…</p>`;
    const img = (cv: HTMLCanvasElement) => {
      const s = document.createElement("canvas");
      const k = Math.min(1, 640 / cv.width);
      Object.assign(s, { width: Math.round(cv.width * k), height: Math.round(cv.height * k) });
      s.getContext("2d")!.drawImage(cv, 0, 0, s.width, s.height);
      return s.toDataURL("image/jpeg", 0.82).split(",")[1];
    };
    const cm = box.querySelector<HTMLCanvasElement>(".cm")!;
    const cl = box.querySelector<HTMLCanvasElement>(".cl")!;
    const ledger = store.ledger();
    const rules = activeRules(ledger);
    const notesNear = current.record.notes.filter((n) => m.masterT !== null && Math.abs(n.t - m.masterT) < 4).map((n) => `${clock(n.t)}「${n.text}」`);
    const r = await callTool<RedPen>({
      system: redPenPrompt(name, ledgerText(ledger)),
      user: [
        { type: "text", text: `1 枚目：${name}さんの手本（${m.masterT !== null ? clock(m.masterT) : "-"}）` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img(cm) } },
        { type: "text", text: `2 枚目：学ぶ人（${clock(m.t)}）` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img(cl) } },
        {
          type: "text",
          text: `手の点から分かったこと：${poseSummary(cmp)}${m.angleDiff !== null ? ` この瞬間の手の向きの差は ${m.angleDiff.toFixed(0)}°。` : ""}${notesNear.length ? `\n${name}さんがこのあたりで言ったこと：${notesNear.join(" ")}` : ""}\n仕事：${current.record.title}`,
        },
      ],
      tool: RED_PEN,
      parse: (x) => parseRedPen(x, rules.map((q) => q.id)),
      password: pass,
    });
    btn.disabled = false;
    if (!r.ok) {
      if (r.code === "wrong_password") resetPassword();
      note.innerHTML = `<p class="small">${esc(r.error)}</p>`;
      return;
    }
    const pen = r.value;
    const aspectOf = (cv: HTMLCanvasElement) => cv.width / cv.height;
    box.querySelector(".pen-m")!.innerHTML = marksSvg(pen.marks, "master", aspectOf(cm));
    box.querySelector(".pen-l")!.innerHTML = marksSvg(pen.marks, "you", aspectOf(cl));
    const rule = rules.find((q) => q.id === pen.rule_id);
    note.innerHTML = `<div class="pen-card"><p class="pen-comment">${esc(pen.comment)}</p>
      ${rule ? `<blockquote>「${esc(rule.quote || rule.text)}」<small>${esc(rule.source.kind === "craftsman" ? `${rule.source.name}さん` : "")} ・ ${esc(rule.title)}</small></blockquote>` : ""}
      ${pen.ask_master ? `<p class="small">画像からは分からないこと：${esc(pen.ask_master)} <button type="button" class="ghost tiny send-ask">${esc(name)}さんに聞く</button></p>` : ""}
      <p class="small muted">赤ペン：Claude ・ 手本と見比べた見た目の違いだけ。最後は職人が決めます。</p></div>`;
    note.querySelector(".send-ask")?.addEventListener("click", (e) => {
      store.setQueue(addQuestion(store.queue(), { question: pen.ask_master, whyUnanswered: "画像からは判断できない（赤ペンから）", context: `学ぶ人の動画 ${clock(m.t)}`, date: today() }).queue);
      const b = e.currentTarget as HTMLButtonElement;
      b.textContent = "回しました";
      b.disabled = true;
    });
  }

  const onPick = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (f) void readLearner(f);
  };
  $(".pick-cam").addEventListener("change", onPick);
  $(".pick-file").addEventListener("change", onPick);
  $(".try-sample").addEventListener("click", () => sampleLearner && void readLearner(sampleLearner));

  void refresh();
  return { refresh: () => void refresh() };
}
