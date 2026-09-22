"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Visitor = { id: string; pathname: string };
type Snapshot = { visitors: Visitor[]; connected: boolean };
const PresenceContext = createContext<Snapshot>({
  visitors: [],
  connected: false,
});
export const useLivePresence = () => useContext(PresenceContext);

// Public room: intentionally exclude names, emails, account IDs and session data.
export default function LivePresence({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pathRef = useRef(pathname);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    visitors: [],
    connected: false,
  });

  useEffect(() => {
    pathRef.current = pathname;
    const channel = channelRef.current;
    if (channel?.state === "joined") {
      if (pathname.startsWith("/admin")) void channel.untrack();
      else void channel.track({ pathname });
    }
  }, [pathname]);

  useEffect(() => {
    let disposed = false;
    const channel = supabase.channel("storefront-presence-v1", {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channelRef.current = channel;
    const track = () => {
      if (
        !disposed &&
        channel.state === "joined" &&
        !pathRef.current.startsWith("/admin")
      ) {
        void channel.track({ pathname: pathRef.current });
      }
    };
    channel
      .on("presence", { event: "sync" }, () => {
        if (disposed) return;
        const visitors = Object.entries(
          channel.presenceState<{ pathname?: unknown }>(),
        )
          .flatMap(([id, entries]) => {
            const path = entries.at(-1)?.pathname;
            return typeof path === "string" &&
              path.startsWith("/") &&
              !path.startsWith("/admin")
              ? [{ id, pathname: path.slice(0, 300) }]
              : [];
          })
          .sort((a, b) => a.id.localeCompare(b.id));
        setSnapshot({ visitors, connected: true });
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          setSnapshot((current) => ({ ...current, connected: true }));
          track();
        } else {
          setSnapshot({ visitors: [], connected: false });
        }
      });
    const leave = () => {
      void channel.untrack();
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", track);
    return () => {
      disposed = true;
      channelRef.current = null;
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", track);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <PresenceContext.Provider value={snapshot}>
      {children}
    </PresenceContext.Provider>
  );
}
