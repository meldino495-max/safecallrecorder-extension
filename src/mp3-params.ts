export function toMp3Kbps(audioBitsPerSecond: number): number {
  const kbps = Math.round(audioBitsPerSecond / 1000);
  if (!Number.isFinite(kbps) || kbps < 8 || kbps > 320) {
    throw new Error(`不支持的 MP3 比特率参数：${audioBitsPerSecond} bps`);
  }
  return kbps;
}

/**
 * Only the two lowest presets are too starved for stereo.
 * Mixing wider stereo down to mono can cancel and sound thin or electric.
 */
export function shouldExportMono(audioBitsPerSecond: number): boolean {
  return toMp3Kbps(audioBitsPerSecond) <= 24;
}

/**
 * lamejs 1.2.1 writes a normal-looking MP3 that decodes as silence for
 * 16/24 kbps mono at 22050 Hz and 24000 Hz. 16 kHz stays audible.
 */
const LAMEJS_SILENT_LOW_RATE = new Set([22050, 24000]);

/**
 * Sample rate where the requested CBR step is legal and lamejs keeps the sound.
 * MPEG-1 (44.1/48 kHz) has no 16 or 24 kbps. 32 kbps and above stay at the capture rate.
 */
export function outputSampleRateForMp3(bitrateBps: number, inputRate: number): number {
  const kbps = toMp3Kbps(bitrateBps);
  const input = inputRate > 0 ? inputRate : 48000;
  let out = kbps <= 24 ? 16000 : input >= 44100 ? (input >= 48000 ? 48000 : 44100) : 44100;
  if (input < out) {
    const legal = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
    const silent = kbps <= 24 ? LAMEJS_SILENT_LOW_RATE : undefined;
    out = legal.reduce(
      (best, rate) => (rate <= input && rate > best && !silent?.has(rate) ? rate : best),
      legal[0]!
    );
  }
  return out;
}

function lowpassKernel(cutoffCycles: number, taps: number): Float32Array {
  const kernel = new Float32Array(taps);
  const mid = (taps - 1) / 2;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - mid;
    const sinc = x === 0 ? 2 * cutoffCycles : Math.sin(2 * Math.PI * cutoffCycles * x) / (Math.PI * x);
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1));
    kernel[i] = sinc * window;
    sum += kernel[i]!;
  }
  if (sum !== 0) {
    for (let i = 0; i < taps; i++) kernel[i] = kernel[i]! / sum;
  }
  return kernel;
}

/**
 * Resample with a low-pass first. Plain linear interpolation folds highs into chirps.
 */
export function resamplePcm(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (input.length === 0 || inRate <= 0 || outRate <= 0 || inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  if (outRate > inRate) {
    const out = new Float32Array(outLen);
    const last = input.length - 1;
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio;
      const i0 = Math.min(last, Math.floor(src));
      const i1 = Math.min(last, i0 + 1);
      const t = src - i0;
      out[i] = input[i0]! * (1 - t) + input[i1]! * t;
    }
    return out;
  }
  const taps = 31;
  const kernel = lowpassKernel(0.45 / ratio, taps);
  const mid = (taps - 1) / 2;
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const center = Math.round(i * ratio);
    let acc = 0;
    for (let k = 0; k < taps; k++) {
      const idx = center + k - mid;
      if (idx < 0 || idx >= input.length) continue;
      acc += input[idx]! * kernel[k]!;
    }
    out[i] = acc;
  }
  return out;
}

export function mixToMono(left: Float32Array, right?: Float32Array): Float32Array {
  if (!right) return left;
  const n = Math.min(left.length, right.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = (left[i]! + right[i]!) * 0.5;
    out[i] = Math.max(-1, Math.min(1, v));
  }
  return out;
}
