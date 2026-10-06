"""Vectoriza design/logo-original.jfif a SVG (sin fondo, un solo color).

Uso (desde la raíz del proyecto):  python design/trace_logo.py

Genera:
  public/logo.svg        logo completo (marca + nombre), color fijo
  public/logo-mark.svg   solo la marca (la R con la palomita)
  app/icon.svg           favicon (la marca)
  lib/logo-paths.ts      datos de las curvas para components/Logo.tsx, que
                         usa currentColor y por eso funciona en claro y oscuro

Requiere pillow, numpy y matplotlib (contourpy). El logo original es de un
solo color, así que se convierte en una máscara de cobertura, se amplía y se
traza con curvas de Bézier conservando las esquinas vivas.
"""
import os
import sys

import numpy as np
from contourpy import contour_generator
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, 'design', 'logo-original.jfif')

ESCALA = 6          # ampliación antes de trazar (precisión de subpíxel)
RDP_EPS = 0.22      # tolerancia de simplificación, en píxeles originales
ANGULO_ESQUINA = 38  # grados: por encima de esto el vértice es una esquina
AREA_MIN = 4.0      # descarta motas de ruido JPEG (px² originales)
Y_CORTE = 335       # altura (en la imagen original) donde empieza el nombre "EasyReq"
COLOR = '#0d0d12'


def cargar_cobertura():
    im = Image.open(ORIGEN).convert('L')
    g = np.asarray(im, dtype=np.float32)
    # El fondo es papel casi blanco y la tinta es gris azulado oscuro
    fondo, tinta = 248.0, 52.0
    cob = np.clip((fondo - g) / (fondo - tinta), 0, 1)
    ys, xs = np.where(cob > 0.5)
    # Solo el logo: la maqueta tiene sombras en los bordes
    caja = (xs.min() - 8, ys.min() - 8, xs.max() + 9, ys.max() + 9)
    cob = cob[caja[1]:caja[3], caja[0]:caja[2]]
    return cob, caja[1]


