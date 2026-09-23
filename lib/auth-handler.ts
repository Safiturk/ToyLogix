import {
  accountDestination,
  authLimits,
  type AccessProfile,
  type AuthAction,
} from "./security-rules.ts";
import {
  hasPasswordComplexity,
  isEmailAddress,
  isRomanianPhone,
} from "./auth-validation.ts";

type LoginResult = {
  session?: { access_token: string; refresh_token: string };
  profile?: AccessProfile | null;
  error?: string;
};
export interface AuthBackend {
  limit(
    key: string,
    limit: number,
    seconds: number,
  ): Promise<{ allowed: boolean; retryAfter: number }>;
  login(email: string, password: string): Promise<LoginResult>;
  signup(
    email: string,
    password: string,
    metadata: Record<string, string>,
    redirect: string,
  ): Promise<void>;
  reset(email: string, redirect: string): Promise<void>;
}

export function authJson(data: unknown, status = 200, retryAfter?: number) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}

export function createAuthHandler(
  action: AuthAction,
  backend: AuthBackend,
  options: { siteUrl: string; netlify?: boolean },
) {
  return async (request: Request) => {
    try {
      const origin = new URL(options.siteUrl).origin;
      if (request.headers.get("origin") !== origin)
        return authJson({ error: "Origine nepermisă." }, 403);
      if (!request.headers.get("content-type")?.includes("application/json"))
        return authJson({ error: "Format invalid." }, 415);
      if (Number(request.headers.get("content-length")) > 8192)
        return authJson({ error: "Cerere prea mare." }, 413);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 8192)
        return authJson({ error: "Cerere prea mare." }, 413);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
      } catch {
        return authJson({ error: "Cerere invalidă." }, 400);
      }
      if (!body || Array.isArray(body) || typeof body !== "object")
        return authJson({ error: "Cerere invalidă." }, 400);
      // Netlify replaces this header at its edge. Never trust arbitrary X-Forwarded-For.
      const ip = options.netlify
        ? request.headers.get("x-nf-client-connection-ip") || "unknown"
        : "shared";
      const limits = authLimits[action];
      const ipLimit = await backend.limit(
        `${action}:ip:${ip}`,
        limits.ip,
        limits.seconds,
      );
      if (!ipLimit.allowed)
        return authJson(
          { error: "Prea multe încercări. Încercați mai târziu." },
          429,
          ipLimit.retryAfter,
        );
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email.length > 254 || !isEmailAddress(email))
        return authJson({ error: "Adresa de email nu este validă." }, 400);
      const emailLimit = await backend.limit(
        `${action}:email:${email}`,
        limits.email,
        limits.seconds,
      );
      if (!emailLimit.allowed)
        return authJson(
          { error: "Prea multe încercări. Încercați mai târziu." },
          429,
          emailLimit.retryAfter,
        );
      if (action === "reset") {
        await backend.reset(email, `${origin}/update-password`);
        return authJson({ ok: true });
      }
      const password = typeof body.password === "string" ? body.password : "";
      if (!password || password.length > 128)
        return authJson({ error: "Parola nu este validă." }, 400);
      if (action === "login") {
        const result = await backend.login(email, password);
        if (!result.session || result.error)
          return authJson(
            {
              error:
                "Email sau parolă incorectă. Verificați confirmarea emailului.",
            },
            401,
          );
        const destination = accountDestination(result.profile ?? null);
        if (destination === "/login")
          return authJson(
            {
              error: "Accesul nu este disponibil. Contactați echipa ToyLogix.",
            },
            403,
          );
        return authJson({ session: result.session, destination });
      }
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const company =
        typeof body.company === "string" ? body.company.trim() : "";
      if (
        password.length < 8 ||
        !hasPasswordComplexity(password) ||
        !name ||
        name.length > 200 ||
        company.length > 200 ||
        !isRomanianPhone(phone)
      )
        return authJson(
          { error: "Verificați numele, telefonul și cerințele parolei." },
          400,
        );
      await backend.signup(
        email,
        password,
        { nume_complet: name, telefon: phone, nume_firma: company },
        `${origin}/email-confirmed`,
      );
      return authJson({ ok: true, needsEmailConfirmation: true });
    } catch {
      // No credentials, existence hints or provider internals are returned/logged.
      return authJson(
        { error: "Serviciul nu este disponibil. Încercați mai târziu." },
        503,
      );
    }
  };
}
