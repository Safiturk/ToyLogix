import { protectedBody, protectedContext } from "@/lib/auth-server";
import { authJson } from "@/lib/auth-handler";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { client, privileged } = await protectedContext(request);
    const body = await protectedBody(request);
    if (!Number.isSafeInteger(body.profileId) || Number(body.profileId) < 1)
      return authJson({ error: "Cont invalid." }, 400);
    // Authenticated RPC checks current role, session and MFA, locks the target,
    // blocks self-deletion/history loss, disables access and writes the actor audit.
    const { data: target, error } = await client.rpc(
      "prepare_account_deletion",
      { p_target_id: body.profileId },
    );
    if (error || !target)
      return authJson(
        {
          error:
            "Contul nu poate fi șters. Verificați drepturile 2FA și istoricul asociat; puteți închide accesul.",
        },
        403,
      );
    const { data: stillAdmin, error: denied } =
      await client.rpc("toylogix_is_admin");
    if (denied || !stillAdmin)
      return authJson(
        { error: "Drepturile de administrator au fost retrase." },
        403,
      );
    const { error: deletionError } =
      await privileged.auth.admin.deleteUser(target);
    if (deletionError)
      return authJson(
        {
          error:
            "Accesul este închis, dar ștergerea Auth nu a reușit. Verificați înregistrările sau fișierele asociate înainte de a încerca din nou.",
        },
        409,
      );
    return authJson({ ok: true });
  } catch {
    return authJson(
      {
        error:
          "Ștergerea contului nu a fost confirmată. Verificați sesiunea și configurația serverului.",
      },
      503,
    );
  }
}
