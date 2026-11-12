"use client";
import { useState } from "react";
import PlayingCard from "./PlayingCard";
import { ErrorNote, Logo } from "./ui";

export function AvatarPicker({ avatars, value, onChange }: { avatars: string[]; value: string; onChange: (a: string) => void }) {
  return (
    <div>
      <p className="mb-2 font-semibold">Pick your animal</p>
      <div className="grid grid-cols-6 gap-2">
        {avatars.map((a) => (
          <button
            key={a}
            type="button"
            aria-label={`Choose ${a}`}
            aria-pressed={value === a}
            onClick={() => onChange(a)}
            className={`grid aspect-square place-items-center rounded-2xl text-2xl transition ${
              value === a ? "scale-110 bg-marigold shadow-[0_4px_0_#c98200]" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The frame around every signed-out screen: three cards fanned out, the middle one face up. */
export function AuthFrame({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  const [up, setUp] = useState([false, true, false]);
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-[1.1fr_1fr]">
      <div>
        <Logo size="text-4xl" />
        <div className="my-8 flex justify-center md:justify-start" aria-hidden="true">
          {[
            { r: "Q", s: "H", rot: -12, y: 10 },
            { r: "A", s: "S", rot: 0, y: 0 },
            { r: "Q", s: "D", rot: 12, y: 10 },
          ].map((c, i) => (
            <div
              key={i}
              className={`deal-in -mx-3 w-28 sm:w-36 ${i === 1 ? "z-10" : ""}`}
              style={{ position: "relative", animationDelay: `${i * 0.12}s`, rotate: `${c.rot}deg`, translate: `0 ${c.y}px` }}
              onClick={() => setUp((u) => u.map((v, j) => (j === i ? !v : v)))}
            >
              <PlayingCard card={{ r: c.r as any, s: c.s as any }} up={up[i]} tappable label="Flip me" />
            </div>
          ))}
        </div>
        <h1 className="text-5xl font-extrabold sm:text-6xl">{title}</h1>
        <p className="muted mt-4 max-w-[34ch] text-lg">{lead}</p>
      </div>
      <div className="panel rise p-6 sm:p-8">{children}</div>
    </main>
  );
}

export function FormBody({
  onSubmit,
  error,
  busy,
  cta,
  children,
}: {
  onSubmit: () => void;
  error: string;
  busy: boolean;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      {children}
      <ErrorNote>{error}</ErrorNote>
      <button className="btn w-full" disabled={busy}>
        {busy ? "One moment…" : cta}
      </button>
    </form>
  );
}

export function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-semibold">{label}</span>
      {children}
      {hint && <span className="muted mt-1.5 block text-sm">{hint}</span>}
    </label>
  );
}
