"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { call, timeAgo } from "@/lib/client";
import { Avatar, ErrorNote, Shell } from "@/components/ui";

type Member = { id: number; name: string; avatar: string; color: string; is_admin: boolean };
type Invite = { token: string; name: string; kind: string; created_at: string };

function LinkRow({ inv, onRevoke }: { inv: Invite; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/join/${inv.token}`;
  const text =
    inv.kind === "reset"
      ? `${inv.name}, here is your link to set a new Jodi password: ${url}`
      : `${inv.name}, come play Jodi with the family! Make your account here: ${url}`;
  return (
    <li className="rounded-2xl bg-black/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {inv.kind === "reset" ? `Password reset for ${inv.name}` : `Invite for ${inv.name}`}
          <span className="muted ml-2 text-sm font-normal">made {timeAgo(new Date(inv.created_at).toISOString())}</span>
        </p>
        <button className="muted text-sm underline underline-offset-4 hover:text-ivory" onClick={onRevoke}>
          Cancel this link
        </button>
      </div>
      <p className="muted mt-2 break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-sm">{url}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a className="btn btn-sm btn-teal" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          Send on WhatsApp
        </a>
      </div>
    </li>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [data, setData] = useState<{ members: Member[]; invites: Invite[]; max: number } | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await call("status");
      if (!s.me) return router.replace("/login");
      if (!s.me.is_admin) return router.replace("/");
      setMe(s.me);
      setData(await call("adminData"));
    } catch (e: any) {
      setError(e.message);
    }
  }, [router]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(op: string, args: Record<string, unknown>) {
    setError("");
    try {
      await call(op, args);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const seatsLeft = data ? data.max - data.members.length - data.invites.filter((i) => i.kind === "invite").length : 0;

  return (
    <Shell me={me}>
      <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">Your family table</h1>
      <p className="muted mt-3 max-w-[60ch] text-lg">
        Jodi seats {data?.max ?? 4} people. Make an invite link for each person and send it to them. They choose their own password.
      </p>
      <div className="mt-6">
        <ErrorNote>{error}</ErrorNote>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="panel p-6">
          <h2 className="text-2xl font-bold">Members</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {data?.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <Avatar p={m} />
                <span className="flex-1 text-lg font-semibold">
                  {m.name}
                  {m.is_admin && <span className="muted ml-2 text-sm font-normal">admin</span>}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => run("resetLink", { userId: m.id })}>
                  Reset password
                </button>
                {!m.is_admin && (
                  <button
                    className="muted text-sm underline underline-offset-4 hover:text-ivory"
                    onClick={() => {
                      if (window.confirm(`Remove ${m.name} from the family? Their old scores stay in the records.`)) run("removeMember", { userId: m.id });
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-6">
          <h2 className="text-2xl font-bold">Invite someone</h2>
          {seatsLeft > 0 ? (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run("createInvite", { name }).then(() => setName(""));
              }}
            >
              <input className="field" placeholder="Their name, e.g. Ankita" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Name of the person to invite" />
              <button className="btn shrink-0">Make link</button>
            </form>
          ) : (
            <p className="muted mt-4">Every seat is taken or has an invite waiting.</p>
          )}
          <p className="muted mt-3 text-sm">
            {seatsLeft > 0 ? `${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left.` : ""} Each link works once.
          </p>
        </section>
      </div>

      {!!data?.invites.length && (
        <section className="panel mt-6 p-6">
          <h2 className="text-2xl font-bold">Links waiting to be used</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {data.invites.map((inv) => (
              <LinkRow key={inv.token} inv={inv} onRevoke={() => run("revokeInvite", { token: inv.token })} />
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
