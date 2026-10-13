"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../lib/auth/auth-provider";
import { Button, FeedbackBanner } from "../../../../components/v2/primitives";

export default function ReleaseCheckPage() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (pending) return;
    setPending(true);
    const result = await signOut();
    if (result.error) { setError(result.error.message); setPending(false); }
    else router.replace("/v2/login?next=%2Fv2%2Frelease-check");
  }
  return <main id="v2-main" className="v2-main" tabIndex={-1}>
    <p className="v2-eyebrow">Production preview</p>
    <h1>Signed in successfully</h1>
    <p>Your session and profile are ready. The financial workspace is awaiting release verification.</p>
    {error && <FeedbackBanner tone="error" title={error} />}
    <Button onClick={logout} loading={pending}>Sign out</Button>
  </main>;
}
