import React from 'react';

// The left rail now only hosts the pre-built ("subscribe") strategies.
// Building a new strategy happens entirely in the chat flow.
export default function Sidebar({ templates, onSubscribe, onCreate }) {
  return (
    <aside className="sidebar">
      <button className="create-cta" onClick={onCreate}>+ Create strategy</button>

      <h3>Pre-built strategies</h3>
      <p className="side-hint">Subscribe to a ready-made strategy — it runs immediately and you can save it to your portfolio.</p>
      <div className="templates">
        {templates.map((t) => (
          <div className="tpl" key={t.id} onClick={() => onSubscribe(t)}>
            <b>{t.name}</b>
            <small>{t.description}</small>
            <div className="tags">
              <span>{t.asset_class}</span>
              {(t.required_skills || []).map((s) => <span key={s}>{s}</span>)}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
