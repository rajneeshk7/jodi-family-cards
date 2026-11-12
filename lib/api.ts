// Every server operation lives here; app/api/rpc/route.ts calls them by name.
import { q } from "./db";
import { checkPassword, currentUser, endSession, hashPassword, nameKey, newToken, startSession, type User } from "./auth";
import {
  MAX_PLAYERS, MIN_PLAYERS, RuleError, SIZES, buildResult, flip, leave, newGame, skip, viewOf,
  type GameState, type Player, type Result,
} from "./game";

export const MAX_MEMBERS = 4;
const COLORS = ["marigold", "rani", "peacock", "lilac"];
const AVATARS = ["🦊", "🐼", "🦄", "🐯", "🐸", "🦉", "🐙", "🦋", "🐬", "🦁", "🐧", "🐨"];

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
const fail = (m: string, status = 400): never => {
  throw new ApiError(m, status);
};

type GameRow = {
  id: number; host_id: number; status: "lobby" | "playing" | "finished" | "cancelled"; pairs: number;
  invited: number[]; players: Player[]; state: GameState | null; result: Result | null; version: number;
  rematch_of: number | null; next_game_id: number | null; created_at: string; started_at: string | null; finished_at: string | null;
};

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const asPlayer = (u: User): Player => ({ id: u.id, name: u.name, avatar: u.avatar, color: u.color });

async function requireUser(): Promise<User> {
  return (await currentUser()) ?? fail("Please sign in again.", 401);
}
async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (!u.is_admin) fail("Only the family admin can do that.", 403);
  return u;
}

function cleanName(raw: unknown): string {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 20) fail("Names need 2 to 20 letters.");
  return name;
}
function cleanPassword(raw: unknown): string {
  const p = String(raw ?? "");
  if (p.length < 6) fail("Pick a password with at least 6 characters.");
  if (p.length > 100) fail("That password is too long.");
  return p;
}
const cleanAvatar = (raw: unknown) => (AVATARS.includes(String(raw)) ? String(raw) : AVATARS[0]);

async function freeColor(): Promise<string> {
  const used = (await q<{ color: string }>(`SELECT color FROM users`)).map((r) => r.color);
  return COLORS.find((c) => !used.includes(c)) ?? COLORS[used.length % COLORS.length];
}

async function getGame(id: unknown): Promise<GameRow> {
  const [row] = await q<GameRow>(`SELECT * FROM games WHERE id = $1`, [Number(id) || 0]);
  return row ?? fail("That game does not exist.", 404);
}

type Patch = Partial<Pick<GameRow, "status" | "players" | "state" | "result" | "started_at" | "finished_at" | "next_game_id">>;
const JSON_COLS = new Set(["players", "state", "result"]);

/** Read-change-write with a version check, so two taps at the same moment can never corrupt a game. */
async function mutate(id: unknown, change: (g: GameRow) => Patch | Promise<Patch>): Promise<GameRow> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const g = await getGame(id);
    const patch = await change(g);
    const keys = Object.keys(patch) as (keyof Patch)[];
    if (!keys.length) return g;
    const sets = keys.map((k, i) => `${k} = $${i + 3}${JSON_COLS.has(k) ? "::jsonb" : ""}`);
    const vals = keys.map((k) => (JSON_COLS.has(k) ? JSON.stringify(patch[k]) : patch[k]));
    const [row] = await q<GameRow>(
      `UPDATE games SET ${sets.join(", ")}, version = version + 1 WHERE id = $1 AND version = $2 RETURNING *`,
      [g.id, g.version, ...vals],
    );
    if (row) return row;
  }
  return fail("The table is busy. Try again.", 409);
}

async function present(g: GameRow, me: User) {
  const now = Date.now();
  const ids = [...new Set([...g.invited, g.host_id])];
  const people = ids.length
    ? await q<Player>(`SELECT id, name, avatar, color FROM users WHERE id = ANY($1::int[])`, [ids])
    : [];
  return {
    id: g.id, status: g.status, version: g.version, pairs: g.pairs, hostId: g.host_id,
    players: g.players, invited: people, view: g.state ? viewOf(g.state, now) : null, result: g.result,
    nextGameId: g.next_game_id, rematchOf: g.rematch_of, startedAt: iso(g.started_at), finishedAt: iso(g.finished_at),
    now, meId: me.id,
  };
}
export type GamePayload = Awaited<ReturnType<typeof present>>;

