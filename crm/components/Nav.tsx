import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE, verifyToken } from "@/lib/session";
import { logout } from "@/app/login/actions";

const links = [
  ["/", "Today"],
  ["/companies", "Companies"],
  ["/deals", "Deals"],
  ["/tasks", "Tasks"],
  ["/proposals", "Proposals"],
  ["/content", "Content"],
] as const;

export default async function Nav() {
  if (!(await verifyToken((await cookies()).get(COOKIE)?.value))) return null;
  return (
    <nav>
      <strong>Agency OS</strong>
      {links.map(([href, label]) => (
        <Link key={href} href={href}>{label}</Link>
      ))}
      <form action={logout} style={{ marginLeft: "auto" }}>
        <button className="link">Sign out</button>
      </form>
    </nav>
  );
}
