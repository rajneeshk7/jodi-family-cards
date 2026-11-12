# Jodi

A family memory game played with real playing cards. Two to four players take turns flipping two cards; a *jodi* (pair) is two cards with the same rank and the same colour, such as 7♥ with 7♦. Find one and you go again. Most jodis wins.

## What is in it

- **Invite-only family**: the first person to open the site becomes the admin. The admin makes one-time invite links (up to 4 members in total); each person picks their own name, password and animal.
- **Tables**: any member opens a table, chooses a board size (16, 24, 36 or 52 cards) and whom to invite. The host deals once at least 2 players are seated. After the deal nobody new can join.
- **Play again**: when a game ends, its players can carry straight on into the next one.
- **Records**: every finished game is kept with scores, flips, best streak and duration, plus a family leaderboard.
- **Fair play**: the server holds the deck. A browser is only ever told the cards that are face up.
- Skip button if a player goes quiet for 30 seconds, leaving mid-game, sounds, confetti.

## How it is built

Next.js (App Router) + Tailwind CSS, deployed on Vercel. Data lives in Postgres (Neon). Browsers ask the server for news about once a second, which is plenty for a turn-based game and needs no extra realtime service.

| Path | What it does |
| --- | --- |
| `lib/game.ts` | The rules, as pure functions |
| `lib/api.ts` | Every server operation (accounts, invites, tables, moves, records) |
| `lib/db.ts` | Database connection and tables (created automatically) |
| `components/GameTable.tsx` | The game screen |

## Run it on your computer

```bash
npm install
npm run dev
```

With no `DATABASE_URL` set, it uses an embedded Postgres saved in `./.localdb`, so there is nothing to install.

## Deploy

1. Import this repo into Vercel.
2. In the project's **Storage** tab, add a **Neon** Postgres database (free plan). This sets `DATABASE_URL`.
3. Redeploy, open the site, and create the admin account.
