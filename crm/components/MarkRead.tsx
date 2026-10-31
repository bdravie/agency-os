"use client";

import { useEffect } from "react";
import { markReplyRead } from "@/lib/inboxActions";

// Opening a reply marks it read.
export default function MarkRead({ id, unread }: { id: number; unread: boolean }) {
  useEffect(() => { if (unread) void markReplyRead(id); }, [id, unread]);
  return null;
}
