import type { DeviceInfo } from "./types";

/** Chrome turns these on by default. On a virtual cable or stereo mix they add hum and chirping. */
export type CaptureAudioConstraints = MediaTrackConstraints & {
  voiceIsolation?: boolean;
  googEchoCancellation?: boolean;
  googAutoGainControl?: boolean;
  googNoiseSuppression?: boolean;
  googHighpassFilter?: boolean;
  googTypingNoiseDetection?: boolean;
};

export function captureAudioConstraints(deviceId?: string): CaptureAudioConstraints {
  const audio: CaptureAudioConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    voiceIsolation: false,
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
    googEchoCancellation: false,
    googAutoGainControl: false,
    googNoiseSuppression: false,
    googHighpassFilter: false,
    googTypingNoiseDetection: false
  };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return audio;
}

export const deviceHint = (label: string) => /voicemeeter.*out/i.test(label) ? "VoiceMeeter 虚拟输出" : /cable.*output/i.test(label) ? "VB-CABLE 虚拟输出" : /stereo mix/i.test(label) ? "Stereo Mix" : /usb/i.test(label) ? "USB 麦克风" : /line/i.test(label) ? "线路输入" : /microphone|麦克风/i.test(label) ? "普通麦克风" : "其他声音输入";
export async function requestInputPermission() {
  const s = await navigator.mediaDevices.getUserMedia({ audio: captureAudioConstraints(), video: false });
  s.getTracks().forEach(t => t.stop());
  return listDevices();
}
export async function listDevices() { const devices = await navigator.mediaDevices.enumerateDevices(); return devices.map((d, i): DeviceInfo => ({ deviceId: d.deviceId, label: d.label || `${d.kind === "audioinput" ? "未命名可录制设备" : "未命名播放设备"} ${i + 1}`, kind: d.kind, hint: d.kind === "audioinput" ? deviceHint(d.label) : "仅供核对" })); }
export async function openInput(deviceId: string) {
  return navigator.mediaDevices.getUserMedia({ audio: captureAudioConstraints(deviceId), video: false });
}
export function analyser(stream: MediaStream) { const ctx = new AudioContext(), source = ctx.createMediaStreamSource(stream), a = ctx.createAnalyser(); a.fftSize = 512; source.connect(a); return { ctx, source, a, level: () => { const x = new Uint8Array(a.fftSize); a.getByteTimeDomainData(x); return Math.min(1, Math.sqrt(x.reduce((n,v)=>n+(v-128)**2,0)/x.length)/40); } }; }
