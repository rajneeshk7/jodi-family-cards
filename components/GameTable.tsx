"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import type { GamePayload } from "@/lib/api";
import { MIN_PLAYERS, SKIP_AFTER_MS } from "@/lib/game";
import { call, CallError, hex, play, setSound, soundOn } from "@/lib/client";
import PlayingCard from "./PlayingCard";
import { Avatar, ErrorNote, Logo } from "./ui";
import { sizeLabel } from "./Records";

const GAP = 8;

/** Pick the grid that makes the cards as large as the space allows. */
function bestGrid(n: number, w: number, h: number) {
  let best = { cols: 4, cw: 40 };
  for (let cols = 3; cols <= 13; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = Math.min((w - GAP * (cols - 1)) / cols, ((h - GAP * (rows - 1)) / rows) * (5 / 7));
    if (cw > best.cw + 0.5) best = { cols, cw };
  }
  return { cols: best.cols, cw: Math.min(Math.floor(best.cw), 138) };
}

export default function GameTable({ id }: { id: number }) {
  const router = useRouter();
  const [g, setG] = useState<GamePayload | null>(null);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState("");
  const [busyCard, setBusyCard] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [, setTick] = useState(0);
  const [sound, setSoundState] = useState(true);
  const gRef = useRef<GamePayload | null>(null);
  const offset = useRef(0); // server clock minus this device's clock
  const boardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const apply = useCallback((next: GamePayload) => {
    const prev = gRef.current;
    if (prev && next.version < prev.version) return; // an older answer arrived late
    offset.current = next.now - Date.now();
    const me = next.meId;
    if (prev && next.view?.last && next.view.last.at !== prev.view?.last?.at) {
      const last = next.view.last;
      if (last.type === "match") {
        play("match");
        if (last.by === me) confetti({ particleCount: 45, spread: 65, startVelocity: 32, origin: { y: 0.7 }, colors: ["#ffb627", "#ff5c9a", "#22c7b8", "#fff6e6"] });
      } else if (last.type === "miss") play("miss");
    }
    if (prev && prev.status === "playing" && next.status === "finished") {
      play("win");
      if (next.result?.winnerIds.includes(me)) {
        const burst = (x: number) => confetti({ particleCount: 110, spread: 90, origin: { x, y: 0.6 }, colors: ["#ffb627", "#ff5c9a", "#22c7b8", "#a99bff", "#fff6e6"] });
        burst(0.2);
        setTimeout(() => burst(0.8), 250);
      }
    }
    if (prev?.view && next.view && next.status === "playing") {
      const was = prev.view.order[prev.view.turn];
      const now = next.view.order[next.view.turn];
      if (now === me && was !== me) setTimeout(() => play("turn"), next.view.pending ? 1700 : 0);
    }
    gRef.current = next;
    setG(next);
  }, []);

  // Keep in step with the table: ask the server about once a second, and only take news.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (stop) return;
      try {
        if (!document.hidden || !gRef.current) {
          const r = await call("game", { id, v: gRef.current?.version ?? 0 });
          if (!r.same) apply(r);
        }
      } catch (e) {
        if (e instanceof CallError && e.status === 401) return router.replace("/login");
        if (e instanceof CallError && (e.status === 403 || e.status === 404)) return setFatal(e.message);
      }
      timer = setTimeout(loop, gRef.current?.status === "playing" ? 1000 : 1500);
    };
    loop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, apply, router]);

  useEffect(() => {
    setSoundState(soundOn());
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);

  const status = g?.status;
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: Math.max(el.clientHeight, 300) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  const act = useCallback(
    async (op: string, args: Record<string, unknown> = {}) => {
      setWorking(true);
      setError("");
      try {
        const r = await call(op, { id, ...args });
        if (r.version) apply(r);
        return r;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setWorking(false);
      }
    },
    [id, apply],
  );

  const tap = useCallback(
    async (index: number) => {
      setBusyCard(index);
      setError("");
      play("flip");
      try {
        apply(await call("flip", { id, index }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusyCard(null);
      }
    },
    [id, apply],
  );

  const grid = useMemo(() => bestGrid(g?.view?.cards.length ?? g?.pairs ?? 16, box.w, box.h), [g?.view?.cards.length, g?.pairs, box]);

  if (fatal) {
    return (
      <Frame>
        <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
          <h1 className="text-3xl font-bold">You cannot open this table</h1>
          <p className="muted mt-3 text-lg">{fatal}</p>
          <Link href="/" className="btn mt-6">
            Back home
          </Link>
        </div>
      </Frame>
    );
  }
  if (!g) return <Frame>{null}</Frame>;

  const me = g.meId;
  const byId = (pid: number) => g.players.find((p) => p.id === pid) ?? g.invited.find((p) => p.id === pid);
  const seated = g.players.some((p) => p.id === me);
  const isHost = g.hostId === me;

  // ---------- waiting at the table ----------
  if (g.status === "lobby" || g.status === "cancelled") {
    const everyone = [...g.invited].sort((a, b) => (a.id === g.hostId ? -1 : b.id === g.hostId ? 1 : a.id - b.id));
    const enough = g.players.length >= MIN_PLAYERS;
    return (
      <Frame>
        <div className="panel rise mx-auto mt-6 w-full max-w-xl p-6 sm:p-8">
          {g.status === "cancelled" ? (
            <>
              <h1 className="text-3xl font-bold">This table was closed</h1>
              <p className="muted mt-3 text-lg">The host closed it before the cards were dealt.</p>
              <Link href="/" className="btn mt-6">
                Back home
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-extrabold">{isHost ? "Your table is open" : `${byId(g.hostId)?.name}'s table`}</h1>
              <p className="muted mt-3 text-lg">
                {sizeLabel(g.pairs)} board, {g.pairs * 2} cards. Once the cards are dealt, nobody else can join this game.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {everyone.map((p) => {
                  const here = g.players.some((x) => x.id === p.id);
                  return (
                    <li key={p.id} className={`flex items-center gap-3 rounded-2xl p-3 ${here ? "bg-black/30" : "bg-black/10"}`}>
                      <span className={here ? "" : "opacity-40 grayscale"}>
                        <Avatar p={p} size={48} />
                      </span>
                      <span className="flex-1 text-xl font-semibold">
                        {p.name}
                        {p.id === me ? " (you)" : ""}
                      </span>
                      <span className={here ? "font-semibold text-peacock" : "muted"}>{here ? "At the table" : "Not here yet"}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5">
                <ErrorNote>{error}</ErrorNote>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {isHost ? (
                  <>
                    <button className="btn" disabled={!enough || working} onClick={() => act("start")}>
                      {enough ? `Deal the cards for ${g.players.length}` : "Waiting for one more player"}
                    </button>
                    <button className="btn btn-ghost" disabled={working} onClick={() => act("leaveGame")}>
                      Close the table
                    </button>
                  </>
                ) : seated ? (
                  <>
                    <p className="flex-1 text-lg">Waiting for {byId(g.hostId)?.name} to deal the cards…</p>
                    <button className="btn btn-ghost" disabled={working} onClick={() => act("leaveGame").then(() => router.push("/"))}>
                      Leave the table
                    </button>
                  </>
                ) : (
                  <button className="btn" disabled={working} onClick={() => act("join")}>
                    Join the table
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Frame>
    );
  }

  // ---------- playing / finished ----------
  const v = g.view!;
  const now = Date.now() + offset.current;
  const pending = v.pending && now < v.pending.until ? v.pending : null;
  const playing = g.status === "playing";
  const turnId = v.order[v.turn];
  const myTurn = playing && turnId === me && !pending;
  const turnPlayer = byId(turnId);
  const idleFor = now - v.turnAt;
  const canSkip = playing && turnId !== me && v.order.includes(me) && idleFor > SKIP_AFTER_MS;
  const lastBy = v.last ? byId(v.last.by) : null;

  let line = "";
  if (playing) {
    if (pending) line = `Not a jodi. ${turnId === me ? "You are" : `${turnPlayer?.name} is`} up next.`;
    else if (myTurn) line = v.open.length === 1 ? "Now find its jodi." : v.last?.type === "match" && v.last.by === me && now - v.last.at < 4000 ? "A jodi! Go again." : "Your turn. Flip two cards.";
    else line = v.last?.type === "match" && v.last.by === turnId && now - v.last.at < 4000 ? `${lastBy?.name} found a jodi and goes again.` : `${turnPlayer?.name} is choosing…`;
  }

  const winners = g.result?.scores.filter((s) => g.result!.winnerIds.includes(s.id)) ?? [];
  const iWon = g.result?.winnerIds.includes(me);

  return (
    <Frame
      scroll={!playing}
      right={
        <>
          <button
            className="btn btn-ghost btn-sm"
            aria-pressed={sound}
            onClick={() => {
              setSound(!sound);
              setSoundState(!sound);
            }}
          >
            {sound ? "Sound on" : "Sound off"}
          </button>
          {playing && v.order.includes(me) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (window.confirm("Leave this game? You keep the jodis you found, but you cannot come back in.")) act("leaveGame").then(() => router.push("/"));
              }}
            >
              Leave
            </button>
          )}
        </>
      }
    >
      <ul className="flex flex-wrap justify-center gap-2 sm:gap-3" aria-label="Scores">
        {g.players.map((p) => {
          const active = playing && p.id === turnId;
          const gone = !v.order.includes(p.id);
          return (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded-full bg-black/35 py-1.5 pl-1.5 pr-4 transition ${active ? "seat-turn scale-105" : ""} ${gone ? "opacity-45" : ""}`}
              style={{ "--c": hex(p.color) } as React.CSSProperties}
              aria-current={active ? "true" : undefined}
            >
              <Avatar p={p} size={40} ring={!active} />
              <span className="max-w-24 truncate font-semibold leading-tight">
                {p.id === me ? "You" : p.name}
                {gone && <span className="muted block text-xs font-normal">left</span>}
              </span>
              <span className="display min-w-6 text-right text-3xl font-extrabold leading-none" style={{ color: hex(p.color) }}>
                {v.stats[p.id]?.pairs ?? 0}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex min-h-11 flex-wrap items-center justify-center gap-3 text-center" aria-live="polite">
        {playing && <p className={`display text-2xl font-bold ${myTurn ? "text-marigold" : ""}`}>{line}</p>}
        {canSkip && (
          <button className="btn btn-ghost btn-sm" disabled={working} onClick={() => act("skip")}>
            Skip {turnPlayer?.name}'s turn
          </button>
        )}
      </div>
      {error && (
        <div className="mx-auto mt-2 max-w-md">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {g.status === "finished" && g.result && (
        <section className="panel rise mx-auto mb-5 mt-1 w-full max-w-xl p-6 text-center sm:p-8">
          <p className="text-5xl" aria-hidden="true">
            {winners.map((w) => w.avatar).join(" ") || "🃏"}
          </p>
          <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">
            {winners.length === 0 ? "No jodis this time" : iWon && winners.length === 1 ? "You won!" : winners.length === 1 ? `${winners[0].name} wins!` : `${winners.map((w) => (w.id === me ? "You" : w.name)).join(" and ")} tied!`}
          </h1>
          {g.result.endedEarly && <p className="muted mt-2">The game ended early because players left.</p>}
          <table className="mx-auto mt-5 w-full max-w-sm text-left">
            <thead className="muted text-sm">
              <tr>
                <th className="pb-1 font-medium">Player</th>
                <th className="pb-1 text-right font-medium">Jodis</th>
                <th className="pb-1 text-right font-medium">Flips</th>
                <th className="pb-1 text-right font-medium">Best streak</th>
              </tr>
            </thead>
            <tbody>
              {g.result.scores.map((s) => (
                <tr key={s.id} className="border-t border-white/10">
                  <td className="py-2">
                    <span className="flex items-center gap-2 font-semibold">
                      <Avatar p={s} size={32} />
                      {s.id === me ? "You" : s.name}
                    </span>
                  </td>
                  <td className="display py-2 text-right text-2xl font-extrabold" style={{ color: hex(s.color) }}>
                    {s.pairs}
                  </td>
                  <td className="py-2 text-right tabular-nums">{s.flips}</td>
                  <td className="py-2 text-right tabular-nums">{s.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {seated && (
              <button
                className="btn"
                disabled={working}
                onClick={async () => {
                  const r = await act("rematch");
                  if (r?.id) router.push(`/game/${r.id}`);
                }}
              >
                {g.nextGameId ? "Join the next game" : "Play again with the same table"}
              </button>
            )}
            <Link href="/" className="btn btn-ghost">
              Back home
            </Link>
          </div>
          {g.nextGameId && seated && <p className="mt-4 font-semibold text-marigold">The next game is waiting for you.</p>}
        </section>
      )}

      <div ref={boardRef} className={`flex items-start justify-center pt-1 ${playing ? "min-h-[300px] flex-1 sm:items-center" : "h-[70dvh] shrink-0"}`}>
        {box.w > 0 && (
          <div
            className="grid justify-center"
            style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.cw}px)`, gap: GAP }}
            role="group"
            aria-label="The cards"
          >
            {v.cards.map((card, i) => {
              const ownerId = v.owner[i];
              const owner = ownerId !== null ? byId(ownerId) : null;
              const inPending = !!pending?.idx.includes(i);
              const up = ownerId !== null || v.open.includes(i) || inPending;
              const fresh = v.last?.type === "match" && v.last.idx.includes(i) && now - v.last.at < 2200;
              return (
                <div key={i} className="deal-in" style={{ animationDelay: `${Math.min(i * 18, 700)}ms` }}>
                  <PlayingCard
                    card={card}
                    up={up}
                    wonColor={owner ? hex(owner.color) : undefined}
                    wonAvatar={owner?.avatar}
                    fresh={fresh}
                    miss={inPending}
                    busy={busyCard === i}
                    tappable={myTurn && !up && busyCard === null}
                    label={`Card ${i + 1}, face down`}
                    onTap={() => tap(i)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Frame>
  );
}

function Frame({ children, right, scroll }: { children: React.ReactNode; right?: React.ReactNode; scroll?: boolean }) {
  return (
    <div className={`mx-auto flex w-full max-w-6xl flex-col px-3 pb-4 sm:px-6 ${scroll ? "min-h-dvh" : "h-dvh min-h-[560px]"}`}>
      <header className="flex items-center justify-between gap-3 py-3">
        <Logo size="text-2xl" />
        <div className="flex items-center gap-2">{right}</div>
      </header>
      {children}
    </div>
  );
}
