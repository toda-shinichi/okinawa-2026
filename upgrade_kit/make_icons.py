# 產生 App 圖示（不需安裝任何套件）。用法：python3 make_icons.py
import struct, zlib, os

INDIGO = (30, 58, 95)
TERRACOTTA = (200, 75, 49)
SAND = (247, 245, 240)

def pixel(x, y, size):
    # 靛藍底、下方赤陶色海浪帶、中央米色太陽
    cx, cy, r = size / 2, size * 0.42, size * 0.2
    if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
        return SAND
    if y > size * 0.68:
        return TERRACOTTA
    return INDIGO

def write_png(path, size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixel(x, y, size))
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print('已產生', path)

os.makedirs('icons', exist_ok=True)
write_png('icons/icon-192.png', 192)
write_png('icons/icon-512.png', 512)
write_png('icons/apple-touch-icon.png', 180)
