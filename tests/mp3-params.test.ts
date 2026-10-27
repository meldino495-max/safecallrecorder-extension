import { describe, expect, it } from "vitest";
import { mixToMono, outputSampleRateForMp3, resamplePcm, shouldExportMono, toMp3Kbps } from "../src/mp3-params";

describe("mp3 params", () => {
  it("converts bps to kbps without treating 16000 as kbps", () => {
    expect(toMp3Kbps(16000)).toBe(16);
    expect(toMp3Kbps(64000)).toBe(64);
    expect(toMp3Kbps(128000)).toBe(128);
  });

  it("forces mono only for the two lowest presets", () => {
    expect(shouldExportMono(16000)).toBe(true);
    expect(shouldExportMono(24000)).toBe(true);
    expect(shouldExportMono(32000)).toBe(false);
    expect(shouldExportMono(48000)).toBe(false);
    expect(shouldExportMono(64000)).toBe(false);
  });

  it("keeps the capture sample rate except for 16 and 24 kbps", () => {
    // 22050/24000 make lamejs 1.2.1 export a silent 16/24 kbps file.
    expect(outputSampleRateForMp3(16000, 48000)).toBe(16000);
    expect(outputSampleRateForMp3(24000, 48000)).toBe(16000);
    expect(outputSampleRateForMp3(16000, 8000)).toBe(8000);
    expect(outputSampleRateForMp3(32000, 48000)).toBe(48000);
    expect(outputSampleRateForMp3(48000, 48000)).toBe(48000);
    expect(outputSampleRateForMp3(64000, 48000)).toBe(48000);
    expect(outputSampleRateForMp3(128000, 48000)).toBe(48000);
  });

  it("resamples pcm to the shorter low-rate buffer and rejects highs above the new nyquist", () => {
    const input = new Float32Array(48000);
    const out = resamplePcm(input, 48000, 24000);
    expect(out.length).toBe(24000);

    const n = 4800;
    const high = new Float32Array(n);
    const low = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      high[i] = Math.sin((2 * Math.PI * 12000 * i) / 48000);
      low[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000);
    }
    const highOut = resamplePcm(high, 48000, 24000);
    const lowOut = resamplePcm(low, 48000, 24000);
    const rms = (samples: Float32Array) => {
      let s = 0;
      const start = Math.floor(samples.length * 0.2);
      const end = Math.floor(samples.length * 0.8);
      for (let i = start; i < end; i++) s += samples[i]! * samples[i]!;
      return Math.sqrt(s / (end - start));
    };
    expect(rms(highOut)).toBeLessThan(rms(lowOut) * 0.25);
  });

  it("mixes stereo to mono without inventing noise", () => {
    const left = new Float32Array([0.5, -0.5]);
    const right = new Float32Array([0.5, 0.5]);
    const mono = mixToMono(left, right);
    expect(mono[0]).toBeCloseTo(0.5);
    expect(mono[1]).toBeCloseTo(0);
  });
});
