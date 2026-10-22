import { createClient } from '@supabase/supabase-js';
import { readPublicEnv } from './env-validation.ts';

export class OrderApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function orderOriginAllowed(request: Request, siteUrl?: string) {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
  if (siteUrl?.trim()) return origin === new URL(siteUrl).origin;

  // Next/proxy adapters can reconstruct request.url using an internal hostname.
  // Fetch Metadata is set by the browser (scripts cannot forge Sec-* headers).
  // A same-origin POST with an explicit JWT remains valid behind that adapter.
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin') return true;
  if (fetchSite && fetchSite !== 'none') return false;

  // Non-browser clients and older browsers: use the requested Host, retaining
  // the scheme/port checks. Do not accept an arbitrary forwarded hostname.
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  const scheme = request.headers.get('x-forwarded-proto') || url.protocol.slice(0, -1);
  if (!['http', 'https'].includes(scheme)) return false;
  try {
    const target = new URL(`${scheme}://${host}`);
    if (target.username || target.password || target.pathname !== '/' || target.search || target.hash) return false;
    return origin === target.origin;
  } catch { return false; }
}

// Order writes use the customer's JWT and database permissions. Server mail
// credentials are optional and must never block a saved order.
export async function orderContext(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  factory: typeof createClient = createClient,
) {
  const config = readPublicEnv(env);
  if (!orderOriginAllowed(request, env.AUTH_SITE_URL))
    throw new OrderApiError('Origine nepermisa. Reincarca pagina.', 403);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new OrderApiError('Autentifica-te pentru a trimite cererea.', 401);
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const client = factory(config.url, config.key, {
    auth, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at)
    throw new OrderApiError('Sesiunea a expirat. Autentifica-te din nou.', 401);
  return {
    client, user: data.user,
    privileged: env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      ? factory(config.url, env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth }) : null,
  };
}

export function orderFailure(error: unknown) {
  return error instanceof OrderApiError
    ? { error: error.message, status: error.status }
    : { error: 'Serviciul de comenzi nu este disponibil. Incearca din nou.', status: 503 };
}
