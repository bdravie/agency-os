"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="login">
      <form action={action} className="card stack">
        <div className="brand-mark" aria-hidden>A</div>
        <h1>Agency OS</h1>
        <label htmlFor="password" className="muted" style={{ textAlign: "center" }}>Enter your password to continue</label>
        <input id="password" name="password" type="password" placeholder="Password" autoComplete="current-password" autoFocus required />
        <button disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  );
}
