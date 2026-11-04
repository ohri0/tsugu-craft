# 撮った PNG のこま（3200 × 1800）を JPEG にする（組むときに速く読めるように）。いくつも同時に。
# 使い方：python -I tojpg.py <章のフォルダ>
import os, sys
from multiprocessing import Pool
from PIL import Image

D = sys.argv[1]

def one(fn):
    src = os.path.join(D, fn)
    Image.open(src).convert("RGB").save(src[:-4] + ".jpg", quality=92, subsampling=0)
    os.remove(src)

if __name__ == "__main__":
    fs = sorted(f for f in os.listdir(D) if f.endswith(".png"))
    with Pool(min(12, os.cpu_count() or 4)) as p:
        p.map(one, fs, chunksize=8)
    print("jpg", len(fs))
