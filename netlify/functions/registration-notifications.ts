import { createClient } from "@supabase/supabase-js";
import { readServerEnv } from "../../lib/env-validation";
import { sendRegistrationNotification, type RegistrationNotification } from "../../lib/registration-notifications";

export default async function handler() {
  const env = readServerEnv(process.env);
  if (!env.mail || !env.secret) throw new Error("Notification server configuration is incomplete");
  const client = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc("claim_registration_notifications").abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error("Notification queue unavailable");
  const results = await Promise.allSettled((data as RegistrationNotification[] ?? []).map(async (item) => {
    await sendRegistrationNotification(item, env.mail!);
    const { error } = await client.from("registration_notifications")
      .update({ sent_at: new Date().toISOString() }).eq("user_id", item.user_id)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error("Notification acknowledgement failed");
  }));
  if (results.some((result) => result.status === "rejected")) throw new Error("Some notifications will be retried from the durable queue");
}
export const config = { schedule: "*/5 * * * *" };
