// 継ぐの動画を組む：台本（scenes11.json）の場面ごとに、撮った素材（footage/）があればそれを、なければ前の静止画か「撮るもの」の板を使い、
// 字幕を重ね、声（voice/）を場面の頭に置いて、3 分の動画にする。
// 使い方：node edit.cjs   → vc/継ぐ_動画_編集.mp4
const { chromium, SP, VIDEO } = require('./paths.cjs');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const S = `${SP}/vc`, M = `${S}/m3`, F = `${SP}/footage`, V = `${SP}/voice`;
fs.mkdirSync(M, { recursive: true });
const find = (name) => { const f = fs.readdirSync(F).find((x) => x.startsWith(name) && /\.(mov|mp4|m4v)$/i.test(x)); return f ? `${F}/${f}` : null; };
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
(async () => {
  const scenes = JSON.parse(fs.readFileSync(`${VIDEO}/${process.env.SCENES || 'scenes11.json'}`, 'utf8'));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const shoot = async (q, out, n) => { await p.goto(`file://${VIDEO}/${process.env.OVERLAY || 'ov3.html'}?n=${n}#${encodeURIComponent(JSON.stringify(q))}`); await p.waitForTimeout(200); await p.screenshot({ path: out, omitBackground: true }); };
  const clips = []; let n = 0; const used = []; const missing = [];
  let t = 0; const voices = [];
  for (const [si, sc] of scenes.entries()) {
    const ov = `${M}/ov${si}.png`; await shoot({ ...sc, mode: 'ov' }, ov, n++);
    const vname = process.env.VOICE === 'tts' ? `${process.env.VPREFIX || 't'}${si}` : sc.voice;
    if (vname && fs.existsSync(`${V}/${vname}.wav`)) voices.push({ f: `${V}/${vname}.wav`, at: t + 0.4 });
    const vids = (sc.video ?? []).map(find).filter(Boolean);
    (sc.video ?? []).forEach((v) => (find(v) ? used : missing).push(`${sc.name}：${v}`));
    const shots = vids.length ? vids.map((v) => ({ v })) : sc.shots;
    const fixed = shots.reduce((a, x) => a + (x.d ?? 0), 0);
    const flex = shots.filter((x) => !x.d).length;
    for (const [k, sh] of shots.entries()) {
      const each = sh.d ?? (sc.d - fixed) / (flex || 1);
      const out = `${M}/c${String(clips.length).padStart(3, '0')}.mp4`;
      const fades = `fade=t=in:st=0:d=0.25,fade=t=out:st=${(each - 0.25).toFixed(2)}:d=0.25`;
      if (sh.seq) {
        // 1 こまずつ撮った PNG の並び（黒の上の指輪）。from こま目から、fps で流す
        const vf = `[0:v]scale=1920:1080,fps=30,tpad=stop_mode=clone:stop_duration=60,trim=duration=${each.toFixed(3)},format=rgba[bg];[bg][1:v]overlay=0:0,${fades},format=yuv420p[v]`;
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(sh.fps ?? 30), '-start_number', String(sh.from ?? 0), '-i', `${S}/${sh.seq}/%04d.png`, '-loop', '1', '-i', ov, '-filter_complex', vf, '-map', '[v]', '-an', '-t', each.toFixed(3), '-r', '30', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', out]);
      } else if (sh.clip) {
        // 画面を動いたまま撮った動画：from 秒から、speed 倍で。crop は元の動画の [x, y, 幅, 高さ]。足りない分は最後のこまで止める
        const src = `${S}/${sh.clip}`;
        const sp = sh.speed ?? 1;
        const cr = sh.crop ? `crop=${sh.crop[2]}:${sh.crop[3]}:${sh.crop[0]}:${sh.crop[1]},` : '';
        // frame：画面の録画を、黒の上に枠つきで小さめに置く（広告のように）
        const fr = sh.frame ? `scale=1440:810:force_original_aspect_ratio=decrease,pad=1920:1080:240:200:color=black,drawbox=x=239:y=199:w=1442:h=812:color=0x2a2a2e:t=1,` : `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x111113,`;
        const vf = `[0:v]setpts=(PTS-STARTPTS)/${sp},${cr}${fr}fps=30,tpad=stop_mode=clone:stop_duration=60,trim=duration=${each.toFixed(3)},format=rgba[bg];[bg][1:v]overlay=0:0,${fades},format=yuv420p[v]`;
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(sh.from ?? 0), '-i', src, '-loop', '1', '-i', ov, '-filter_complex', vf, '-map', '[v]', '-an', '-t', each.toFixed(3), '-r', '30', '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', out]);
      } else if (sh.v) {
        // 撮った素材：真ん中あたりから切り出し、1920×1080 に収める（はみ出しは黒で埋める）
        const from = Math.max(0, (dur(sh.v) - each) / 2);
        const vf = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=rgba[bg];[bg][1:v]overlay=0:0,${fades},format=yuv420p[v]`;
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', from.toFixed(2), '-i', sh.v, '-loop', '1', '-i', ov, '-filter_complex', vf, '-map', '[v]', '-an', '-t', each.toFixed(3), '-r', '30', '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', out]);
      } else {
        let bg;
        if (sh.ph) { bg = `${M}/ph${si}_${k}.png`; await shoot({ ph: sh.ph, mode: 'ph' }, bg, n++); }
        else bg = `${S}/raw/${sh.img}.png`;
        const z0 = sh.z0 ?? 1, z1 = sh.z1 ?? 1.06, fx = sh.fx ?? 0.5, fy = sh.fy ?? 0.5;
        const frames = Math.round(each * 30);
        const zexpr = `${z0}+(${z1}-${z0})*on/${frames}`;
        const vf = `[0:v]scale=3840:2160,zoompan=z='${zexpr}':x='(iw-iw/zoom)*${fx}':y='(ih-ih/zoom)*${fy}':d=${frames}:s=1920x1080:fps=30,format=rgba[bg];[bg][1:v]overlay=0:0,${fades},format=yuv420p[v]`;
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', bg, '-loop', '1', '-i', ov, '-filter_complex', vf, '-map', '[v]', '-t', each.toFixed(3), '-r', '30', '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', out]);
      }
      clips.push(out);
    }
    t += sc.d;
  }
  await b.close();
  fs.writeFileSync(`${M}/list.txt`, clips.map((c) => `file '${c}'`).join('\n') + '\n');
  const silent = `${M}/video.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${M}/list.txt`, '-c', 'copy', silent]);
  // 声：場面の頭に置く。前の声が長いときは、終わってから 0.4 秒あけて次を置く
  let prev = 0; const args = ['-v', 'error', '-y', '-i', silent]; const flt = [];
  voices.forEach((x, i) => { const at = Math.max(x.at, prev + 0.4); prev = at + dur(x.f); args.push('-i', x.f); const ms = Math.round(at * 1000); flt.push(`[${i + 1}:a]adelay=${ms}|${ms}[a${i}]`); });
  const out = process.env.OUT ? `${S}/${process.env.OUT}` : process.env.VOICE === 'tts' ? `${S}/継ぐ_仮の動画_機械の声.mp4` : `${S}/継ぐ_動画_編集.mp4`;
  if (voices.length && process.env.BGM) {
    // 音楽（bgm.py で作ったもの）を、声が出ている間だけ下げて重ねる
    args.push('-i', process.env.BGM);
    const bi = voices.length + 1;
    flt.push(`${voices.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voices.length}:normalize=0,apad,atrim=0:${t},asplit=2[vo][vk]`);
    flt.push(`[${bi}:a]atrim=0:${t},volume=${process.env.BGM_GAIN || '0.32'}[bg]`, `[bg][vk]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=400[bgd]`, `[vo][bgd]amix=inputs=2:normalize=0[aout]`);
    execFileSync('ffmpeg', [...args, '-filter_complex', flt.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out]);
  } else if (voices.length) {
    flt.push(`${voices.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voices.length}:normalize=0,apad,atrim=0:${t}[aout]`);
    execFileSync('ffmpeg', [...args, '-filter_complex', flt.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out]);
  } else fs.copyFileSync(silent, out);
  console.log('できた：', out, `${t} 秒`);
  console.log('使った素材：', used.length ? used.join('、') : 'なし');
  console.log('まだない素材：', missing.join('、'));
})();
