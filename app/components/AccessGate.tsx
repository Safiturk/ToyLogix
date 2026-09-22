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
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const profile = await currentAccount();
        if (!active) return;
        if (!profile) {
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
        localStorage.setItem("user_session", JSON.stringify(profile));
        localStorage.removeItem("admin_authenticated");
        setAllowed(true);
        setError(false);
      } catch {
        if (active) {
          setAllowed(false);
          setError(true);
        }
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
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (active) void check();
      }, 0);
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.unsubscribe();
      window.removeEventListener("focus", focus);
    };
  }, [admin, router]);
  if (!allowed)
    return (
      <div
        role="status"
        className="min-h-screen grid place-items-center bg-slate-50 p-8 text-slate-700"
      >
        {error
          ? "Accesul nu poate fi verificat. Reîncarcă pagina sau contactează administratorul."
          : "Se verifică accesul…"}
      </div>
    );
  return children;
}
