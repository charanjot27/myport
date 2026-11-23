/** Ordered (Bayer 4×4) dithering of an SVG element into a PNG object URL, for a printed "dither lab" look. */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const cache = new Map<string, Promise<string>>();
const ready = new Map<string, string>();

const keyOf = (key: string, amount: number, width: number) => `${key}:${amount.toFixed(2)}:${width}`;

/** The finished image if this scene was already printed at this setting. */
export function peekDither(key: string, amount: number, width = 800): string | null {
  return ready.get(keyOf(key, amount, width)) ?? null;
}

function rasterize(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.width = w;
  img.height = h;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return img.decode().then(() => img);
}

/**
 * amount 0..1 blends from the clean illustration to a fully dithered print
 * (4 tones per channel, 2px dots). Results are cached per key.
 */
export function ditherSvg(key: string, source: SVGSVGElement | HTMLImageElement, amount: number, width = 800, height = 1000): Promise<string> {
  const k = keyOf(key, amount, width);
  let p = cache.get(k);
  if (!p) {
    const image = source instanceof HTMLImageElement ? Promise.resolve(source) : rasterize(source, width, height);
    p = image.then((img) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      // Cover-fit (photos may not be exactly 4:5).
      const iw = img.naturalWidth || width;
      const ih = img.naturalHeight || height;
      const scale = Math.max(width / iw, height / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
      const out = () => new Promise<string>((res, rej) => c.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error("toBlob"))), "image/png"));
      if (amount <= 0) return out();
      const data = ctx.getImageData(0, 0, width, height);
      const px = data.data;
      const dot = 2;
      const levels = 4;
      const step = 255 / (levels - 1);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const t = (BAYER[((y / dot) & 3) * 4 + ((x / dot) & 3)]! + 0.5) / 16 - 0.5;
          const i = (y * width + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const v = px[i + ch]!;
            const q = Math.max(0, Math.min(255, Math.round(v / step + t) * step));
            px[i + ch] = v + (q - v) * amount;
          }
        }
      }
      ctx.putImageData(data, 0, 0);
      return out();
    });
    p.then((u) => ready.set(k, u)).catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}
