import React from 'react';

// Dependency-free SVG line chart. Plots a strategy equity curve and an optional
// buy-and-hold baseline overlay, normalized to a shared value axis.
export default function EquityChart({ series = [], height = 200 }) {
  const W = 600, H = height, padL = 8, padR = 8, padT = 10, padB = 18;
  const valid = series.filter((s) => Array.isArray(s.points) && s.points.length > 1);
  if (valid.length === 0) {
    return <div className="chart"><svg viewBox={`0 0 ${W} ${H}`}><text x={W / 2} y={H / 2} fill="#8b97ac" textAnchor="middle" fontSize="12">No equity data</text></svg></div>;
  }

  const all = valid.flatMap((s) => s.points);
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const n = Math.max(...valid.map((s) => s.points.length));
  const x = (i, len) => padL + (i / (len - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const path = (pts) => pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, pts.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  // Horizontal gridlines (3).
  const grid = [0.25, 0.5, 0.75].map((f) => padT + f * (H - padT - padB));

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {grid.map((gy, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="#1e2738" strokeWidth="1" />
        ))}
        {valid.map((s, i) => (
          <path key={i} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.width || 2}
            strokeDasharray={s.dashed ? '4 4' : undefined} strokeLinejoin="round" strokeLinecap="round" opacity={s.dashed ? 0.8 : 1} />
        ))}
      </svg>
    </div>
  );
}
