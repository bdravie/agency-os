"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="login">
      <form action={action} className="card">
        <h1>Agency OS</h1>
        <input name="password" type="password" placeholder="Password" autoFocus required />
        <button disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
