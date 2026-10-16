"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, cookieOptions, createToken, safeEqual } from "@/lib/session";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return "APP_PASSWORD is not set on the server.";
  const given = String(form.get("password") ?? "");
  if (!safeEqual(given, expected)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return "Wrong password.";
  }
  (await cookies()).set(COOKIE, await createToken(), cookieOptions);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
