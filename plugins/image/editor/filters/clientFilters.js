// All filters operate on an OffscreenCanvas in-place

function getImageData(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
}
function putImageData(canvas, id) {
  canvas.getContext('2d').putImageData(id, 0, 0)
}
function clamp(v) { return Math.max(0, Math.min(255, v)) }

// ── Pixel-level adjustments ────────────────────────────────────────────────────

export function brightness(canvas, { value = 0 } = {}) {
  const id = getImageData(canvas)
  const d = id.data, v = value * 255
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] + v); d[i+1] = clamp(d[i+1] + v); d[i+2] = clamp(d[i+2] + v)
  }
  putImageData(canvas, id)
}

export function contrast(canvas, { value = 0 } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  const factor = (259 * (value * 255 + 255)) / (255 * (259 - value * 255))
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(factor * (d[i] - 128) + 128)
    d[i+1] = clamp(factor * (d[i+1] - 128) + 128)
    d[i+2] = clamp(factor * (d[i+2] - 128) + 128)
  }
  putImageData(canvas, id)
}

export function brightness_contrast(canvas, { brightness: bv = 0, contrast: cv = 0 } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  const bAdd = bv * 255
  const cFactor = (259 * (cv * 255 + 255)) / (255 * (259 - cv * 255))
  for (let i = 0; i < d.length; i += 4) {
    d[i]   = clamp(cFactor * (clamp(d[i]   + bAdd) - 128) + 128)
    d[i+1] = clamp(cFactor * (clamp(d[i+1] + bAdd) - 128) + 128)
    d[i+2] = clamp(cFactor * (clamp(d[i+2] + bAdd) - 128) + 128)
  }
  putImageData(canvas, id)
}

export function hue_saturation_lightness(canvas, { hue = 0, saturation = 0, lightness = 0 } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i+1] / 255, b = d[i+2] / 255
    const max = Math.max(r,g,b), min = Math.min(r,g,b)
    let h = 0, s = 0, l = (max + min) / 2
    if (max !== min) {
      const d2 = max - min
      s = l > 0.5 ? d2 / (2 - max - min) : d2 / (max + min)
      if (max === r) h = ((g - b) / d2 + 6) % 6
      else if (max === g) h = (b - r) / d2 + 2
      else h = (r - g) / d2 + 4
      h *= 60
    }
    h = (h + hue + 360) % 360
    s = Math.max(0, Math.min(1, s + saturation))
    l = Math.max(0, Math.min(1, l + lightness))
    // HSL to RGB
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs((h / 60) % 2 - 1))
    const m2 = l - c / 2
    let rr, gg, bb
    const hi = Math.floor(h / 60)
    if (hi === 0) { rr=c; gg=x; bb=0 }
    else if (hi === 1) { rr=x; gg=c; bb=0 }
    else if (hi === 2) { rr=0; gg=c; bb=x }
    else if (hi === 3) { rr=0; gg=x; bb=c }
    else if (hi === 4) { rr=x; gg=0; bb=c }
    else { rr=c; gg=0; bb=x }
    d[i] = clamp((rr + m2) * 255)
    d[i+1] = clamp((gg + m2) * 255)
    d[i+2] = clamp((bb + m2) * 255)
  }
  putImageData(canvas, id)
}

export function exposure(canvas, { value = 0 } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  const factor = Math.pow(2, value)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] * factor); d[i+1] = clamp(d[i+1] * factor); d[i+2] = clamp(d[i+2] * factor)
  }
  putImageData(canvas, id)
}

export function vibrance(canvas, { value = 0 } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2]
    const max = Math.max(r, g, b), avg = (r + g + b) / 3
    const amt = (max - avg) / 255 * value
    d[i]   = clamp(r + (max - r) * amt)
    d[i+1] = clamp(g + (max - g) * amt)
    d[i+2] = clamp(b + (max - b) * amt)
  }
  putImageData(canvas, id)
}

