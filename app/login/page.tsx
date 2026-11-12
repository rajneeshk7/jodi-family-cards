"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/lib/client";
import { AuthFrame, AvatarPicker, FormBody, Labeled } from "@/components/AuthForms";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "login" | "setup">("loading");
  const [avatars, setAvatars] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("🦊");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call("status")
      .then((s) => {
        if (s.me) return router.replace("/");
        setAvatars(s.avatars);
        setMode(s.hasUsers ? "login" : "setup");
      })
      .catch((e) => {
        setError(e.message);
        setMode("login");
      });
  }, [router]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await call(mode === "setup" ? "setup" : "login", { name, password, avatar });
      router.replace(mode === "setup" ? "/admin" : "/");
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (mode === "setup") {
    return (
      <AuthFrame title="Set up your family table" lead="You are the first one here, so you become the family admin. Next you will invite everyone else.">
        <FormBody onSubmit={submit} error={error} busy={busy} cta="Create my admin account">
          <Labeled label="Your name">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rajneesh" autoComplete="username" required />
          </Labeled>
          <Labeled label="Choose a password" hint="At least 6 characters.">
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Labeled>
          <AvatarPicker avatars={avatars} value={avatar} onChange={setAvatar} />
        </FormBody>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Find the pairs. Beat your family." lead="Jodi is a memory game played with real playing cards, for two to four of us at a time.">
      <h2 className="mb-5 text-2xl font-bold">Sign in to play</h2>
      <FormBody onSubmit={submit} error={error} busy={busy || mode === "loading"} cta="Sign in">
        <Labeled label="Your name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" required />
        </Labeled>
        <Labeled label="Password">
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Labeled>
      </FormBody>
      <p className="muted mt-5 text-sm">No account yet? Ask the family admin for your invite link. Forgot your password? The admin can send you a reset link.</p>
    </AuthFrame>
  );
}
