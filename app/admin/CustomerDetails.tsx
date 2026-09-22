"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { billingFields, type Billing } from "@/lib/account";
import { openDialog } from "@/lib/dialog";
import s from "../customer.module.css";
type Customer = {
  id: number;
  nume_complet: string;
  email: string;
  telefon: string;
  nume_firma?: string | null;
  rol: string;
  status: string;
};
export default function CustomerDetails({
  user,
  close,
}: {
  user: Customer;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [message, setMessage] = useState("Se încarcă datele…");
  useEffect(() => {
    let active = true;
    const restorePage = openDialog(dialog.current);
    void (async () => {
      const { data: profile, error } = await supabase
        .from("utilizatori")
        .select("auth_user_id")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      if (!profile.auth_user_id) {
        if (active)
          setMessage(
            "Contul nu este încă asociat cu un utilizator autentificat.",
          );
        return;
      }
      const { data, error: failure } = await supabase
        .from("billing_profiles")
        .select("*")
        .eq("user_id", profile.auth_user_id)
        .maybeSingle();
      if (failure) throw failure;
      if (active) {
        setBilling(data);
        setMessage(
          data ? "" : "Clientul nu a completat încă datele de facturare.",
        );
      }
    })().catch(() => {
      if (active)
        setMessage(
          "Datele nu pot fi încărcate. Verifică accesul și conexiunea.",
        );
    });
    return () => {
      active = false;
      restorePage();
    };
  }, [user.id]);
  return (
    <dialog
      ref={dialog}
      className={s.dialog}
      aria-labelledby="customer-details-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={s.dialogContent}>
        <div className={s.dialogTop}>
          <h2 id="customer-details-title">{user.nume_complet}</h2>
          <button className={s.iconButton} aria-label="Închide" onClick={close}>
            ✕
          </button>
        </div>
        <dl className={s.specifications}>
          {[
            ["Email", user.email],
            ["Telefon", user.telefon],
            ["Firmă", user.nume_firma],
            ["Rol", user.rol],
            ["Status", user.status],
            ...billingFields.map(([key, label]) => [label, billing?.[key]]),
            [
              "Plătitor de TVA",
              billing ? (billing.vat_registered ? "Da" : "Nu") : "",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "Necompletat"}</dd>
            </div>
          ))}
        </dl>
        {message && <p role="status">{message}</p>}
      </div>
    </dialog>
  );
}
