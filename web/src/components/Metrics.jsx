import React from 'react';
import { METRIC_FIELDS, sign } from '../format.js';

export default function Metrics({ metrics = {} }) {
  return (
    <div className="metrics">
      {METRIC_FIELDS.map(([key, label, fmt, colored]) => {
        const raw = metrics[key];
        return (
          <div className="metric" key={key}>
            <div className="k">{label}</div>
            <div className={`v ${colored ? sign(raw) : ''}`}>{fmt(raw)}</div>
          </div>
        );
      })}
    </div>
  );
}
