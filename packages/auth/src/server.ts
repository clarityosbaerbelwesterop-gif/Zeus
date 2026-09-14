import { createNeonAuth } from "@neondatabase/auth/next/server";

let instance: ReturnType<typeof createNeonAuth> | undefined;

export function getAuth(): ReturnType<typeof createNeonAuth> {
  if (instance) return instance;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret || secret.length < 32) {
    throw new Error("Zeus authentication is not configured.");
  }
  instance = createNeonAuth({
    baseUrl,
    cookies: { secret },
    logLevel: process.env.NODE_ENV === "production" ? "warn" : "silent",
  });
  return instance;
}

export async function requireSession() {
  const { data: session, error } = await getAuth().getSession();
  if (error || !session?.user) throw new Error("UNAUTHENTICATED");
  return session;
}
