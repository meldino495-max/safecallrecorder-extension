import { describe, expect, it } from "vitest";
import { captureAudioConstraints, deviceHint } from "../src/device-manager";
describe("device routing", () => {
  it("identifies common recordable endpoint labels without restricting them", () => {
    expect(deviceHint("VoiceMeeter Out B1")).toBe("VoiceMeeter 虚拟输出");
    expect(deviceHint("CABLE Output (VB-Audio Virtual Cable)")).toBe("VB-CABLE 虚拟输出");
    expect(deviceHint("Stereo Mix (Realtek)")).toBe("Stereo Mix");
  });
  it("does not classify speaker label as a capture endpoint", () => expect(deviceHint("Speakers (Realtek)")).toBe("其他声音输入"));

  it("records without Chrome echo, noise, or gain processing", () => {
    const audio = captureAudioConstraints("dev-1");
    expect(audio.echoCancellation).toBe(false);
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.autoGainControl).toBe(false);
    expect(audio.deviceId).toEqual({ exact: "dev-1" });
  });
});
