"use client";

import { useId, useState } from "react";
import type { TimePoint } from "@/lib/categoryTimeSeries";
import type { ContentCategory } from "@/lib/categoryTypes";

type Metric = "views" | "multiple" | "count";

export default function CategoryGraph({
  data,
  categories,
}: {
  data: TimePoint[];
  categories: ContentCategory[];
}) {
  const chartId = useId();
  const [metric, setMetric] = useState<Metric>("multiple");
  const [activeKeys, setActiveKeys] = useState<string[]>(() => categories.map((c) => c.key));
  const [hoveredPoint, setHoveredPoint] = useState<{
    category: string;
    label: string;
    period: string;
    val: number;
    count: number;
    views: number;
    x: number;
    y: number;
  } | null>(null);

  const toggleKey = (key: string) => {
    setActiveKeys((prev) =>
      prev.includes(key) ? (prev.length > 1 ? prev.filter((k) => k !== key) : prev) : [...prev, key]
    );
  };

  // Dimensions
  const width = 640;
  const height = 240;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const activeCategories = categories.filter((c) => activeKeys.includes(c.key));

  // Determine scale
  const rawValues = data.flatMap((d) =>
    activeCategories.map((c) => {
      const stats = d.categories[c.key];
      if (!stats || stats.count === 0) return 0;
      if (metric === "multiple") return stats.avgMultiple;
      if (metric === "views") return stats.totalViews;
      return stats.count;
    })
  );

  const maxVal = Math.max(metric === "multiple" ? 2.0 : 5, ...rawValues) * 1.15;
  const minVal = 0;

  const getX = (idx: number) => {
    if (data.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (data.length - 1)) * plotW;
  };

  const getY = (val: number) => {
    const ratio = (val - minVal) / (maxVal - minVal || 1);
    return padTop + plotH - ratio * plotH;
  };

  const formatVal = (v: number) => {
    if (metric === "multiple") return `${v.toFixed(1)}×`;
    if (metric === "views") return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
    return String(Math.round(v));
  };

  return (
    <div className="card" style={{ padding: "16px 18px", marginTop: 14 }}>
      <div className="row-between" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Category performance over time</h2>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            Track how each content niche performs across recent months.
          </p>
        </div>
        <div className="pills" role="radiogroup" aria-label="Metric">
          <button
            type="button"
            className={`pill${metric === "multiple" ? " on" : ""}`}
            onClick={() => setMetric("multiple")}
          >
            Multiplier (×)
          </button>
          <button
            type="button"
            className={`pill${metric === "views" ? " on" : ""}`}
            onClick={() => setMetric("views")}
          >
            72h views
          </button>
          <button
            type="button"
            className={`pill${metric === "count" ? " on" : ""}`}
            onClick={() => setMetric("count")}
          >
            Posts
          </button>
        </div>
      </div>

      {/* Legend & filter pills */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {categories.map((c) => {
          const on = activeKeys.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              className="pill"
              onClick={() => toggleKey(c.key)}
              style={{
                opacity: on ? 1 : 0.45,
                borderColor: on ? c.colour : "var(--line)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: c.colour,
                }}
              />
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", maxWidth: width, height: "auto", display: "block" }}
          aria-labelledby={`${chartId}-title`}
        >
          <title id={`${chartId}-title`}>Performance chart by category</title>

          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((pct, i) => {
            const y = padTop + plotH * (1 - pct);
            const val = minVal + (maxVal - minVal) * pct;
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="var(--line-soft)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize={10.5}
                  fontFamily="var(--font-mono, monospace)"
                >
                  {formatVal(val)}
                </text>
              </g>
            );
          })}

          {/* X axis labels */}
          {data.map((d, idx) => {
            const x = getX(idx);
            return (
              <text
                key={d.period}
                x={x}
                y={height - 10}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize={11.5}
                fontWeight={500}
              >
                {d.label}
              </text>
            );
          })}

          {/* Lines and dots per active category */}
          {activeCategories.map((c) => {
            const coords = data.map((d, idx) => {
              const stats = d.categories[c.key];
              const rawVal =
                !stats || stats.count === 0
                  ? 0
                  : metric === "multiple"
                  ? stats.avgMultiple
                  : metric === "views"
                  ? stats.totalViews
                  : stats.count;
              return {
                x: getX(idx),
                y: getY(rawVal),
                val: rawVal,
                count: stats?.count ?? 0,
                views: stats?.totalViews ?? 0,
                period: d.label,
              };
            });

            const pointsStr = coords.map((pt) => `${pt.x},${pt.y}`).join(" ");

            return (
              <g key={c.key}>
                {coords.length > 1 && (
                  <polyline
                    points={pointsStr}
                    fill="none"
                    stroke={c.colour}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {coords.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredPoint?.category === c.key && hoveredPoint?.label === pt.period ? 6 : 4}
                    fill="var(--surface)"
                    stroke={c.colour}
                    strokeWidth={2.5}
                    style={{ cursor: "pointer", transition: "r 120ms ease" }}
                    onMouseEnter={() =>
                      setHoveredPoint({
                        category: c.key,
                        label: c.label,
                        period: pt.period,
                        val: pt.val,
                        count: pt.count,
                        views: pt.views,
                        x: pt.x,
                        y: pt.y,
                      })
                    }
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredPoint && (
          <div
            style={{
              position: "absolute",
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
              transform: "translate(-50%, -120%)",
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-1)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 10,
            }}
          >
            <b>{hoveredPoint.label}</b> ({hoveredPoint.period})
            <div className="muted" style={{ fontSize: 11.5 }}>
              {metric === "multiple"
                ? `${hoveredPoint.val.toFixed(1)}× median`
                : metric === "views"
                ? `${hoveredPoint.views.toLocaleString("en-GB")} views`
                : `${hoveredPoint.count} post${hoveredPoint.count === 1 ? "" : "s"}`}
              {" · "}
              {hoveredPoint.count} post{hoveredPoint.count === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
