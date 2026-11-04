// 印刷：新しい窓（ポップアップ）を開かずに、同じページの中の見えない枠に文書を入れて印刷する。
// 前は window.open で新しい窓を開いていたが、Safari などがポップアップとして止めて、印刷できなかった（2026-11-05 作者）。
export function printHtml(html: string): void {
  const old = document.querySelector<HTMLIFrameElement>("iframe.print-frame");
  old?.remove();
  const f = document.createElement("iframe");
  f.className = "print-frame";
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  // 大きさ 0 にすると、印刷の大きさがくずれるブラウザがあるので、ページの外に置く
  f.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:1100px;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(f);
  const doc = f.contentDocument;
  const win = f.contentWindow;
  if (!doc || !win) {
    f.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  // 絵（図面の画像）が読み終わってから印刷する
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    win.focus();
    win.print();
    // 印刷の窓を閉じたら枠を片付ける（閉じたことが分からないブラウザのために、時間でも片付ける）
    win.addEventListener("afterprint", () => setTimeout(() => f.remove(), 500), { once: true });
    setTimeout(() => f.isConnected && f.remove(), 120000);
  };
  const imgs = [...doc.images].filter((im) => !im.complete);
  if (!imgs.length) setTimeout(go, 300);
  else {
    let left = imgs.length;
    const one = () => --left <= 0 && setTimeout(go, 100);
    imgs.forEach((im) => {
      im.addEventListener("load", one, { once: true });
      im.addEventListener("error", one, { once: true });
    });
    setTimeout(go, 4000);
  }
}
