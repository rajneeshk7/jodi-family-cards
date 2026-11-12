"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { call, CallError, play } from "@/lib/client";
import type { GameSummary, LeaderRow } from "@/lib/api";
import type { Player } from "@/lib/game";
import { Avatar, ErrorNote, MiniBoard, Shell } from "@/components/ui";
import { GameRecord, Leaderboard, sizeLabel } from "@/components/Records";

type Home = {
  me: Player & { is_admin: boolean };
  members: Player[];
  tables: GameSummary[];
  recent: GameSummary[];
  leaders: LeaderRow[];
  sizes: { pairs: number; label: string; hint: string }[];
};

export default function HomePage() {
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [pairs, setPairs] = useState(12);
  const [invited, setInvited] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const seenTables = useRef<Set<number> | null>(null);

  const load = useCallback(async () => {
    try {
      const h: Home = await call("home");
      setHome(h);
      setInvited((cur) => cur ?? h.members.filter((m) => m.id !== h.me.id).map((m) => m.id));
      // A little chime when a new invitation arrives.
      const ids = new Set(h.tables.map((t) => t.id));
      if (seenTables.current && [...ids].some((id) => !seenTables.current!.has(id))) play("turn");
      seenTables.current = ids;
    } catch (e) {
      if (e instanceof CallError && e.status === 401) router.replace("/login");
      else setError((e as Error).message);
    }
  }, [router]);

  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  async function openTable() {
    setBusy(true);
    setError("");
    try {
      const { id } = await call("createGame", { pairs, invited });
      router.push(`/game/${id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function joinTable(id: number) {
    setError("");
    try {
      await call("join", { id });
      router.push(`/game/${id}`);
    } catch (e: any) {
      setError(e.message);
      load();
    }
  }

  if (!home) {
    return (
      <Shell>
        <div className="mt-6">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Shell>
    );
  }
  const { me, members } = home;
  const others = members.filter((m) => m.id !== me.id);
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? "Someone";

  return (
    <Shell me={me}>
      <h1 className="mt-4 text-4xl font-extrabold sm:text-6xl">Hi {me.name}, find some jodis</h1>
      <div className="mt-5">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {home.tables.length > 0 && (
        <section className="mt-4 flex flex-col gap-3" aria-label="Tables waiting for you">
          {home.tables.map((t) => {
            const mine = t.hostId === me.id;
            const seated = t.players.some((p) => p.id === me.id);
            const playing = t.status === "playing";
            return (
              <div key={t.id} className="rise flex flex-wrap items-center gap-4 rounded-3xl bg-marigold p-4 pl-5 text-ink shadow-[0_6px_0_#c98200]">
                <div className="flex -space-x-2">
                  {t.players.map((p) => (
                    <Avatar key={p.id} p={p} size={42} />
                  ))}
                </div>
                <p className="min-w-40 flex-1 text-lg font-semibold leading-snug">
                  {playing
                    ? "Your game is still going."
                    : mine
                      ? `Your table is open. ${t.players.length} of ${t.invited.length + 1} are here.`
                      : `${nameOf(t.hostId)} invited you to a ${sizeLabel(t.pairs).toLowerCase()} game.`}
                </p>
                {seated ? (
                  <Link href={`/game/${t.id}`} className="btn btn-pink">
                    {playing ? "Back to the game" : "Go to the table"}
                  </Link>
                ) : (
                  <button className="btn btn-pink" onClick={() => joinTable(t.id)}>
                    Join the table
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="panel p-6 sm:p-7">
          <h2 className="text-3xl font-bold">Start a game</h2>
          {others.length === 0 ? (
            <p className="muted mt-3 text-lg">
              You are the only one here so far.{" "}
              {me.is_admin ? (
                <Link href="/admin" className="text-marigold underline underline-offset-4">
                  Invite your family
                </Link>
              ) : (
                "Ask the family admin to invite the others."
              )}
            </p>
          ) : (
            <>
              <p className="mb-2 mt-5 font-semibold">How many cards?</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Board size">
                {home.sizes.map((s) => (
                  <button
                    key={s.pairs}
                    role="radio"
                    aria-checked={pairs === s.pairs}
                    onClick={() => setPairs(s.pairs)}
                    className={`flex flex-col items-start gap-2 rounded-2xl p-3.5 text-left transition ${
                      pairs === s.pairs ? "bg-peacock text-ink shadow-[0_4px_0_#0f8479]" : "bg-black/25 text-ivory/80 hover:bg-black/40"
                    }`}
                  >
                    <span className="grid h-12 place-items-center">
                      <MiniBoard pairs={s.pairs} />
                    </span>
                    <span className="display text-xl font-bold leading-none">{s.label}</span>
                    <span className="text-sm opacity-75">{s.hint}</span>
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-6 font-semibold">Who is playing?</p>
              <div className="flex flex-wrap gap-2.5">
                {others.map((m) => {
                  const on = invited?.includes(m.id) ?? false;
                  return (
                    <button
                      key={m.id}
                      aria-pressed={on}
                      onClick={() => setInvited((cur) => (on ? (cur ?? []).filter((x) => x !== m.id) : [...(cur ?? []), m.id]))}
                      className={`flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-lg font-semibold transition ${
                        on ? "bg-ivory text-ink" : "bg-black/25 text-ivory/55 line-through decoration-2"
                      }`}
                    >
                      <Avatar p={m} size={38} />
                      {m.name}
                    </button>
                  );
                })}
              </div>
              <button className="btn mt-7 w-full sm:w-auto" onClick={openTable} disabled={busy || !invited?.length}>
                {busy ? "Opening…" : "Open the table and invite them"}
              </button>
            </>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section className="panel p-6">
            <h2 className="mb-4 text-2xl font-bold">Family leaderboard</h2>
            <Leaderboard rows={home.leaders} />
          </section>
          <details className="panel p-6 [&_summary]:cursor-pointer">
            <summary className="display text-2xl font-bold">How to play</summary>
            <ol className="muted mt-4 list-decimal space-y-2 pl-5 text-[1.05rem]">
              <li>On your turn, flip any two cards.</li>
              <li>Same number and same colour is a jodi: 7 of hearts goes with 7 of diamonds, king of spades with king of clubs.</li>
              <li>Found a jodi? Keep it and go again. Missed? The cards turn back, so remember where they were.</li>
              <li>When every card is taken, whoever has the most jodis wins.</li>
            </ol>
          </details>
        </div>
      </div>

      {home.recent.length > 0 && (
        <section className="panel mt-6 p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-2xl font-bold">Latest games</h2>
            <Link href="/history" className="text-marigold underline underline-offset-4">
              See every game
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {home.recent.map((g) => (
              <GameRecord key={g.id} g={g} />
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
