# 入口のページと「なぜ継ぐ」の見出しの字（しっぽり明朝。SIL OFL 1.1）から、使う字だけを抜き出して public/fonts/ に置く。ページを軽くするため。
# 使い方：pip で fonttools と brotli を入れた Python で
#   python scripts/lp-font.py <ShipporiMincho-Regular.ttf の場所>
# 字を足した見出しがあれば、もう一度走らせる（抜けた字は、端末の明朝で出る）。元の字は video/work/fonts/ にあり、リポジトリに入れない。
import pathlib, sys
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
src = sys.argv[1]
# 作り方の札（public/lp/make-steps.json）の工程の名前も明朝で出るので入れる（2026-11-07）
text = "".join(p.read_text(encoding="utf-8") for p in [root / "src/lp/main.ts", root / "src/studio/why.ts", root / "public/lp/make-steps.json"])
chars = {c for c in text if ord(c) > 0x2000}
# かなと記号は全部、英数字も入れる（あとで言葉を少し変えても崩れない）
chars |= {chr(c) for c in range(0x3041, 0x3097)} | {chr(c) for c in range(0x30a1, 0x30fb)}
chars |= set("ー、。，．・：；？！「」『』（）〜― …") | {chr(c) for c in range(0x20, 0x7f)}
chars |= set("一二三四五六七八九十")
out = root / "public/fonts/shippori-mincho-sub.woff2"
out.parent.mkdir(exist_ok=True)
opts = subset.Options()
opts.layout_features = ["*"]
opts.flavor = "woff2"
opts.notdef_outline = True
font = subset.load_font(src, opts)
sub = subset.Subsetter(opts)
sub.populate(text="".join(sorted(chars)))
sub.subset(font)
subset.save_font(font, str(out), opts)
print(len(chars), "字", out.stat().st_size // 1024, "KB")
