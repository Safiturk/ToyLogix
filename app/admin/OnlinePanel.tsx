"use client";

import { useLivePresence } from "../components/LivePresence";
import s from "./wings.module.css";

export default function OnlinePanel() {
  const { visitors, connected } = useLivePresence();
  return (
    <aside className={s.panel} aria-label="Utilizatori online">
      <header className={s.panelHeader}>
        <h2><span className={`${s.dot} ${connected ? s.live : ""}`} aria-hidden="true" />Utilizatori Online</h2>
        <p role="status">{connected ? `${visitors.length} sesiuni conectate` : "Se conectează…"}</p>
      </header>
      {!connected ? <p className={s.empty}>Lista se actualizează automat când conexiunea este disponibilă.</p>
        : visitors.length === 0 ? <p className={s.empty}>Niciun vizitator conectat momentan.</p>
        : <ul className={s.list}>{visitors.map((visitor) => (
          <li key={visitor.id}>
            <span className={s.avatar} aria-hidden="true">V</span>
            <div><strong>Vizitator <small>· {visitor.id.slice(0, 4)}</small></strong><p title={visitor.pathname}>{visitor.pathname}</p></div>
          </li>
        ))}</ul>}
      <footer className={s.panelFooter}>Activitate în timp real · sesiuni anonime</footer>
    </aside>
  );
}
