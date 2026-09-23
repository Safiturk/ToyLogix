"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import s from "./dashboard.module.css";

type Audit = {
  id: number;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};
const labels: Record<string, string> = {
  role_changed: "Rol modificat",
  approval_changed: "Aprobare modificată",
  access_changed: "Acces modificat",
  profile_deleted: "Profil șters",
  account_delete_requested: "Ștergere cont solicitată",
  recovery_codes_rotated: "Coduri de recuperare regenerate",
  mfa_recovery_used: "Recuperare 2FA",
};

export default function AuditHistory({
  refreshVersion,
}: {
  refreshVersion: number;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Audit[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("audit_logs")
        .select(
          "id,actor_id,target_user_id,action,old_value,new_value,created_at",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * 25, page * 25 + 25);
      if (!active) return;
      setLoading(false);
      if (error) {
        setRows([]);
        setError(
          "Jurnalul nu a putut fi încărcat. Verifică accesul și conexiunea.",
        );
        return;
      }
      setMore(data.length > 25);
      setRows(data.slice(0, 25));
    })();
    return () => {
      active = false;
    };
  }, [open, page, refreshVersion, reload]);
  return (
    <section className={`${s.section} p-6`}>
      <button
        className="font-bold text-lg"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Jurnal de securitate {open ? "−" : "+"}
      </button>
      {open && (
        <div className="space-y-4 mt-4">
          <p className="text-sm text-slate-500">
            Identificatorii conturilor rămân în istoric chiar și după ștergere.
          </p>
          {error && <p role="alert">{error}</p>}
          {loading ? (
            <p role="status">Se încarcă…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">Data</th>
                    <th className="p-2">Acțiune</th>
                    <th className="p-2">Autor / Cont vizat</th>
                    <th className="p-2">Înainte → După</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("ro-RO")}
                      </td>
                      <td className="p-2">
                        {labels[row.action] || row.action}
                      </td>
                      <td className="p-2 font-mono">
                        {row.actor_id || "Sistem"}
                        <br />
                        {row.target_user_id || "—"}
                      </td>
                      <td className="p-2">
                        <code>
                          {JSON.stringify(row.old_value)} →{" "}
                          {JSON.stringify(row.new_value)}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && !error && (
                <p>Nu există evenimente pe această pagină.</p>
              )}
            </div>
          )}
          <div className="flex gap-4">
            <button
              disabled={loading || page === 0}
              onClick={() => setPage(page - 1)}
            >
              ← Anterior
            </button>
            <span>{page + 1}</span>
            <button
              disabled={loading || !more}
              onClick={() => setPage(page + 1)}
            >
              Următor →
            </button>
            <button disabled={loading} onClick={() => setReload(reload + 1)}>
              Actualizează
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
