#!/usr/bin/env python3
"""
Recorta las hojas de props de SpriteCook en sprites y escribe apps/web/public/map/atlas.json.

Uso: python3 scripts/slice-sheets.py
Lee apps/web/public/map/props-edificios.png y props-naturaleza.png (fondo transparente, objetos en
rejilla), agrupa los píxeles opacos en objetos (componentes conexas con un pequeño cierre para no
partir un objeto en trozos), los ordena por filas y les asigna su clave en el orden del encargo.
Imprime un informe (nº de objetos, tamaños) y falla si una hoja no trae los objetos esperados.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/web/public/map'

# Orden del encargo (izquierda a derecha, arriba abajo) y ancho real del objeto en el sprite (foot).
SHEETS = [
    ('props-edificios.png', ['obelisk:0', 'house:0', 'house:1', 'house:2', 'house:3', 'ruin:0', 'ruin:1', 'ruin:2', 'cave:0', 'spring:0', 'well:0', 'brazier:0']),
    ('props-naturaleza.png', ['tree:0', 'tree:1', 'tree:2', 'tree:3', 'conifer:0', 'conifer:1', 'deadtree:0', 'bush:0', 'bush:1', 'rock:0', 'rock:1', 'rock:2', 'crag:0', 'crag:1', 'peak:0', 'reeds:0']),
]


def components(alpha: np.ndarray, gap: int):
    """Cajas de los grupos de píxeles opacos; píxeles a menos de `gap` se consideran del mismo objeto."""
    h, w = alpha.shape
    mask = alpha > 24
    # Cierre barato: dilatar la máscara con un cuadrado de lado 2·gap+1.
    grown = mask.copy()
    for _ in range(gap):
        g = grown.copy()
        g[1:, :] |= grown[:-1, :]
        g[:-1, :] |= grown[1:, :]
        g[:, 1:] |= grown[:, :-1]
        g[:, :-1] |= grown[:, 1:]
        grown = g
    labels = np.zeros((h, w), dtype=np.int32)
    boxes = []
    n = 0
    for y in range(h):
        row = grown[y]
        for x in np.flatnonzero(row & (labels[y] == 0)):
            if labels[y, x]:
                continue
            n += 1
            stack = [(y, x)]
            labels[y, x] = n
            x0 = x1 = x
            y0 = y1 = y
            while stack:
                cy, cx = stack.pop()
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and grown[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = n
                        stack.append((ny, nx))
            # Caja ajustada a los píxeles reales (sin la dilatación).
            sub = mask[y0:y1 + 1, x0:x1 + 1] & (labels[y0:y1 + 1, x0:x1 + 1] == n)
            ys, xs = np.nonzero(sub)
            if len(xs) < 150:
                continue
            boxes.append((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1, len(xs)))
    return boxes


def grid_order(boxes):
    """Ordena por filas: agrupa por centro vertical y luego de izquierda a derecha."""
    boxes = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    rows, cur = [], []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        if cur and cy - (cur[-1][1] + cur[-1][3]) / 2 > max(40, (cur[-1][3] - cur[-1][1]) * 0.45):
            rows.append(cur)
            cur = []
        cur.append(b)
    if cur:
        rows.append(cur)
    return [b for r in rows for b in sorted(r, key=lambda b: b[0])]


def main():
    atlas = {'sheets': [], 'sprites': {}}
    manifest_path = ROOT / 'apps/web/src/assets/map/spritecook-assets.json'
    manifest = json.loads(manifest_path.read_text())
    ok = True
    for si, (name, keys) in enumerate(SHEETS):
        path = OUT / name
        if not path.exists():
            print(f'falta {path}')
            ok = False
            continue
        img = Image.open(path).convert('RGBA')
        alpha = np.array(img)[:, :, 3]
        if alpha.min() == 255:
            print(f'{name}: no tiene transparencia')
            ok = False
            continue
        boxes = grid_order(components(alpha, gap=6))
        print(f'{name}: {img.width}×{img.height}, {len(boxes)} objetos (esperados {len(keys)})')
        for b in boxes:
            print(f'   caja {b[0]},{b[1]} {b[2] - b[0]}×{b[3] - b[1]} ({b[4]} px)')
        if len(boxes) != len(keys):
            ok = False
            continue
        atlas['sheets'].append(name)
        for key, (x0, y0, x1, y1, _) in zip(keys, boxes):
            atlas['sprites'][key] = {'sheet': si, 'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0)}
        sha12 = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
        for a in manifest['assets']:
            if a['file'] == name:
                a['sha12'] = sha12
    if not ok:
        sys.exit(1)
    (OUT / 'atlas.json').write_text(json.dumps(atlas, indent=1) + '\n')
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(f"atlas.json: {len(atlas['sprites'])} sprites")


if __name__ == '__main__':
    main()
