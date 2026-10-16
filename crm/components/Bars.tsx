// Horizontal bars on one hue: magnitude read from length, value written at the tip (never colour alone).
export type BarItem = { label: string; value: number; display: string; sub?: string; tip: string };

export default function Bars({ items, max, ariaLabel }: { items: BarItem[]; max?: number; ariaLabel: string }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars" role="list" aria-label={ariaLabel}>
      {items.map((i) => (
        <div key={i.label} className="bar-row" role="listitem" tabIndex={0} data-tip={i.tip} aria-label={i.tip}>
          <span className="bar-label">{i.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${i.value > 0 ? Math.max(1.5, (i.value / top) * 100) : 0}%` }} /></span>
          <span className="bar-value">{i.display}</span>
          {i.sub && <span className="bar-sub">{i.sub}</span>}
        </div>
      ))}
    </div>
  );
}
