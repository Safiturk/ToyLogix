type Result<T> = { data: T; error: { code?: string; message?: string } | null };
export interface DeletionBackend {
  user(token: string): Promise<{ id: string; confirmed: boolean } | null>;
  isAdmin(): Promise<boolean>;
  target(id: number): Promise<Result<{ auth_user_id: string | null } | null>>;
  prepare(id: number): Promise<Result<string | null>>;
  legacySchema(): Promise<boolean>;
  deleteUnlinked(id: number): Promise<boolean>;
  deleteAuth(id: string): Promise<boolean>;
}

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export function deletionHandler(makeBackend: (token: string) => DeletionBackend) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return json({ error: "Metodă nepermisă." }, 405);
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return json({ error: "Autentificarea este necesară." }, 401);
    if (!request.headers.get("content-type")?.includes("application/json"))
      return json({ error: "Format invalid." }, 415);
    if (Number(request.headers.get("content-length")) > 2048)
      return json({ error: "Cerere prea mare." }, 413);
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 2048)
        return json({ error: "Cerere prea mare." }, 413);
      let body;
      try { body = JSON.parse(raw); }
      catch { return json({ error: "Cerere invalidă." }, 400); }
      if (!body || !Number.isSafeInteger(body.profileId) || body.profileId < 1)
        return json({ error: "Cont invalid." }, 400);

      const backend = makeBackend(token);
      const actor = await backend.user(token);
      if (!actor?.confirmed) return json({ error: "Sesiunea a expirat. Autentificați-vă din nou." }, 401);
      if (!await backend.isAdmin())
        return json({ error: "Doar administratorii pot șterge conturi." }, 403);
      const target = await backend.target(body.profileId);
      if (target.error) return json({ error: "Contul nu poate fi verificat." }, 503);
      if (!target.data) return json({ error: "Contul nu mai există. Reîncărcați lista." }, 404);
      if (target.data.auth_user_id === actor.id)
        return json({ error: "Nu puteți șterge propriul cont." }, 403);

      const prepared = await backend.prepare(body.profileId);
      // A missing RPC is compatible ONLY with the confirmed legacy schema.
      // Permission, history and MFA failures never fall back to legacy deletion.
      const legacy = prepared.error?.code === "PGRST202" &&
        prepared.error.message?.includes("public.prepare_account_deletion") &&
        await backend.legacySchema();
      if (!legacy && (prepared.error || !prepared.data))
        return json({ error: "Contul nu poate fi șters. Verificați drepturile 2FA și istoricul asociat." }, 403);
      if (!legacy && prepared.data !== target.data.auth_user_id)
        return json({ error: "Contul s-a modificat. Reîncărcați lista." }, 409);
      if (!await backend.isAdmin())
        return json({ error: "Drepturile de administrator au fost retrase." }, 403);
      const deleted = target.data.auth_user_id
        ? await backend.deleteAuth(target.data.auth_user_id)
        : legacy && await backend.deleteUnlinked(body.profileId);
      if (!deleted)
        return json({ error: "Contul nu a fost șters. Înregistrările sau fișierele asociate pot împiedica ștergerea." }, 409);
      return json({ ok: true });
    } catch {
      return json({ error: "Serviciul de ștergere nu este disponibil. Încercați din nou." }, 503);
    }
  };
}
