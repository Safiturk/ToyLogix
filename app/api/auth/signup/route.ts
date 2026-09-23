import { handlePasswordAuth } from "@/lib/auth-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handlePasswordAuth("signup", request);
}
