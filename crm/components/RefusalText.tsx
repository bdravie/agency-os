import Link from "next/link";
import { NICHES_HREF, NICHES_LINK_TEXT } from "@/lib/nicheStatus";

// Shows a refusal message; when it is a niche refusal (it names the Niches screen), that phrase becomes a link to where the status is changed.
export default function RefusalText({ text }: { text: string }) {
  const i = text.indexOf(NICHES_LINK_TEXT);
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<Link href={NICHES_HREF}>{NICHES_LINK_TEXT}</Link>{text.slice(i + NICHES_LINK_TEXT.length)}</>;
}
