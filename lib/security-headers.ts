export function securityHeaders(production: boolean) {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
  ];
}
export function contentSecurityPolicy(nonce: string, supabaseUrl: string, production: boolean) {
  const origin = new URL(supabaseUrl).origin;
  const websocket = origin.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"}`,
    // Existing interactive components use style attributes (zoom/animations).
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${origin} ${websocket}${production ? "" : " ws://localhost:* ws://127.0.0.1:*"}`,
    "img-src 'self' https: data: blob:",
    "font-src 'self'", "worker-src 'self' blob:", "media-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
