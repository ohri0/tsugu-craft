// STL のファイル名（2026-11-08 初めての人の試し：作れない所があっても黙って書き出していた）。
// 作れない所があるのに書き出すときは、名前に「_確かめ前」を付けて、あとで見て分かるようにする。

/** 作れない所の数に合わせた STL のファイル名。base は「継ぐ_ラウンド_11号」のように .stl を付けない名前 */
export function stlFileName(base: string, problems: number): string {
  return `${base}${problems > 0 ? "_確かめ前" : ""}.stl`;
}
