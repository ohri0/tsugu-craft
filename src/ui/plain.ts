// Claude の返事を、画面にそのまま出せる文字にする。
// 指示で「記号を使わない」と頼んでいるが、ときどき Markdown の太字（**）や見出し（#）が混ざるので、記号だけ外す。
export function plainText(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "・");
}
