"use client";
import { useState } from "react";

export default function Login() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) });
    if (res.ok) { window.location.href = "/"; return; }
    setErr((await res.json().catch(() => ({}))).error || "Couldn't log in."); setBusy(false);
  }
  return (
    <main className="login">
      <form onSubmit={submit} className="card">
        <img src="/icon.svg" alt="" width={44} height={44} />
        <h1>Outreach Hub</h1>
        <p className="muted">Capture prospects, fill in the gaps, track every lead.</p>
        <label htmlFor="pc">Passcode</label>
        <input id="pc" type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" />
        <button className="btn primary" disabled={busy || !code}>{busy ? "Checking…" : "Log in"}</button>
        {err && <p className="err" role="alert">{err}</p>}
      </form>
    </main>
  );
}
