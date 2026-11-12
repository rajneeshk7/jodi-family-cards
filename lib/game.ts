// The rules of Jodi. Pure functions only — no database, no network — so they are easy to test.

export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Suit = "S" | "H" | "D" | "C";
export type Card = { r: Rank; s: Suit };

export type Player = { id: number; name: string; avatar: string; color: string };
export type Stat = { pairs: number; flips: number; streak: number; best: number };

export type GameState = {
  cards: Card[];
  owner: (number | null)[]; // who won each card
  open: number[]; // face-up cards in the current turn
  pending: { idx: number[]; until: number } | null; // a wrong pair, shown briefly
  order: number[]; // player ids, in turn order
  turn: number; // index into order
  turnAt: number; // when the current turn began (ms)
  stats: Record<string, Stat>;
  last: { type: "match" | "miss" | "skip"; by: number; idx: number[]; at: number } | null;
};

export type Result = {
  scores: { id: number; name: string; avatar: string; color: string; pairs: number; flips: number; best: number }[];
  winnerIds: number[];
  endedEarly: boolean;
};

export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SIZES = [
  { pairs: 8, label: "Quick", hint: "16 cards" },
  { pairs: 12, label: "Classic", hint: "24 cards" },
  { pairs: 18, label: "Big", hint: "36 cards" },
  { pairs: 26, label: "Full deck", hint: "52 cards" },
] as const;
export const MISS_SHOW_MS = 1700;
export const SKIP_AFTER_MS = 30_000;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;

export const isRed = (s: Suit) => s === "H" || s === "D";
/** Two cards are a jodi when they share a rank and a colour: 7♥ with 7♦, K♠ with K♣. */
export const isPair = (a: Card, b: Card) => a.r === b.r && isRed(a.s) === isRed(b.s);

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(pairs: number, rnd: () => number = Math.random): Card[] {
  // Every possible pair in a 52-card deck: 13 ranks x 2 colours = 26.
  const all: [Card, Card][] = [];
  for (const r of RANKS) {
    all.push([{ r, s: "H" }, { r, s: "D" }]);
    all.push([{ r, s: "S" }, { r, s: "C" }]);
  }
  const chosen = shuffle(all, rnd).slice(0, Math.min(pairs, 26));
  return shuffle(chosen.flat(), rnd);
}

export function newGame(players: Player[], pairs: number, now: number, rnd: () => number = Math.random): GameState {
  const cards = buildDeck(pairs, rnd);
  const order = shuffle(players.map((p) => p.id), rnd);
  const stats: Record<string, Stat> = {};
  for (const p of players) stats[p.id] = { pairs: 0, flips: 0, streak: 0, best: 0 };
  return { cards, owner: cards.map(() => null), open: [], pending: null, order, turn: 0, turnAt: now, stats, last: null };
}

export class RuleError extends Error {}

export const currentPlayer = (s: GameState) => s.order[s.turn];
export const isOver = (s: GameState) => s.owner.every((o) => o !== null);

/** Flip one card. Returns the new state and whether the game just ended. */
export function flip(prev: GameState, playerId: number, index: number, now: number): { state: GameState; over: boolean } {
  const s: GameState = structuredClone(prev);
  if (currentPlayer(s) !== playerId) throw new RuleError("It is not your turn yet.");
  if (s.pending) {
    if (now < s.pending.until) throw new RuleError("Wait for the cards to turn back.");
    s.pending = null;
  }
  if (!Number.isInteger(index) || index < 0 || index >= s.cards.length) throw new RuleError("That card does not exist.");
  if (s.owner[index] !== null) throw new RuleError("That pair is already taken.");
  if (s.open.includes(index)) throw new RuleError("That card is already face up.");

  s.open.push(index);
  const st = s.stats[playerId];
  st.flips++;
  if (s.open.length < 2) return { state: s, over: false };

  const [a, b] = s.open;
  if (isPair(s.cards[a], s.cards[b])) {
    s.owner[a] = playerId;
    s.owner[b] = playerId;
    st.pairs++;
    st.streak++;
    st.best = Math.max(st.best, st.streak);
    s.last = { type: "match", by: playerId, idx: [a, b], at: now };
    s.open = [];
    s.turnAt = now; // matched: same player goes again
    return { state: s, over: isOver(s) };
  }
  st.streak = 0;
  s.pending = { idx: [a, b], until: now + MISS_SHOW_MS };
  s.last = { type: "miss", by: playerId, idx: [a, b], at: now };
  s.open = [];
  s.turn = (s.turn + 1) % s.order.length;
  s.turnAt = now + MISS_SHOW_MS;
  return { state: s, over: false };
}

/** Anyone at the table can move things along when the current player has gone quiet. */
export function skip(prev: GameState, byId: number, now: number): GameState {
  const s: GameState = structuredClone(prev);
  if (!s.order.includes(byId)) throw new RuleError("You are not in this game.");
  if (now - s.turnAt < SKIP_AFTER_MS) throw new RuleError("Give them a little longer.");
  const skipped = currentPlayer(s);
  s.stats[skipped].streak = 0;
  s.last = { type: "skip", by: skipped, idx: s.open, at: now };
  s.open = [];
  s.pending = null;
  s.turn = (s.turn + 1) % s.order.length;
  s.turnAt = now;
  return s;
}

/** A player leaves mid-game. Their pairs stay on the scoreboard. */
export function leave(prev: GameState, playerId: number, now: number): GameState {
  const s: GameState = structuredClone(prev);
  const at = s.order.indexOf(playerId);
  if (at === -1) return s;
  const wasTurn = at === s.turn;
  s.order.splice(at, 1);
  if (wasTurn) {
    s.open = [];
    s.turnAt = now;
  }
  if (at < s.turn) s.turn--;
  if (s.order.length) s.turn = s.turn % s.order.length;
  return s;
}

export function buildResult(s: GameState, players: Player[], endedEarly: boolean): Result {
  const scores = players
    .map((p) => ({ ...p, pairs: s.stats[p.id]?.pairs ?? 0, flips: s.stats[p.id]?.flips ?? 0, best: s.stats[p.id]?.best ?? 0 }))
    .sort((x, y) => y.pairs - x.pairs || x.flips - y.flips);
  const top = scores[0]?.pairs ?? 0;
  const winnerIds = top > 0 ? scores.filter((x) => x.pairs === top).map((x) => x.id) : [];
  return { scores, winnerIds, endedEarly };
}

/** What a player's screen is allowed to know: face-down cards stay secret. */
export function viewOf(s: GameState, now: number) {
  const showPending = s.pending && now < s.pending.until ? s.pending : null;
  const visible = new Set<number>([...s.open, ...(showPending?.idx ?? [])]);
  return {
    cards: s.cards.map((c, i) => (s.owner[i] !== null || visible.has(i) ? c : null)),
    owner: s.owner,
    open: s.open,
    pending: showPending,
    order: s.order,
    turn: s.turn,
    turnAt: s.turnAt,
    stats: s.stats,
    last: s.last,
  };
}
export type GameView = ReturnType<typeof viewOf>;
