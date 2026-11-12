#!/usr/bin/env python3
"""Builds build/icon.ico from build/icons/*.png (dev-time only, needs Pillow).

Small sizes are stored as classic 32-bit BMP entries and 256px as PNG, which is the
layout Windows, NSIS and resource editors all accept.
"""
import os
import struct
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SIZES = [16, 24, 32, 48, 64, 128, 256]


def bmp_entry(img):
    w, h = img.size
    px = img.convert('RGBA').tobytes('raw', 'BGRA')
    rows = [px[y * w * 4:(y + 1) * w * 4] for y in range(h)]
    xor = b''.join(reversed(rows))
    mask_row = ((w + 31) // 32) * 4
    and_mask = b'\x00' * (mask_row * h)
    header = struct.pack('<IiiHHIIiiII', 40, w, h * 2, 1, 32, 0, len(xor) + len(and_mask), 0, 0, 0, 0)
    return header + xor + and_mask


entries = []
for s in SIZES:
    path = os.path.join(ROOT, 'build', 'icons', '%d.png' % s)
    if s == 256:
        with open(path, 'rb') as f:
            data = f.read()
    else:
        data = bmp_entry(Image.open(path))
    entries.append((s, data))

out = struct.pack('<HHH', 0, 1, len(entries))
offset = 6 + 16 * len(entries)
for s, data in entries:
    out += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
for _, data in entries:
    out += data

with open(os.path.join(ROOT, 'build', 'icon.ico'), 'wb') as f:
    f.write(out)
print('build/icon.ico', len(out), 'bytes')
