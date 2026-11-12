"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { call } from "@/lib/client";
import { AuthFrame, AvatarPicker, FormBody, Labeled } from "@/components/AuthForms";

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [info, setInfo] = useState<{ valid: boolean; name?: string; kind?: string; avatars?: string[] } | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("🦄");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call("inviteInfo", { token })
      .then((i) => {
        setInfo(i);
        setName(i.name ?? "");
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await call("acceptInvite", { token, name, password, avatar });
      router.replace("/");
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (info && !info.valid) {
    return (
      <AuthFrame title="This link has been used" lead="Each invite link works once. Ask the family admin for a fresh one.">
        <Link href="/login" className="btn w-full">
          Go to sign in
        </Link>
      </AuthFrame>
    );
  }
  const reset = info?.kind === "reset";
  return (
    <AuthFrame
      title={reset ? `New password for ${info?.name}` : info ? `${info.name}, you're invited` : "Opening your invite"}
      lead={reset ? "Choose a new password and you are straight back at the table." : "Make your account and join the family table. It takes half a minute."}
    >
      <FormBody onSubmit={submit} error={error} busy={busy || !info} cta={reset ? "Save and sign in" : "Join the family"}>
        {!reset && (
          <Labeled label="Your name" hint="This is what everyone sees, and what you type to sign in.">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" required />
          </Labeled>
        )}
        <Labeled label={reset ? "New password" : "Choose a password"} hint="At least 6 characters. Keep it secret.">
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </Labeled>
        {!reset && info?.avatars && <AvatarPicker avatars={info.avatars} value={avatar} onChange={setAvatar} />}
      </FormBody>
    </AuthFrame>
  );
}
