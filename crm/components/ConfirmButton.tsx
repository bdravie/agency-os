"use client";

// A submit button that asks first. Use inside a plain <form action={...}> where the action redirects.
export default function ConfirmButton({ message, className, title, children }: { message: string; className?: string; title?: string; children: React.ReactNode }) {
  return <button className={className} title={title} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}
