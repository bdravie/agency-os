import Link from "next/link";
import { redirect } from "next/navigation";
import { bookableContacts, bookedToday, dailyCap } from "@/lib/meetings";
import { getConnection } from "@/lib/gcalAuth";
import { addDays, dayKey } from "@/lib/meetingMath";
import BookMeetingForm from "@/components/BookMeetingForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a meeting" };

export default async function BookMeeting({ searchParams }: { searchParams: Promise<{ contact?: string; company?: string }> }) {
  const sp = await searchParams;
  const conn = await getConnection();
  if (!conn) redirect("/calendar?error=Connect%20your%20Google%20Calendar%20first");
  const [contacts, booked] = await Promise.all([bookableContacts(), bookedToday()]);
  const wanted = Number(sp.contact) || 0, company = Number(sp.company) || 0;
  const preselect = contacts.find((c) => c.id === wanted)?.id ?? contacts.find((c) => company && c.company_id === company)?.id ?? null;
  return (
    <>
      <PageHeader back={{ href: "/calendar", label: "Calendar" }} title="Book a meeting"
        description="Pick a saved contact and a time. Google emails them the invitation with a Meet link when you confirm. One meeting at a time, and never to someone who has not agreed to a call." />
      <BookMeetingForm contacts={contacts} calendarEmail={conn.email} preselect={preselect} defaultDate={addDays(dayKey(new Date()), 1)} left={Math.max(0, dailyCap() - booked)} />
      <p className="muted" style={{ marginTop: 12 }}>Need someone who is not listed? Add them as a contact on their <Link href="/companies">company page</Link> (with an email address) first.</p>
    </>
  );
}
