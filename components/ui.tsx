"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { call, hex } from "@/lib/client";

export function Logo({ size = "text-3xl" }: { size?: string }) {
  return (
    <Link href="/" className={`display font-extrabold ${size} inline-flex items-center gap-2`} aria-label="Jodi home">
      <svg viewBox="0 0 64 64" className="h-[1.15em] w-[1.15em]" aria-hidden="true">
        <rect x="8" y="12" width="28" height="40" rx="6" fill="#17a79b" stroke="#fff6e6" strokeWidth="3" transform="rotate(-10 22 32)" />
        <rect x="28" y="12" width="28" height="40" rx="6" fill="#fff6e6" transform="rotate(8 42 32)" />
        <path d="M42 25c-2-4-9-3-9 2 0 5 6 8 9 11 3-3 9-6 9-11 0-5-7-6-9-2z" fill="#d7263d" transform="rotate(8 42 32)" />
      </svg>
      <span>Jodi</span>
    </Link>
  );
}

export function Avatar({ p, size = 44, ring = true }: { p: { avatar: string; color: string }; size?: number; ring?: boolean }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.56,
        background: `color-mix(in srgb, ${hex(p.color)} 28%, #170a1f)`,
        boxShadow: ring ? `0 0 0 2.5px ${hex(p.color)}` : undefined,
      }}
      aria-hidden="true"
    >
      {p.avatar}
    </span>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-rani/15 px-4 py-3 text-[0.95rem] text-[#ffc2da] shadow-[inset_0_0_0_1.5px_rgb(255_92_154/0.4)]">
      {children}
    </p>
  );
}

export function Shell({
  me,
  children,
  wide,
}: {
  me?: { name: string; avatar: string; color: string; is_admin: boolean } | null;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const router = useRouter();
  return (
    <div className={`mx-auto flex min-h-dvh w-full flex-col px-4 pb-16 sm:px-6 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
      <header className="flex items-center justify-between gap-3 py-4">
        <Logo />
        {me && (
          <nav className="flex items-center gap-1 text-[0.95rem] font-semibold sm:gap-2">
            <Link href="/history" className="rounded-xl px-3 py-2 hover:bg-white/10">
              Scores
            </Link>
            {me.is_admin && (
              <Link href="/admin" className="rounded-xl px-3 py-2 hover:bg-white/10">
                Family
              </Link>
            )}
            <button
              className="flex items-center gap-2 rounded-xl py-1 pl-2 pr-1 hover:bg-white/10"
              title="Sign out"
              onClick={async () => {
                await call("logout");
                router.replace("/login");
              }}
            >
              <span className="muted hidden sm:inline">Sign out</span>
              <Avatar p={me} size={36} />
            </button>
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}

/** A little picture of the board, so a child can choose a size without reading numbers. */
export function MiniBoard({ pairs }: { pairs: number }) {
  const cols = pairs === 8 ? 4 : pairs === 12 ? 6 : pairs === 18 ? 9 : 13;
  return (
    <span className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, width: cols * 7 }} aria-hidden="true">
      {Array.from({ length: pairs * 2 }, (_, i) => (
        <span key={i} className="aspect-[5/7] rounded-[1.5px] bg-current" />
      ))}
    </span>
  );
}
