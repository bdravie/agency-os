"use client";

import { useState, useEffect } from "react";
import ToastForm from "./ToastForm";
import {
  recordManualFollowersAction,
  pollFollowersAction,
  updateFollowerAccountAction,
} from "@/lib/followerActions";
import {
  formatFollowerCount,
  platformLabel,
  metricLabel,
  type FollowerPlatform,
} from "@/lib/followerMath";
import type { PlatformSummary } from "@/lib/followerTracking";
import {
  Users,
  TrendingUp,
  RefreshCw,
  Edit3,
  ShieldCheck,
  Globe,
  Plus,
  Clock,
  Sparkles,
} from "lucide-react";

export default function FollowerTracker({
  summaries,
}: {
  summaries: PlatformSummary[];
}) {
  const [editingPlatform, setEditingPlatform] = useState<FollowerPlatform | null>(null);
  const [showConfig, setShowConfig] = useState<number | null>(null);

  // Periodic client polling: every 4 minutes while the window/tab is visible
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const poll = async () => {
      if (document.hidden) return;
      try {
        await fetch("/api/followers/poll", { method: "POST" });
      } catch {
        // Silent background catch
      }
    };

    timer = setInterval(poll, 4 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Overview Card */}
      <section className="card" style={{ padding: 18 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <Users size={18} style={{ color: "var(--accent)" }} aria-hidden />
            <h2 style={{ margin: 0, fontSize: 16 }}>Follower &amp; audience tracking</h2>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <ToastForm action={pollFollowersAction} success="Refreshed social follower counts">
              <button
                type="submit"
                className="secondary"
                style={{ fontSize: 12.5, padding: "5px 12px" }}
              >
                <RefreshCw size={13} aria-hidden /> Poll enabled APIs
              </button>
            </ToastForm>
          </div>
        </div>

        <p className="muted" style={{ margin: "0 0 16px", fontSize: 13.5 }}>
          Live audience counts across your core channels. YouTube, Instagram and TikTok update
          automatically through APIs while this screen is open; LinkedIn is strictly recorded by hand to
          safeguard your account.
        </p>

        {/* Platform Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {summaries.map(({ account, growth }) => {
            const isManualOnly = account.platform === "linkedin";
            const deltaPositive = growth.deltaWeek >= 0;

            return (
              <div
                key={account.platform}
                className="card stack"
                style={{
                  padding: 16,
                  gap: 12,
                  backgroundColor: "var(--surface)",
                  position: "relative",
                  borderLeft: `3px solid ${
                    account.platform === "youtube"
                      ? "var(--accent)"
                      : account.platform === "linkedin"
                      ? "var(--line-strong)"
                      : "var(--accent-text)"
                  }`,
                }}
              >
                {/* Header row */}
                <div className="row-between" style={{ alignItems: "center" }}>
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <b>{platformLabel(account.platform)}</b>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {account.handle}
                    </span>
                  </div>

                  {isManualOnly ? (
                    <span
                      className="badge tone-neutral"
                      title="LinkedIn is strictly recorded by hand per CLAUDE.md safety rules"
                      style={{ fontSize: 11 }}
                    >
                      <ShieldCheck size={12} aria-hidden /> Hand-typed
                    </span>
                  ) : (
                    <span
                      className="badge"
                      style={{
                        fontSize: 11,
                        backgroundColor: "var(--surface-2)",
                        color: "var(--text-2)",
                      }}
                    >
                      Auto-polled
                    </span>
                  )}
                </div>

                {/* Big Metric Display */}
                <div>
                  <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-head)",
                        fontSize: 32,
                        fontWeight: 700,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                      }}
                    >
                      {formatFollowerCount(growth.current)}
                    </span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {metricLabel(account.platform).toLowerCase()}
                    </span>
                  </div>

                  {growth.current >= 1000 && (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                      {growth.current.toLocaleString("en-GB")} exact
                    </div>
                  )}
                </div>

                {/* Delta badges */}
                <div className="row" style={{ gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
                  <span
                    className={deltaPositive ? "badge tone-good" : "badge tone-bad"}
                    style={{ fontSize: 12 }}
                  >
                    <TrendingUp size={12} aria-hidden />{" "}
                    {growth.deltaWeek > 0 ? `+${growth.deltaWeek}` : growth.deltaWeek} this week
                  </span>

                  {growth.deltaMonth !== 0 && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {growth.deltaMonth > 0 ? `+${growth.deltaMonth}` : growth.deltaMonth} this month
                    </span>
                  )}
                </div>

                {/* Milestone Progress Bar */}
                <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                  <div className="row-between" style={{ fontSize: 11.5 }}>
                    <span className="muted">Next goal: {formatFollowerCount(growth.nextMilestone)}</span>
                    <span style={{ fontWeight: 600 }}>{growth.milestoneProgress}%</span>
                  </div>
                  <div
                    style={{
                      height: 5,
                      backgroundColor: "var(--surface-2)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${growth.milestoneProgress}%`,
                        backgroundColor: "var(--accent)",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>

                {/* Card Actions */}
                <div
                  className="row-between"
                  style={{
                    paddingTop: 8,
                    borderTop: "1px solid var(--line-soft)",
                    marginTop: 4,
                  }}
                >
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditingPlatform(account.platform)}
                    style={{ fontSize: 12, padding: "4px 8px" }}
                  >
                    <Edit3 size={12} /> Record count
                  </button>

                  <div className="row" style={{ gap: 6 }}>
                    {!isManualOnly && (
                      <ToastForm
                        action={pollFollowersAction}
                        success={`Polled ${platformLabel(account.platform)}`}
                      >
                        <input type="hidden" name="accountId" value={account.id} />
                        <button
                          type="submit"
                          className="secondary"
                          style={{ fontSize: 12, padding: "4px 8px" }}
                          title="Check now"
                        >
                          <RefreshCw size={12} />
                        </button>
                      </ToastForm>
                    )}

                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setShowConfig(showConfig === account.id ? null : account.id)
                      }
                      style={{ fontSize: 12, padding: "4px 8px" }}
                      title="Settings"
                    >
                      <Globe size={12} />
                    </button>
                  </div>
                </div>

                {/* Account Settings Drawer */}
                {showConfig === account.id && (
                  <ToastForm
                    action={updateFollowerAccountAction}
                    success="Account settings updated"
                    className="stack"
                    style={{
                      padding: 10,
                      backgroundColor: "var(--surface-2)",
                      borderRadius: 6,
                      fontSize: 12,
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <input type="hidden" name="accountId" value={account.id} />
                    <input type="hidden" name="platform" value={account.platform} />

                    <label className="stack" style={{ gap: 3 }}>
                      <span className="field-label">Handle / Username</span>
                      <input
                        name="handle"
                        defaultValue={account.handle}
                        required
                        style={{ fontSize: 12, padding: "4px 6px" }}
                      />
                    </label>

                    <label className="stack" style={{ gap: 3 }}>
                      <span className="field-label">Profile URL (optional)</span>
                      <input
                        name="url"
                        defaultValue={account.url || ""}
                        placeholder="https://..."
                        style={{ fontSize: 12, padding: "4px 6px" }}
                      />
                    </label>

                    <button
                      type="submit"
                      className="primary"
                      style={{ fontSize: 11.5, padding: "4px 8px", alignSelf: "flex-start" }}
                    >
                      Save changes
                    </button>
                  </ToastForm>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Manual Entry Dialog / Form */}
      {editingPlatform && (
        <section className="card" style={{ padding: 18, borderLeft: "3px solid var(--accent)" }}>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>
              Record {platformLabel(editingPlatform)} {metricLabel(editingPlatform).toLowerCase()} count
            </h3>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingPlatform(null)}
              style={{ fontSize: 12, padding: "2px 8px" }}
            >
              ✕ Cancel
            </button>
          </div>

          <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
            {editingPlatform === "linkedin"
              ? "Check your LinkedIn company or personal profile and enter your latest follower count below."
              : `Enter the latest count from ${platformLabel(editingPlatform)}. This creates a manual snapshot.`}
          </p>

          <ToastForm
            action={async (formData) => {
              await recordManualFollowersAction(formData);
              setEditingPlatform(null);
            }}
            success={`Recorded ${platformLabel(editingPlatform)} count`}
            className="row"
            style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <input type="hidden" name="platform" value={editingPlatform} />

            <label className="stack" style={{ gap: 4, flex: 1, minWidth: 160 }}>
              <span className="field-label">Current follower count</span>
              <input
                type="number"
                name="count"
                min="0"
                step="1"
                placeholder="e.g. 1540"
                required
                autoFocus
                style={{ fontSize: 14 }}
              />
            </label>

            <label className="stack" style={{ gap: 4, flex: 2, minWidth: 220 }}>
              <span className="field-label">Optional notes / Context</span>
              <input
                type="text"
                name="notes"
                placeholder="e.g. After viral dental automation reel"
                style={{ fontSize: 14 }}
              />
            </label>

            <button
              type="submit"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--on-accent)",
                fontWeight: 600,
                padding: "8px 18px",
                height: 38,
              }}
            >
              <Plus size={15} aria-hidden /> Save snapshot
            </button>
          </ToastForm>
        </section>
      )}

      {/* Snapshot History Table */}
      <section className="card" style={{ padding: 18 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Recent snapshot log</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", borderBottom: "1px solid var(--line-soft)" }}>
                <th style={{ padding: "6px 8px" }}>Platform</th>
                <th style={{ padding: "6px 8px" }}>Count</th>
                <th style={{ padding: "6px 8px" }}>Daily change</th>
                <th style={{ padding: "6px 8px" }}>Source</th>
                <th style={{ padding: "6px 8px" }}>Captured</th>
                <th style={{ padding: "6px 8px" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {summaries.flatMap((s) => s.history).length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: 16, textAlign: "center" }}>
                    No snapshots captured yet. Record your initial follower numbers above or click Poll.
                  </td>
                </tr>
              ) : (
                summaries
                  .flatMap((s) => s.history)
                  .sort(
                    (a, b) =>
                      new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
                  )
                  .slice(0, 15)
                  .map((snap) => (
                    <tr
                      key={`${snap.platform}-${snap.id || snap.captured_at}`}
                      style={{ borderBottom: "1px solid var(--line-soft)" }}
                    >
                      <td style={{ padding: "8px 8px", fontWeight: 600 }}>
                        {platformLabel(snap.platform)}
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        {snap.follower_count.toLocaleString("en-GB")}
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        {snap.delta_daily !== undefined && snap.delta_daily !== null ? (
                          <span
                            className={
                              snap.delta_daily > 0
                                ? "badge tone-good"
                                : snap.delta_daily < 0
                                ? "badge tone-bad"
                                : "muted"
                            }
                            style={{ fontSize: 11 }}
                          >
                            {snap.delta_daily > 0
                              ? `+${snap.delta_daily}`
                              : snap.delta_daily}
                          </span>
                        ) : (
                          <span className="muted">–</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        <span
                          className={snap.source === "api" ? "badge" : "badge tone-neutral"}
                          style={{ fontSize: 11 }}
                        >
                          {snap.source === "api" ? "API" : "Manual"}
                        </span>
                      </td>
                      <td className="muted" style={{ padding: "8px 8px", fontSize: 12 }}>
                        {new Date(snap.captured_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="muted" style={{ padding: "8px 8px", fontSize: 12 }}>
                        {snap.notes || "–"}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
