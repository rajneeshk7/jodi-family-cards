"use client";
export class CallError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function call<T = any>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, ...args }),
  });
  const data = await res.json().catch(() => ({ error: "The server did not answer properly." }));
  if (!res.ok) throw new CallError(data.error || "Something went wrong.", res.status);
  return data as T;
}

export const COLOR_HEX: Record<string, string> = {
  marigold: "#FFB627",
  rani: "#FF5C9A",
  peacock: "#22C7B8",
  lilac: "#A99BFF",
};
export const hex = (c: string) => COLOR_HEX[c] ?? COLOR_HEX.marigold;

export function timeAgo(isoStr: string | null): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function duration(a: string | null, b: string | null): string {
  if (!a || !b) return "";
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

// Tiny synth so the game has sound without shipping audio files.
let ctx: AudioContext | null = null;
export const soundOn = () => typeof window !== "undefined" && localStorage.getItem("jodi-sound") !== "off";
export const setSound = (on: boolean) => localStorage.setItem("jodi-sound", on ? "on" : "off");
export function play(kind: "flip" | "match" | "miss" | "win" | "turn") {
  if (!soundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const tunes: Record<string, [number, number][]> = {
      flip: [[520, 0.06]],
      match: [[660, 0.09], [880, 0.09], [1320, 0.16]],
      miss: [[300, 0.12], [220, 0.18]],
      turn: [[784, 0.08], [1046, 0.14]],
      win: [[523, 0.12], [659, 0.12], [784, 0.12], [1046, 0.3]],
    };
    let t = ctx.currentTime;
    for (const [freq, len] of tunes[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === "miss" ? "sine" : "triangle";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + len + 0.02);
      t += len * 0.9;
    }
  } catch {}
}
