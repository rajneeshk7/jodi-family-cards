"use client";
import type { GameSummary, LeaderRow } from "@/lib/api";
import { SIZES } from "@/lib/game";
import { duration, hex, timeAgo } from "@/lib/client";
import { Avatar } from "./ui";

export const sizeLabel = (pairs: number) => SIZES.find((s) => s.pairs === pairs)?.label ?? `${pairs} pairs`;

export function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const anyPlayed = rows.some((r) => r.played > 0);
  if (!anyPlayed) return <p className="muted">Nobody has finished a game yet. The first win puts a name on top.</p>;
  return (
    <table className="w-full text-left">
      <thead className="muted text-sm">
        <tr>
          <th className="pb-2 font-medium">Player</th>
          <th className="pb-2 text-right font-medium">Wins</th>
          <th className="pb-2 text-right font-medium">Games</th>
          <th className="pb-2 text-right font-medium">Pairs</th>
          <th className="hidden pb-2 text-right font-medium sm:table-cell">Best streak</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className="border-t border-white/10">
            <td className="py-2.5">
              <span className="flex items-center gap-3">
                <Avatar p={r} size={38} />
                <span className="text-lg font-semibold">{r.name}</span>
                {i === 0 && r.wins > 0 && <span title="In the lead">👑</span>}
              </span>
            </td>
            <td className="display py-2.5 text-right text-2xl font-extrabold" style={{ color: hex(r.color) }}>
              {r.wins}
            </td>
            <td className="py-2.5 text-right tabular-nums">{r.played}</td>
            <td className="py-2.5 text-right tabular-nums">{r.pairs}</td>
            <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{r.best}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GameRecord({ g }: { g: GameSummary }) {
  const r = g.result;
  if (!r) return null;
  const winners = r.scores.filter((s) => r.winnerIds.includes(s.id));
  const headline =
    winners.length === 0 ? "Nobody scored" : winners.length === 1 ? `${winners[0].name} won` : `${winners.map((w) => w.name).join(" and ")} tied`;
  return (
    <li className="rounded-2xl bg-black/25 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="display text-xl font-bold">{headline}</p>
        <p className="muted text-sm">
          Game {g.id}, {sizeLabel(g.pairs)} board, {duration(g.startedAt, g.finishedAt)}
          {r.endedEarly ? ", ended early" : ""} — {timeAgo(g.finishedAt)}
        </p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {r.scores.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <Avatar p={s} size={30} />
            <span className={r.winnerIds.includes(s.id) ? "font-bold" : ""}>{s.name}</span>
            <span className="display text-lg font-extrabold" style={{ color: hex(s.color) }}>
              {s.pairs}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
