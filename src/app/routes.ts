// 画面のアドレス（#）の決まり。前の名前で来ても、新しい場所へ送る（外のリンクや印刷した紙が切れないように）。
// 今の場所：#ledger（帳面）・#learn（学ぶ。#learn/hands は手の動きで比べる）・#waza（技。#waza/nanako・#waza/rebuild）

/** 前の名前 → 新しい場所。送らなくていいときは null */
export function redirectHash(hash: string): string | null {
  const [head, ...rest] = hash.replace(/^#/, "").split("/");
  const tail = rest.join("/");
  switch (head) {
    case "see":
      return "#learn/hands";
    case "ask":
      return "#learn";
    case "keep":
      return "#ledger";
    case "rebuild":
      return "#waza/rebuild";
    case "waza":
      // 指輪の石留めの聞き取りは、帳面の「Claude から質問」に移した（?gap= はそのまま渡す）
      return tail.startsWith("ring") ? `#ledger${tail.slice(4)}` : null;
    default:
      return null;
  }
}
