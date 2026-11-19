export type Article = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  body: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type FlowOption = { label: string; next?: string; end?: "check" | "not-fixed" };
export type FlowStep = { text: string; options: FlowOption[] };
export type Flow = { id: string; label: string; article: string; start: string; steps: Record<string, FlowStep> };

export type Source = { id: string; title: string };

/** What the chat endpoint sends back for one question. */
export type ChatReply =
  | { kind: "answer"; text: string; sources: Source[]; cached: boolean }
  | { kind: "not_sure"; text: string; reason: NotSureReason; nearest?: Source }
  | { kind: "unhappy"; text: string }
  | { kind: "blocked"; text: string };

export type NotSureReason = "no_match" | "not_in_articles" | "failed_check" | "no_api_key";

export type Turn = { who: "customer" | "bot"; text: string; sources?: string[] };

export type Unanswered = {
  id: string;
  question: string;
  at: string;
  reason: NotSureReason | "did_not_help";
  nearest?: string;
  status: "open" | "fixed" | "dismissed";
};

export type Ticket = {
  id: string;
  createdAt: string;
  reason: "asked_for_person" | "two_failed_answers" | "unhappy" | "flow_not_fixed";
  firstName: string;
  orderNumber: string;
  topic: string;
  summary: string;
  lastQuestion: string;
  articlesTried: string[];
  flow?: string;
  transcript: string;
  sheet: "sent" | "not_set_up" | "failed";
  sheetError?: string;
  status: "open" | "closed";
};

export const REASON_TEXT: Record<Ticket["reason"], string> = {
  asked_for_person: "Customer asked for a person",
  two_failed_answers: "Two answers did not help",
  unhappy: "Customer sounded unhappy",
  flow_not_fixed: "Troubleshooting did not fix it",
};
