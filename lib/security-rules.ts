export type AccessProfile = {
  rol: string;
  status: string;
  is_active?: boolean;
};

export function accountDestination(
  profile: AccessProfile | null,
  mfaVerified = false,
) {
  if (
    !profile ||
    profile.is_active === false ||
    !["pending", "approved"].includes(profile.status)
  )
    return "/login";
  if (profile.status === "pending")
    return profile.rol === "admin" ? "/login" : "/account";
  if (profile.rol === "admin")
    return mfaVerified ? "/admin" : "/account/security";
  return "/store";
}

export function parseAuthLink(url: string) {
  const parsed = new URL(url);
  const hash = new URLSearchParams(parsed.hash.slice(1));
  const error = [hash, parsed.searchParams].some(
    (params) => params.has("error") || params.has("error_code"),
  );
  return {
    error,
    type: hash.get("type"),
    hasTokens: Boolean(hash.get("access_token") && hash.get("refresh_token")),
  };
}

export function isRecoveryLink(
  link: ReturnType<typeof parseAuthLink>,
  methods: ({ method: string; timestamp: number } | string)[],
  now = Date.now() / 1000,
) {
  return (
    !link.error &&
    link.type === "recovery" &&
    link.hasTokens &&
    methods.some(
      (entry) =>
        typeof entry !== "string" &&
        entry.method === "recovery" &&
        entry.timestamp <= now + 60 &&
        entry.timestamp > now - 1800,
    )
  );
}

export const authLimits = {
  login: { ip: 30, email: 10, seconds: 600 },
  signup: { ip: 5, email: 3, seconds: 3600 },
  reset: { ip: 10, email: 3, seconds: 3600 },
} as const;

export type AuthAction = keyof typeof authLimits;
