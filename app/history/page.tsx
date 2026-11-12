"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/lib/client";
import type { GameSummary, LeaderRow } from "@/lib/api";
import { ErrorNote, Shell } from "@/components/ui";
import { GameRecord, Leaderboard } from "@/components/Records";

export default function HistoryPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [data, setData] = useState<{ games: GameSummary[]; leaders: LeaderRow[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await call("status");
        if (!s.me) return router.replace("/login");
        setMe(s.me);
        setData(await call("history"));
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [router]);

  return (
    <Shell me={me}>
      <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">Scores</h1>
      <div className="mt-6">
        <ErrorNote>{error}</ErrorNote>
      </div>
      {data && (
        <>
          <section className="panel p-6">
            <h2 className="mb-4 text-2xl font-bold">Family leaderboard</h2>
            <Leaderboard rows={data.leaders} />
          </section>
          <section className="panel mt-6 p-6">
            <h2 className="mb-4 text-2xl font-bold">Every game played</h2>
            {data.games.length ? (
              <ul className="flex flex-col gap-3">
                {data.games.map((g) => (
                  <GameRecord key={g.id} g={g} />
                ))}
              </ul>
            ) : (
              <p className="muted">Finished games are kept here, with who won and every score.</p>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
