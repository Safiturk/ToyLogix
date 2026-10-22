"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { currentAccount } from "@/lib/account";
import { supabase } from "@/lib/supabase";
export default function AccessGate({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let checking = false;
    let generation = 0;
    let controller: AbortController | undefined;
    async function check() {
      if (!active || checking) return;
      checking = true;
      const run = ++generation;
      controller = new AbortController();
      const signal = controller.signal;
      const isCurrent = () => active && run === generation && !signal.aborted;
      const timeout = setTimeout(() => {
        if (!isCurrent()) return;
        controller?.abort();
        checking = false;
        setAllowed(false);
        setError(true);
      }, 12000);
      try {
        const profile = await currentAccount(signal);
        if (!isCurrent()) return;
        if (!profile || profile.is_active === false) {
          setAllowed(false);
          router.replace("/login");
          return;
        }
        if (
          profile.status !== "approved" ||
          (admin && profile.rol !== "admin")
        ) {
          setAllowed(false);
          router.replace(admin ? "/store" : "/account");
          return;
        }
        if (profile.rol === "admin") {
          const { data, error } = await supabase.rpc("toylogix_is_admin").abortSignal(signal);
          if (!isCurrent()) return;
          if (error) throw error;
          if (!data) {
            setAllowed(false);
            router.replace("/account/security");
            return;
          }
        }
        localStorage.setItem("user_session", JSON.stringify(profile));
        localStorage.removeItem("admin_authenticated");
        setAllowed(true);
        setError(false);
      } catch {
        if (isCurrent()) {
          setAllowed(false);
          setError(true);
        }
      } finally {
        clearTimeout(timeout);
        if (run === generation) checking = false;
      }
    }
    void check();
    const focus = () => {
      void check();
    };
    window.addEventListener("focus", focus);
    const interval = setInterval(focus, 30000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // check() already handles initial hydration. Avoid a second identical
      // Auth/profile request when Supabase emits INITIAL_SESSION.
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") {
        generation++;
        controller?.abort();
        checking = false;
        setAllowed(false);
        router.replace("/login");
        return;
      }
      // A changed token/user must invalidate any result still in flight.
      generation++;
      controller?.abort();
      checking = false;
      setTimeout(() => {
        if (active) void check();
      }, 0);
    });
    return () => {
      active = false;
      controller?.abort();
      clearInterval(interval);
      subscription.unsubscribe();
      window.removeEventListener("focus", focus);
    };
  }, [admin, router, retry]);
  if (!allowed)
    return (
      <div
        role="status"
        className="min-h-screen grid place-items-center bg-slate-50 p-8 text-slate-700"
      >
        {error ? (
          <div className="text-center space-y-4">
            <p>Verificarea accesului dureaza prea mult sau conexiunea nu este disponibila.</p>
            <button className="underline" onClick={() => {
              setError(false);
              setRetry((value) => value + 1);
            }}>Incearca din nou</button>
          </div>
        ) : "Se verifica accesul…"}
      </div>
    );
  return children;
}
