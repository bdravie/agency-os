import { cookies } from "next/headers";
import { COOKIE, verifyToken } from "./session";

// Server actions are POSTs to page URLs; middleware covers them, this is a second check.
export async function requireLogin() {
  if (!(await verifyToken((await cookies()).get(COOKIE)?.value))) throw new Error("Not signed in");
}