export function color_balance(canvas, { shadows = [0,0,0], midtones = [0,0,0], highlights = [0,0,0] } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) / 255
    const sf = Math.max(0, 0.5 - lum) * 2      // shadow weight
    const hf = Math.max(0, lum - 0.5) * 2      // highlight weight
    const mf = 1 - sf - hf                     // midtone weight
    for (let c = 0; c < 3; c++) {
      d[i+c] = clamp(d[i+c] + (shadows[c]*sf + midtones[c]*mf + highlights[c]*hf))
    }
  }
  putImageData(canvas, id)
}

export function shadows_highlights(canvas, { shadows = 0, highlights = 0 } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) / 255
    const sf = Math.max(0, 1 - lum * 2)
    const hf = Math.max(0, lum * 2 - 1)
    const adj = sf * shadows * 255 + hf * highlights * 255
    d[i]   = clamp(d[i]   + adj)
    d[i+1] = clamp(d[i+1] + adj)
    d[i+2] = clamp(d[i+2] + adj)
  }
  putImageData(canvas, id)
}

// Apply a 256-entry LUT per channel
export function apply_lut(canvas, lutR, lutG, lutB) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lutR[d[i]]; d[i+1] = lutG[d[i+1]]; d[i+2] = lutB[d[i+2]]
  }
  putImageData(canvas, id)
}

// ── Simple filters ─────────────────────────────────────────────────────────────

export function invert(canvas) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i]; d[i+1] = 255 - d[i+1]; d[i+2] = 255 - d[i+2]
  }
  putImageData(canvas, id)
}

export function grayscale(canvas) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const v = clamp(d[i] * 0.2126 + d[i+1] * 0.7152 + d[i+2] * 0.0722)
    d[i] = d[i+1] = d[i+2] = v
  }
  putImageData(canvas, id)
}

export function sepia(canvas) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2]
    d[i]   = clamp(r * 0.393 + g * 0.769 + b * 0.189)
    d[i+1] = clamp(r * 0.349 + g * 0.686 + b * 0.168)
    d[i+2] = clamp(r * 0.272 + g * 0.534 + b * 0.131)
  }
  putImageData(canvas, id)
}

export function vignette(canvas, { strength = 0.5, radius = 0.75 } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  const w = canvas.width, h = canvas.height
  const cx = w / 2, cy = h / 2
  const maxDist = Math.sqrt(cx * cx + cy * cy)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist
      const factor = 1 - Math.max(0, (dist - radius) / (1 - radius)) * strength
      d[i] = clamp(d[i] * factor)
      d[i+1] = clamp(d[i+1] * factor)
      d[i+2] = clamp(d[i+2] * factor)
    }
  }
  putImageData(canvas, id)
}

export function noise(canvas, { amount = 25, monochrome = false } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    if (monochrome) {
      const n = (Math.random() - 0.5) * amount * 2
      d[i] = clamp(d[i] + n); d[i+1] = clamp(d[i+1] + n); d[i+2] = clamp(d[i+2] + n)
    } else {
      d[i]   = clamp(d[i]   + (Math.random() - 0.5) * amount * 2)
      d[i+1] = clamp(d[i+1] + (Math.random() - 0.5) * amount * 2)
      d[i+2] = clamp(d[i+2] + (Math.random() - 0.5) * amount * 2)
    }
  }
  putImageData(canvas, id)
}

export function pixelate(canvas, { size = 10 } = {}) {
  const id = getImageData(canvas)
  const d = id.data
  const w = canvas.width, h = canvas.height
  const s = Math.max(1, Math.round(size))
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      let r = 0, g = 0, b = 0, count = 0
      for (let dy = 0; dy < s && y + dy < h; dy++) {
        for (let dx = 0; dx < s && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4
          r += d[i]; g += d[i+1]; b += d[i+2]; count++
        }
      }
      r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count)
      for (let dy = 0; dy < s && y + dy < h; dy++) {
        for (let dx = 0; dx < s && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4
          d[i] = r; d[i+1] = g; d[i+2] = b
        }
      }
    }
  }
  putImageData(canvas, id)
}

