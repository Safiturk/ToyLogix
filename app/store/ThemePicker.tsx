"use client";
import { useEffect, useRef } from "react";
import { openDialog } from "@/lib/dialog";
import { useCatalogTheme } from "./useCatalogTheme";
import s from "./theme-picker.module.css";

export default function ThemePicker({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { preference, selectTheme, saving, ready, message } = useCatalogTheme();
  useEffect(() => openDialog(ref.current), []);
  return <dialog ref={ref} className={s.dialog} aria-labelledby="appearance-title" onCancel={close}
    onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className={s.content}>
      <header><div><small>PERSONALIZARE</small><h2 id="appearance-title">Aspectul magazinului</h2></div><button type="button" onClick={close} aria-label="Închide aspectul">×</button></header>
      <p>Alege cum arată magazinul pentru tine. Preferința se salvează în contul tău.</p>
      <div className={s.options}>
        <button type="button" className={s.option} aria-pressed={preference !== "petrol"} disabled={saving || !ready}
          onClick={() => void selectTheme("system")}>
          <span className={`${s.preview} ${s.classic}`} aria-hidden="true"><i /><span><b /><b /><b /></span></span>
          <span className={s.optionTitle}>Clasic <span>{preference !== "petrol" ? "✓" : ""}</span></span>
          <small>Aspectul original ToyLogix</small>
        </button>
        <button type="button" className={s.option} aria-pressed={preference === "petrol"} disabled={saving || !ready}
          onClick={() => void selectTheme("petrol")}>
          <span className={`${s.preview} ${s.petrol}`} aria-hidden="true"><i /><span><b /><b /><b /></span></span>
          <span className={s.optionTitle}>Petrol <span>{preference === "petrol" ? "✓" : ""}</span></span>
          <small>Turcoaz profund · Antracit</small>
        </button>
      </div>
      {preference !== "petrol" && <fieldset className={s.modes}><legend>Luminozitate</legend>
        {([['light', 'Luminos'], ['dark', 'Întunecat'], ['system', 'După dispozitiv']] as const).map(([value, label]) =>
          <label key={value}><input type="radio" name="catalog-mode" value={value} checked={preference === value} disabled={saving || !ready} onChange={() => void selectTheme(value)} />{label}</label>)}
      </fieldset>}
      <p className={s.status} role="status">{saving ? "Se salvează…" : message || "Schimbarea este vizibilă doar în contul tău."}</p>
    </div>
  </dialog>;
}
