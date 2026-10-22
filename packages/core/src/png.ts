// A small PNG decoder (no I/O), for reading a logo's pixels where the platform gives none: the
// Android app shrinks the logo to a PNG (expo-image-manipulator) and decodes it here for
// logoPalette. Non-interlaced PNGs of every color type; 16-bit samples keep their high byte.

export interface DecodedImage {
  width: number;
  height: number;
  /** Row by row, 4 bytes a pixel: red, green, blue, alpha. */
  rgba: Uint8Array;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 (as image-manipulator returns it) to bytes. Whitespace and padding are ignored. */
export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (const ch of clean) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

// ---------------------------------------------------------------------------
// DEFLATE (RFC 1951), after zlib's 2-byte header
// ---------------------------------------------------------------------------

interface Huffman {
  count: Uint16Array;
  symbol: Uint16Array;
}

function huffman(lengths: ArrayLike<number>, n: number): Huffman {
  const count = new Uint16Array(16);
  const symbol = new Uint16Array(n);
  for (let s = 0; s < n; s++) count[lengths[s] ?? 0]!++;
  count[0] = 0;
  const offs = new Uint16Array(16);
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len]! + count[len]!;
  for (let s = 0; s < n; s++) {
    const len = lengths[s] ?? 0;
    if (len) symbol[offs[len]!++] = s;
  }
  return { count, symbol };
}

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CODE_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** zlib-wrapped DEFLATE data to bytes. */
export function inflate(src: Uint8Array): Uint8Array {
  let pos = 2; // zlib header (CMF, FLG); no preset dictionary in PNG
  let buf = 0;
  let cnt = 0;
  let out = new Uint8Array(Math.max(1024, src.length * 4));
  let o = 0;
  const fail = (): never => {
    throw new Error("Not a readable PNG");
  };
  const bits = (n: number) => {
    let v = buf;
    while (cnt < n) {
      if (pos >= src.length) fail();
      v |= src[pos++]! << cnt;
      cnt += 8;
    }
    buf = v >>> n;
    cnt -= n;
    return v & ((1 << n) - 1);
  };
  const put = (b: number) => {
    if (o >= out.length) {
      const bigger = new Uint8Array(out.length * 2);
      bigger.set(out);
      out = bigger;
    }
    out[o++] = b;
  };
  const decode = (h: Huffman) => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = h.count[len]!;
      if (code - count < first) return h.symbol[index + (code - first)]!;
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    return fail();
  };
  const codes = (lit: Huffman, dist: Huffman) => {
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) put(sym);
      else if (sym === 256) return;
      else {
        const li = sym - 257;
        if (li >= 29) fail();
        const len = LEN_BASE[li]! + bits(LEN_EXTRA[li]!);
        const di = decode(dist);
        if (di >= 30) fail();
        const d = DIST_BASE[di]! + bits(DIST_EXTRA[di]!);
        if (d > o) fail();
        for (let k = 0; k < len; k++) put(out[o - d]!);
      }
    }
  };

  let fixed: [Huffman, Huffman] | null = null;
  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      buf = 0;
      cnt = 0;
      if (pos + 4 > src.length) fail();
      const len = src[pos]! | (src[pos + 1]! << 8);
      pos += 4;
      if (pos + len > src.length) fail();
      for (let k = 0; k < len; k++) put(src[pos++]!);
    } else if (type === 1) {
      if (!fixed) {
        const l = new Uint8Array(288);
        l.fill(8, 0, 144);
        l.fill(9, 144, 256);
        l.fill(7, 256, 280);
        l.fill(8, 280, 288);
        fixed = [huffman(l, 288), huffman(new Uint8Array(30).fill(5), 30)];
      }
      codes(fixed[0], fixed[1]);
    } else if (type === 2) {
      const nlen = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      const lengths = new Uint8Array(320);
      for (let k = 0; k < ncode; k++) lengths[CODE_ORDER[k]!] = bits(3);
      const lencode = huffman(lengths, 19);
      lengths.fill(0);
      let k = 0;
      while (k < nlen + ndist) {
        const sym = decode(lencode);
        if (sym < 16) lengths[k++] = sym;
        else {
          let len = 0;
          let rep: number;
          if (sym === 16) {
            if (k === 0) fail();
            len = lengths[k - 1]!;
            rep = 3 + bits(2);
          } else if (sym === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (k + rep > nlen + ndist) fail();
          while (rep--) lengths[k++] = len;
        }
      }
      codes(huffman(lengths, nlen), huffman(lengths.subarray(nlen), ndist));
    } else fail();
  }
  return out.subarray(0, o);
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** A PNG file's pixels as RGBA. Throws on anything it can't read (interlaced, broken). */
export function decodePng(bytes: Uint8Array): DecodedImage {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || sig.some((v, i) => bytes[i] !== v)) throw new Error("Not a PNG");
  const u32 = (i: number) =>
    ((bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let p = 8;
  while (p + 8 <= bytes.length) {
    const len = u32(p);
    const name = String.fromCharCode(bytes[p + 4]!, bytes[p + 5]!, bytes[p + 6]!, bytes[p + 7]!);
    const data = bytes.subarray(p + 8, p + 8 + len);
    if (name === "IHDR") {
      width = u32(p + 8);
      height = u32(p + 12);
      depth = data[8]!;
      type = data[9]!;
      if (data[12]) throw new Error("Interlaced PNGs aren't read");
    } else if (name === "PLTE") palette = data;
    else if (name === "tRNS") trns = data;
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
    p += 12 + len;
  }
  const channels = CHANNELS[type];
  if (!width || !height || !channels || ![1, 2, 4, 8, 16].includes(depth))
    throw new Error("Not a readable PNG");
  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let at = 0;
  for (const d of idat) {
    joined.set(d, at);
    at += d.length;
  }
  const raw = inflate(joined);

  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  if (raw.length < height * (stride + 1)) throw new Error("Not a readable PNG");
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x]!;
      const a = x >= bpp ? rows[dst + x - bpp]! : 0;
      const b = y > 0 ? rows[dst - stride + x]! : 0;
      const c = x >= bpp && y > 0 ? rows[dst - stride + x - bpp]! : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error("Not a readable PNG");
      rows[dst + x] = (v + pred) & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  const sample = (row: number, i: number) => {
    // The i-th sample of a row, scaled to 0–255 (palette indexes left as they are).
    if (depth === 8) return rows[row + i]!;
    if (depth === 16) return rows[row + i * 2]!;
    const perByte = 8 / depth;
    const byte = rows[row + Math.floor(i / perByte)]!;
    const shift = 8 - depth * ((i % perByte) + 1);
    const v = (byte >> shift) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const q = (y * width + x) * 4;
      const s = x * channels;
      let r: number;
      let g: number;
      let b: number;
      let a = 255;
      if (type === 3) {
        const idx = sample(row, s);
        r = palette?.[idx * 3] ?? 0;
        g = palette?.[idx * 3 + 1] ?? 0;
        b = palette?.[idx * 3 + 2] ?? 0;
        a = trns && idx < trns.length ? trns[idx]! : 255;
      } else if (type === 0 || type === 4) {
        r = g = b = sample(row, s);
        if (type === 4) a = sample(row, s + 1);
      } else {
        r = sample(row, s);
        g = sample(row, s + 1);
        b = sample(row, s + 2);
        if (type === 6) a = sample(row, s + 3);
      }
      rgba[q] = r;
      rgba[q + 1] = g;
      rgba[q + 2] = b;
      rgba[q + 3] = a;
    }
  }
  return { width, height, rgba };
}
