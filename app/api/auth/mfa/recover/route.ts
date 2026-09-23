import { protectedBody, protectedContext } from "@/lib/auth-server";
import { authJson } from "@/lib/auth-handler";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { client, privileged, user, token } = await protectedContext(request);
    const body = await protectedBody(request);
    if (
      typeof body.code !== "string" ||
      !/^[a-f\d]{32}$/i.test(body.code.trim())
    )
      return authJson({ error: "Codul de recuperare nu este valid." }, 400);
    const { data: accepted, error } = await client.rpc(
      "consume_recovery_code",
      { p_code: body.code.trim() },
    );
    if (error || !accepted)
      return authJson(
        {
          error:
            "Cod indisponibil sau prea multe încercări. Așteptați 10 minute înainte de a încerca din nou.",
        },
        403,
      );
    const { data: factors, error: listError } =
      await privileged.auth.admin.mfa.listFactors({ userId: user.id });
    if (listError) throw listError;
    for (const factor of factors.factors) {
      const { error: removalError } =
        await privileged.auth.admin.mfa.deleteFactor({
          userId: user.id,
          id: factor.id,
        });
      if (removalError) throw removalError;
    }
    const { error: logoutError } = await privileged.auth.admin.signOut(
      token,
      "global",
    );
    if (logoutError) throw logoutError;
    return authJson({ ok: true });
  } catch {
    return authJson(
      {
        error:
          "Recuperarea nu a fost finalizată. Codul poate fi deja consumat; reconectați-vă și verificați starea 2FA.",
      },
      503,
    );
  }
}