function finish(state: GameState, players: Player[], early: boolean): Patch {
  return { state, status: "finished", result: buildResult(state, players, early), finished_at: new Date().toISOString() };
}

function summarize(g: GameRow) {
  return {
    id: g.id, status: g.status, pairs: g.pairs, hostId: g.host_id, players: g.players, invited: g.invited,
    result: g.result, createdAt: iso(g.created_at), startedAt: iso(g.started_at), finishedAt: iso(g.finished_at),
  };
}
export type GameSummary = ReturnType<typeof summarize>;

async function leaderboard() {
  const users = await q<Player>(`SELECT id, name, avatar, color FROM users ORDER BY id`);
  const games = await q<{ result: Result }>(`SELECT result FROM games WHERE status = 'finished' AND result IS NOT NULL`);
  const table = users.map((u) => ({ ...u, played: 0, wins: 0, pairs: 0, best: 0 }));
  for (const { result } of games) {
    for (const s of result.scores) {
      const row = table.find((t) => t.id === s.id);
      if (!row) continue;
      row.played++;
      row.pairs += s.pairs;
      row.best = Math.max(row.best, s.best);
      if (result.winnerIds.includes(s.id)) row.wins++;
    }
  }
  return table.sort((a, b) => b.wins - a.wins || b.pairs - a.pairs || a.id - b.id);
}
export type LeaderRow = Awaited<ReturnType<typeof leaderboard>>[number];

type Args = Record<string, unknown>;

