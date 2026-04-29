"""
Generate Aorix favicon by cropping the X-symbol from the main logo.

Source: aorix_logo_main.png (1488x624, RGBA)
Output: aorix_x_favicon.png (256x256, transparent square, X centered)
        aorix_x_favicon.ico (multi-size: 16, 32, 48 — for legacy browsers)
"""
from PIL import Image
from pathlib import Path

ASSETS = Path(__file__).parent
src = Image.open(ASSETS / "aorix_logo_main.png").convert("RGBA")
W, H = src.size  # 1488 x 624

# Find the gap between "aorix" wordmark and the X-symbol via color filtering.
# Wordmark = dark navy, X-symbol = bright/light blue. Use luminance to isolate.
import numpy as np
arr = np.array(src)  # H x W x 4 (RGBA)
rgb = arr[..., :3].astype(int)
alpha_arr = arr[..., 3]
# Luminance proxy: simple R+G+B sum. Bright blue X has high B+G; dark navy has low all.
luma = rgb.sum(axis=2)  # 0..765
# Mask: opaque AND bright (excludes dark wordmark)
bright_mask = (alpha_arr > 50) & (luma > 300)
# Column-wise count of bright pixels
col_bright = bright_mask.sum(axis=0)
nonzero_cols = np.where(col_bright > 0)[0]
if len(nonzero_cols) == 0:
    raise RuntimeError("No bright pixels found — wrong source image?")
x_symbol_start = int(nonzero_cols[0])
x_symbol_end = int(nonzero_cols[-1]) + 1
print(f"X-symbol bright pixels span columns {x_symbol_start}..{x_symbol_end}")

right = src.crop((x_symbol_start, 0, W, H))

# Tight bounding box of non-transparent pixels in the right portion
bbox = right.getbbox()  # (left, upper, right, lower) in `right` coords
if bbox is None:
    raise RuntimeError("No opaque pixels found in right half — wrong source image?")

# Crop tightly to the X
x_only = right.crop(bbox)
xw, xh = x_only.size
print(f"X cropped to: {xw}x{xh}")

# Pad to a square (transparent), with ~8% margin so the icon breathes
size = max(xw, xh)
margin = int(size * 0.08)
canvas_size = size + 2 * margin
canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
offset = ((canvas_size - xw) // 2, (canvas_size - xh) // 2)
canvas.paste(x_only, offset, x_only)

# Resize to 256x256 PNG (modern favicons)
favicon_png = canvas.resize((256, 256), Image.LANCZOS)
favicon_png.save(ASSETS / "aorix_x_favicon.png", optimize=True)
print(f"Wrote: aorix_x_favicon.png ({(ASSETS / 'aorix_x_favicon.png').stat().st_size} bytes)")

# Multi-size .ico for legacy browsers (esp. Windows pinned tabs)
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
favicon_ico = canvas.resize((64, 64), Image.LANCZOS)
favicon_ico.save(ASSETS / "favicon.ico", format="ICO", sizes=ico_sizes)
print(f"Wrote: favicon.ico ({(ASSETS / 'favicon.ico').stat().st_size} bytes)")