def rdp(pts, eps):
    """Douglas-Peucker para una polilínea abierta (Nx2)."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    n = np.hypot(*ab)
    if n == 0:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        izq = rdp(pts[: i + 1], eps)
        der = rdp(pts[i:], eps)
        return np.vstack([izq[:-1], der])
    return np.vstack([a, b])


def simplificar_cerrado(pts, eps):
    """RDP para un lazo cerrado: parte desde dos puntos opuestos."""
    p = pts[:-1]
    n = len(p)
    j = int(np.argmax(np.hypot(*(p - p[0]).T)))
    a = rdp(np.vstack([p[: j + 1]]), eps)
    b = rdp(np.vstack([p[j:], p[:1]]), eps)
    return np.vstack([a[:-1], b[:-1]])


def angulo_giro(prev, cur, nxt):
    v1, v2 = cur - prev, nxt - cur
    n1, n2 = np.hypot(*v1), np.hypot(*v2)
    if n1 == 0 or n2 == 0:
        return 0.0
    c = np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1)
    return float(np.degrees(np.arccos(c)))


def lazo_a_ruta(v):
    """Vértices de un lazo cerrado -> comandos de ruta SVG con Béziers suaves
    entre esquinas y esquinas vivas donde el giro es brusco."""
    n = len(v)
    esquina = [angulo_giro(v[i - 1], v[i], v[(i + 1) % n]) > ANGULO_ESQUINA for i in range(n)]
    if not any(esquina):
        esquina[0] = True

    def fmt(p):
        return f'{p[0]:.2f} {p[1]:.2f}'

    # Reordenar para empezar en una esquina
    i0 = esquina.index(True)
    v = np.roll(v, -i0, axis=0)
    esquina = esquina[i0:] + esquina[:i0]

    partes = [f'M{fmt(v[0])}']
    for i in range(n):
        p1, p2 = v[i], v[(i + 1) % n]
        p0 = v[i - 1]
        p3 = v[(i + 2) % n]
        # En una esquina la tangente se aplana hacia el propio segmento
        t1 = (p2 - p1) if esquina[i] else (p2 - p0) / 2
        t2 = (p2 - p1) if esquina[(i + 1) % n] else (p3 - p1) / 2
        if esquina[i] and esquina[(i + 1) % n]:
            partes.append(f'L{fmt(p2)}')
        else:
            c1 = p1 + t1 / 3
            c2 = p2 - t2 / 3
            partes.append(f'C{fmt(c1)} {fmt(c2)} {fmt(p2)}')
    partes.append('Z')
    return ''.join(partes)


def area(pts):
    x, y = pts[:, 0], pts[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def main():
    cob, y_off = cargar_cobertura()
    h, w = cob.shape
    grande = np.asarray(
        Image.fromarray(cob).resize((w * ESCALA, h * ESCALA), Image.BICUBIC), dtype=np.float32
    )
    gen = contour_generator(z=grande)
    lazos = []
    for linea in gen.lines(0.5):
        pts = np.asarray(linea, dtype=np.float64)
        if len(pts) < 8 or not np.allclose(pts[0], pts[-1]):
            continue
        pts = (pts + 0.5) / ESCALA - 0.5 + 0.5  # centro de píxel -> coordenadas originales
        if area(pts[:-1]) < AREA_MIN:
            continue
        v = simplificar_cerrado(pts, RDP_EPS)
        lazos.append(v)

    marca = [v for v in lazos if v[:, 1].mean() < Y_CORTE - y_off]
    nombre = [v for v in lazos if v[:, 1].mean() >= Y_CORTE - y_off]
    print('lazos:', len(lazos), 'marca:', len(marca), 'nombre:', len(nombre))

    def caja(grupo):
        t = np.vstack(grupo)
        return t[:, 0].min(), t[:, 1].min(), t[:, 0].max(), t[:, 1].max()

    def construir(grupo, ref):
        x0, y0, x1, y1 = ref
        ruta = ''.join(lazo_a_ruta(v - np.array([x0, y0])) for v in grupo)
        return ruta, (x1 - x0, y1 - y0)

    todo = caja(lazos)
    ruta_todo, (wt, ht) = construir(lazos, todo)
    cm = caja(marca)
    ruta_marca, (wm, hm) = construir(marca, cm)
    cn = caja(nombre)
    ruta_nombre, (wn, hn) = construir(nombre, cn)

    PAD = 2.0  # margen alrededor del logo en los SVG sueltos

    def svg(ruta, ancho, alto, titulo):
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-PAD:.2f} {-PAD:.2f} {ancho + 2 * PAD:.2f} {alto + 2 * PAD:.2f}" '
            f'role="img" aria-label="{titulo}"><title>{titulo}</title>'
            f'<path fill="{COLOR}" fill-rule="evenodd" d="{ruta}"/></svg>\n'
        )

    open(os.path.join(RAIZ, 'public', 'logo.svg'), 'w', encoding='utf-8').write(
        svg(ruta_todo, wt, ht, 'EasyReq')
    )
    open(os.path.join(RAIZ, 'public', 'logo-mark.svg'), 'w', encoding='utf-8').write(
        svg(ruta_marca, wm, hm, 'EasyReq')
    )
    # Favicon: la marca con un margen del 12 %, clara en pestañas oscuras
    m = max(wm, hm) * 0.12
    lado = max(wm, hm) + 2 * m
    ruta_icon = ''.join(
        lazo_a_ruta(v - np.array([cm[0] - m - (lado - 2 * m - wm) / 2, cm[1] - m - (lado - 2 * m - hm) / 2]))
        for v in marca
    )
    open(os.path.join(RAIZ, 'app', 'icon.svg'), 'w', encoding='utf-8').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {lado:.2f} {lado:.2f}">'
        f'<style>path{{fill:{COLOR}}}@media (prefers-color-scheme:dark){{path{{fill:#f2f2f6}}}}</style>'
        f'<path fill-rule="evenodd" d="{ruta_icon}"/></svg>\n'
    )

    # Datos para components/Logo.tsx (la posición es respecto al logo completo)
    ts = (
        '// Generado por design/trace_logo.py. No editar a mano.\n'
        f'export const LOGO_TOTAL = {{ ancho: {wt:.2f}, alto: {ht:.2f} }};\n'
        f'export const LOGO_MARCA = {{ d: "{ruta_marca}", ancho: {wm:.2f}, alto: {hm:.2f}, x: {cm[0] - todo[0]:.2f}, y: {cm[1] - todo[1]:.2f} }};\n'
        f'export const LOGO_NOMBRE = {{ d: "{ruta_nombre}", ancho: {wn:.2f}, alto: {hn:.2f}, x: {cn[0] - todo[0]:.2f}, y: {cn[1] - todo[1]:.2f} }};\n'
    )
    open(os.path.join(RAIZ, 'lib', 'logo-paths.ts'), 'w', encoding='utf-8').write(ts)
    print('marca', round(wm), 'x', round(hm), '| nombre', round(wn), 'x', round(hn), '| total', round(wt), 'x', round(ht))
    for f in ('public/logo.svg', 'public/logo-mark.svg', 'app/icon.svg', 'lib/logo-paths.ts'):
        print(f, os.path.getsize(os.path.join(RAIZ, f)), 'bytes')


if __name__ == '__main__':
    sys.exit(main())