export const ops: Record<string, (a: Args) => Promise<unknown>> = {
  // ---------- signing in ----------
  async status() {
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM users`);
    return { hasUsers: n > 0, me: await currentUser(), avatars: AVATARS };
  },

  async setup(a) {
    const name = cleanName(a.name);
    const password = cleanPassword(a.password);
    const hash = await hashPassword(password);
    // Only works while the family is empty, and only one request can win.
    const rows = await q<{ id: number }>(
      `INSERT INTO users (name, name_key, pass_hash, is_admin, avatar, color)
       SELECT $1, $2, $3, true, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM users) RETURNING id`,
      [name, nameKey(name), hash, cleanAvatar(a.avatar), COLORS[0]],
    );
    if (!rows.length) fail("This family already has an admin. Sign in instead.");
    await startSession(rows[0].id);
    return { ok: true };
  },

  async login(a) {
    const [u] = await q<{ id: number; pass_hash: string }>(`SELECT id, pass_hash FROM users WHERE name_key = $1`, [
      nameKey(String(a.name ?? "")),
    ]);
    const ok = u ? await checkPassword(String(a.password ?? ""), u.pass_hash) : false;
    if (!u || !ok) fail("That name and password do not match.", 401);
    await startSession(u.id);
    return { ok: true };
  },

  async logout() {
    await endSession();
    return { ok: true };
  },

  async inviteInfo(a) {
    const [inv] = await q<{ name: string; kind: string; used_at: string | null }>(
      `SELECT name, kind, used_at FROM invites WHERE token = $1`, [String(a.token ?? "")],
    );
    if (!inv || inv.used_at) return { valid: false };
    return { valid: true, name: inv.name, kind: inv.kind, avatars: AVATARS };
  },

  async acceptInvite(a) {
    const password = cleanPassword(a.password);
    const hash = await hashPassword(password);
    // Claim the link first so it can only ever be used once.
    const [inv] = await q<{ name: string; kind: string; user_id: number | null }>(
      `UPDATE invites SET used_at = now() WHERE token = $1 AND used_at IS NULL RETURNING name, kind, user_id`,
      [String(a.token ?? "")],
    );
    if (!inv) fail("This link has already been used. Ask for a new one.");
    if (inv.kind === "reset") {
      const rows = await q<{ id: number }>(`UPDATE users SET pass_hash = $1 WHERE id = $2 RETURNING id`, [hash, inv.user_id]);
      if (!rows.length) fail("That family member no longer exists.");
      await startSession(rows[0].id);
      return { ok: true };
    }
    try {
      const name = cleanName(a.name ?? inv.name);
      const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM users`);
      if (n >= MAX_MEMBERS) fail("The family is full.");
      const [taken] = await q(`SELECT 1 AS x FROM users WHERE name_key = $1`, [nameKey(name)]);
      if (taken) fail("Someone already uses that name. Pick another.");
      const [u] = await q<{ id: number }>(
        `INSERT INTO users (name, name_key, pass_hash, avatar, color) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name, nameKey(name), hash, cleanAvatar(a.avatar), await freeColor()],
      );
      await startSession(u.id);
      return { ok: true };
    } catch (e) {
      await q(`UPDATE invites SET used_at = NULL WHERE token = $1`, [String(a.token)]); // give the link back
      throw e;
    }
  },

  async updateProfile(a) {
    const me = await requireUser();
    await q(`UPDATE users SET avatar = $1 WHERE id = $2`, [cleanAvatar(a.avatar), me.id]);
    return { ok: true };
  },

  // ---------- admin ----------
  async adminData() {
    await requireAdmin();
    const members = await q(`SELECT id, name, avatar, color, is_admin, created_at FROM users ORDER BY id`);
    const invites = await q(
      `SELECT token, name, kind, created_at FROM invites WHERE used_at IS NULL ORDER BY created_at DESC`,
    );
    return { members, invites, max: MAX_MEMBERS };
  },

  async createInvite(a) {
    await requireAdmin();
    const name = cleanName(a.name);
    const [{ n }] = await q<{ n: number }>(
      `SELECT (SELECT count(*) FROM users)::int + (SELECT count(*) FROM invites WHERE used_at IS NULL AND kind = 'invite')::int AS n`,
    );
    if (n >= MAX_MEMBERS) fail(`Jodi seats ${MAX_MEMBERS} family members. Remove an invite or a member first.`);
    const [taken] = await q(`SELECT 1 AS x FROM users WHERE name_key = $1`, [nameKey(name)]);
    if (taken) fail(`${name} is already in the family.`);
    const token = newToken();
    await q(`INSERT INTO invites (token, name) VALUES ($1, $2)`, [token, name]);
    return { token };
  },

  async revokeInvite(a) {
    await requireAdmin();
    await q(`DELETE FROM invites WHERE token = $1 AND used_at IS NULL`, [String(a.token ?? "")]);
    return { ok: true };
  },

  async resetLink(a) {
    await requireAdmin();
    const [u] = await q<{ id: number; name: string }>(`SELECT id, name FROM users WHERE id = $1`, [Number(a.userId) || 0]);
    if (!u) fail("That family member no longer exists.");
    await q(`DELETE FROM invites WHERE user_id = $1 AND kind = 'reset' AND used_at IS NULL`, [u.id]);
    const token = newToken();
    await q(`INSERT INTO invites (token, name, kind, user_id) VALUES ($1, $2, 'reset', $3)`, [token, u.name, u.id]);
    return { token };
  },

  async removeMember(a) {
    const me = await requireAdmin();
    const id = Number(a.userId) || 0;
    if (id === me.id) fail("You cannot remove yourself.");
    await q(`DELETE FROM users WHERE id = $1 AND is_admin = false`, [id]);
    await q(`DELETE FROM invites WHERE user_id = $1`, [id]);
    return { ok: true };
  },

  // ---------- home ----------
  async home() {
    const me = await requireUser();
    const members = await q<Player>(`SELECT id, name, avatar, color FROM users ORDER BY id`);
    const open = await q<GameRow>(
      `SELECT * FROM games WHERE status IN ('lobby', 'playing') AND created_at > now() - interval '12 hours' ORDER BY id DESC`,
    );
    const mine = open.filter((g) =>
      g.status === "lobby"
        ? g.host_id === me.id || g.invited.includes(me.id)
        : g.state?.order.includes(me.id),
    );
    const recent = await q<GameRow>(`SELECT * FROM games WHERE status = 'finished' ORDER BY finished_at DESC LIMIT 4`);
    return { me, members, tables: mine.map(summarize), recent: recent.map(summarize), leaders: await leaderboard(), sizes: SIZES };
  },

  async history() {
    await requireUser();
    const games = await q<GameRow>(`SELECT * FROM games WHERE status = 'finished' ORDER BY finished_at DESC LIMIT 200`);
    return { games: games.map(summarize), leaders: await leaderboard() };
  },

  // ---------- games ----------
  async createGame(a) {
    const me = await requireUser();
    const pairs = Number(a.pairs);
    if (!SIZES.some((s) => s.pairs === pairs)) fail("Pick one of the board sizes.");
    const wanted = Array.isArray(a.invited) ? a.invited.map(Number) : [];
    const members = await q<{ id: number }>(`SELECT id FROM users`);
    const invited = members.map((m) => m.id).filter((id) => id !== me.id && wanted.includes(id));
    if (!invited.length) fail("Invite at least one person to play with.");
    const [g] = await q<{ id: number }>(
      `INSERT INTO games (host_id, pairs, invited, players) VALUES ($1, $2, $3::jsonb, $4::jsonb) RETURNING id`,
      [me.id, pairs, JSON.stringify(invited), JSON.stringify([asPlayer(me)])],
    );
    return { id: g.id };
  },

  async game(a) {
    const me = await requireUser();
    const g = await getGame(a.id);
    if (g.host_id !== me.id && !g.invited.includes(me.id)) fail("You were not invited to this game.", 403);
    if (Number(a.v) === g.version) return { same: true, now: Date.now() };
    return present(g, me);
  },

  async join(a) {
    const me = await requireUser();
    const g = await mutate(a.id, (g) => {
      if (g.players.some((p) => p.id === me.id)) return {};
      if (g.status !== "lobby") fail("This game has already started, so nobody new can join.");
      if (g.host_id !== me.id && !g.invited.includes(me.id)) fail("You were not invited to this game.", 403);
      if (g.players.length >= MAX_PLAYERS) fail("This table is full.");
      return { players: [...g.players, asPlayer(me)] };
    });
    return present(g, me);
  },

  async start(a) {
    const me = await requireUser();
    const g = await mutate(a.id, (g) => {
      if (g.status !== "lobby") fail("This game has already started.");
      if (g.host_id !== me.id) fail("Only the host can deal the cards.");
      if (g.players.length < MIN_PLAYERS) fail("You need at least 2 players at the table.");
      return { status: "playing", state: newGame(g.players, g.pairs, Date.now()), started_at: new Date().toISOString() };
    });
    return present(g, me);
  },

  async flip(a) {
    const me = await requireUser();
    const g = await mutate(a.id, (g) => {
      if (g.status !== "playing" || !g.state) fail("This game is not being played right now.");
      const { state, over } = flip(g.state!, me.id, Number(a.index), Date.now());
      return over ? finish(state, g.players, false) : { state };
    });
    return present(g, me);
  },

  async skip(a) {
    const me = await requireUser();
    const g = await mutate(a.id, (g) => {
      if (g.status !== "playing" || !g.state) fail("This game is not being played right now.");
      return { state: skip(g.state!, me.id, Date.now()) };
    });
    return present(g, me);
  },

  async leaveGame(a) {
    const me = await requireUser();
    const g = await mutate(a.id, (g) => {
      if (!g.players.some((p) => p.id === me.id)) return {};
      if (g.status === "lobby") {
        if (g.host_id === me.id) return { status: "cancelled" };
        return { players: g.players.filter((p) => p.id !== me.id) };
      }
      if (g.status === "playing" && g.state) {
        const state = leave(g.state, me.id, Date.now());
        return state.order.length < MIN_PLAYERS ? finish(state, g.players, true) : { state };
      }
      return {};
    });
    return present(g, me);
  },

  /** "Play again": the same table carries on into a fresh game that only its players can join. */
  async rematch(a) {
    const me = await requireUser();
    const old = await getGame(a.id);
    if (old.status !== "finished") fail("Finish this game first.");
    if (!old.players.some((p) => p.id === me.id)) fail("Only players from this game can carry on.", 403);
    let nextId = old.next_game_id;
    if (!nextId) {
      const invited = old.players.map((p) => p.id).filter((id) => id !== me.id);
      const [created] = await q<{ id: number }>(
        `INSERT INTO games (host_id, pairs, invited, players, rematch_of) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5) RETURNING id`,
        [me.id, old.pairs, JSON.stringify(invited), JSON.stringify([asPlayer(me)]), old.id],
      );
      const [won] = await q<{ id: number }>(
        `UPDATE games SET next_game_id = $1, version = version + 1 WHERE id = $2 AND next_game_id IS NULL RETURNING id`,
        [created.id, old.id],
      );
      if (won) return { id: created.id };
      await q(`DELETE FROM games WHERE id = $1`, [created.id]); // someone else tapped first
      nextId = (await getGame(old.id)).next_game_id!;
    }
    const next = await getGame(nextId);
    if (next.status === "lobby") await ops.join({ id: nextId });
    return { id: nextId };
  },
};

export { RuleError };
