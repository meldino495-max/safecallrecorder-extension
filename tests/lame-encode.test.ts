import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { outputSampleRateForMp3, toMp3Kbps } from "../src/mp3-params";

type Mp3Encoder = new (channels: number, sampleRate: number, kbps: number) => {
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
  flush(): Int8Array;
};

function encodeSine(Encoder: Mp3Encoder, sampleRate: number, kbps: number) {
  const encoder = new Encoder(1, sampleRate, kbps);
  const samples = new Int16Array(sampleRate);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.floor(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000);
  }
  const parts: Int8Array[] = [];
  for (let i = 0; i < samples.length; i += 1152) {
    const buf = encoder.encodeBuffer(samples.subarray(i, i + 1152));
    if (buf.length) parts.push(buf);
  }
  const end = encoder.flush();
  if (end.length) parts.push(end);
  const seen = new Set<number>();
  let total = 0;
  for (const part of parts) {
    total += part.length;
    for (const byte of part) seen.add(byte & 0xff);
  }
  return { total, unique: seen.size, parts };
}

/**
 * Production loads dist/lame.min.js via importScripts (not the broken CJS entry).
 * This test mirrors that path and proves 16 kbps mono encoding works.
 */
describe("lamejs 16 kbps encode", () => {
  it("encodes mono PCM at 16 kbps via lame.min.js", () => {
    const require = createRequire(import.meta.url);
    const minPath = require.resolve("lamejs/lame.min.js");
    const code = readFileSync(minPath, "utf8");
    const sandbox: {
      self: Record<string, unknown>;
      lamejs?: {
        Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
          encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
          flush(): Int8Array;
        };
      };
    } = { self: {} };
    sandbox.self = sandbox;
    vm.runInNewContext(code, sandbox, { filename: "lame.min.js" });
    const lamejs = sandbox.lamejs;
    expect(lamejs?.Mp3Encoder).toBeTypeOf("function");

    const kbps = toMp3Kbps(16000);
    expect(kbps).toBe(16);
    expect(kbps).not.toBe(16000);

    const sampleRate = outputSampleRateForMp3(16000, 48000);
    expect(sampleRate).toBe(16000);
    const audible = encodeSine(lamejs!.Mp3Encoder, sampleRate, kbps);
    const silentRate = encodeSine(lamejs!.Mp3Encoder, 24000, kbps);
    expect(audible.total).toBeGreaterThan(64);
    // A silent lamejs file is mostly repeated headers, so its payload uses few byte values.
    expect(audible.unique).toBeGreaterThan(180);
    expect(silentRate.unique).toBeLessThan(100);
  });

  it("keeps 64 kbps stereo at 48 kHz instead of lamejs downsampling to 24 kHz", () => {
    const require = createRequire(import.meta.url);
    const minPath = require.resolve("lamejs/lame.min.js");
    const code = readFileSync(minPath, "utf8");
    const build = readFileSync(new URL("../build.mjs", import.meta.url), "utf8");
    const match = build.match(/lame\.replace\(\s*"([^"]+)",\s*"([^"]+)"/);
    expect(match).toBeTruthy();
    const patched = code.replace(match![1]!, match![2]!);
    expect(patched).not.toBe(code);
    const sandbox: {
      self: Record<string, unknown>;
      lamejs?: { Mp3Encoder: Mp3Encoder };
    } = { self: {} };
    sandbox.self = sandbox;
    vm.runInNewContext(patched, sandbox, { filename: "lame.min.js" });
    const encoder = new sandbox.lamejs!.Mp3Encoder(2, 48000, 64);
    const n = 48000;
    const left = new Int16Array(n);
    const right = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = Math.floor(Math.sin((2 * Math.PI * 440 * i) / 48000) * 12000);
      right[i] = Math.floor(Math.sin((2 * Math.PI * 660 * i) / 48000) * 9000);
    }
    const parts: Int8Array[] = [];
    for (let i = 0; i < n; i += 1152) {
      const buf = encoder.encodeBuffer(left.subarray(i, i + 1152), right.subarray(i, i + 1152));
      if (buf.length) parts.push(buf);
    }
    const end = encoder.flush();
    if (end.length) parts.push(end);
    const bytes = Buffer.concat(parts.map((part) => Buffer.from(part)));
    let offset = 0;
    while (offset + 4 < bytes.length && !(bytes[offset] === 0xff && (bytes[offset + 1]! & 0xe0) === 0xe0)) offset += 1;
    const version = (bytes[offset + 1]! >> 3) & 3;
    const sampleRateIndex = (bytes[offset + 2]! >> 2) & 3;
    const bitrateIndex = (bytes[offset + 2]! >> 4) & 15;
    const mode = (bytes[offset + 3]! >> 6) & 3;
    expect(version).toBe(3);
    expect([44100, 48000, 32000][sampleRateIndex]).toBe(48000);
    expect([0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bitrateIndex]).toBe(64);
    expect(mode).toBe(1);
  });

  it("documents that CJS lamejs entry hits MPEGMode bug", () => {
    const require = createRequire(import.meta.url);
    const lamejs = require("lamejs") as {
      Mp3Encoder: new (c: number, sr: number, kbps: number) => unknown;
    };
    expect(() => new lamejs.Mp3Encoder(1, 48000, 16)).toThrow(/MPEGMode/);
  });

  it("rejects treating 16 as already-bps accidentally", () => {
    expect(toMp3Kbps(16000)).toBe(16);
    expect(() => toMp3Kbps(16)).toThrow();
  });
});