// Gaussian blur via separable kernel
export function gaussian_blur(canvas, { radius = 3 } = {}) {
  const r = Math.max(1, Math.round(radius))
  const id = getImageData(canvas)
  const w = canvas.width, h = canvas.height
  const kernel = buildGaussianKernel(r)
  const kLen = kernel.length
  const tmp = new Float32Array(w * h * 4)

  // Horizontal pass
  const src = id.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = [0,0,0,0]
      for (let k = 0; k < kLen; k++) {
        const xi = Math.max(0, Math.min(w - 1, x + k - r))
        const pi = (y * w + xi) * 4
        const kv = kernel[k]
        acc[0] += src[pi] * kv; acc[1] += src[pi+1] * kv
        acc[2] += src[pi+2] * kv; acc[3] += src[pi+3] * kv
      }
      const oi = (y * w + x) * 4
      tmp[oi] = acc[0]; tmp[oi+1] = acc[1]; tmp[oi+2] = acc[2]; tmp[oi+3] = acc[3]
    }
  }

  // Vertical pass into id.data
  const out = id.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = [0,0,0,0]
      for (let k = 0; k < kLen; k++) {
        const yi = Math.max(0, Math.min(h - 1, y + k - r))
        const pi = (yi * w + x) * 4
        const kv = kernel[k]
        acc[0] += tmp[pi] * kv; acc[1] += tmp[pi+1] * kv
        acc[2] += tmp[pi+2] * kv; acc[3] += tmp[pi+3] * kv
      }
      const oi = (y * w + x) * 4
      out[oi] = clamp(acc[0]); out[oi+1] = clamp(acc[1])
      out[oi+2] = clamp(acc[2]); out[oi+3] = clamp(acc[3])
    }
  }
  putImageData(canvas, id)
}

function buildGaussianKernel(r) {
  const sigma = r / 3
  const size = 2 * r + 1
  const kernel = new Float32Array(size)
  let sum = 0
  for (let i = 0; i < size; i++) {
    const x = i - r
    kernel[i] = Math.exp(-x * x / (2 * sigma * sigma))
    sum += kernel[i]
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum
  return kernel
}

export function sharpen(canvas, { amount = 0.5 } = {}) {
  // Unsharp mask via separate blur
  const blurred = new OffscreenCanvas(canvas.width, canvas.height)
  blurred.getContext('2d').drawImage(canvas, 0, 0)
  gaussian_blur(blurred, { radius: 2 })

  const orig = getImageData(canvas)
  const blur = blurred.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
  const d = orig.data, b = blur.data
  for (let i = 0; i < d.length; i += 4) {
    d[i]   = clamp(d[i]   + (d[i]   - b[i])   * amount * 3)
    d[i+1] = clamp(d[i+1] + (d[i+1] - b[i+1]) * amount * 3)
    d[i+2] = clamp(d[i+2] + (d[i+2] - b[i+2]) * amount * 3)
  }
  putImageData(canvas, orig)
}

export function emboss(canvas) {
  const kernel = [-2,-1,0,-1,1,1,0,1,2]
  convolve3x3(canvas, kernel)
}

export function edge_detect(canvas) {
  const kernel = [-1,-1,-1,-1,8,-1,-1,-1,-1]
  convolve3x3(canvas, kernel)
}

function convolve3x3(canvas, kernel) {
  const id = getImageData(canvas)
  const { data: src, width: w, height: h } = id
  const out = new Uint8ClampedArray(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const xi = Math.max(0, Math.min(w-1, x+kx))
          const yi = Math.max(0, Math.min(h-1, y+ky))
          const pi = (yi * w + xi) * 4
          const ki = (ky + 1) * 3 + (kx + 1)
          r += src[pi] * kernel[ki]; g += src[pi+1] * kernel[ki]; b += src[pi+2] * kernel[ki]
        }
      }
      const oi = (y * w + x) * 4
      out[oi] = clamp(r); out[oi+1] = clamp(g); out[oi+2] = clamp(b); out[oi+3] = src[oi+3]
    }
  }
  putImageData(canvas, new ImageData(out, w, h))
}

export const ALL_FILTERS = {
  brightness, contrast, brightness_contrast,
  hue_saturation_lightness, exposure, vibrance,
  color_balance, shadows_highlights, apply_lut,
  invert, grayscale, sepia, vignette, noise, pixelate,
  gaussian_blur, sharpen, emboss, edge_detect,
}
