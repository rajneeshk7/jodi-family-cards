import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { q } from "./db";

const COOKIE = "jodi_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days: nobody wants to log in before every game

export type User = { id: number; name: string; is_admin: boolean; avatar: string; color: string };

let secretCache: Uint8Array | null = null;
async function secret(): Promise<Uint8Array> {
  if (secretCache) return secretCache;
  if (process.env.SESSION_SECRET) return (secretCache = new TextEncoder().encode(process.env.SESSION_SECRET));
  // No setup needed: the signing key is created once and kept in the database.
  await q(`INSERT INTO settings (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING`, [
    randomBytes(32).toString("hex"),
  ]);
  const [row] = await q<{ value: string }>(`SELECT value FROM settings WHERE key = 'session_secret'`);
  return (secretCache = new TextEncoder().encode(row.value));
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, hash: string) => bcrypt.compare(p, hash);
export const newToken = () => randomBytes(18).toString("base64url");
export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export async function startSession(userId: number) {
  const jwt = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(await secret());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret());
    const [u] = await q<User>(`SELECT id, name, is_admin, avatar, color FROM users WHERE id = $1`, [payload.uid]);
    return u ?? null;
  } catch {
    return null;
  }
}
