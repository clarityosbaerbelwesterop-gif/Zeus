/* eslint-disable */
import { createNeonAuth } from "@neondatabase/auth/next/server";

let instance: ReturnType<typeof createNeonAuth> | undefined;

const mockUser = {
  id: "usr_lead_operator",
  email: "operator@zeus.local",
  name: "Lead Operator",
};

function createMockAuth(): ReturnType<typeof createNeonAuth> {
  return {
    handler: () => ({
      GET: async () =>
        new Response(JSON.stringify({ status: "mock_auth", user: mockUser }), {
          headers: { "content-type": "application/json" },
        }),
      POST: async () =>
        new Response(JSON.stringify({ status: "mock_auth", user: mockUser }), {
          headers: { "content-type": "application/json" },
        }),
    }),
    getSession: async () => ({
      data: { user: mockUser } as any,
      error: null,
    }),
    signIn: {
      email: async (params: { email: string; password?: string }) => ({
        data: {
          user: { id: "usr_lead_operator", email: params.email, name: params.email.split("@")[0] },
        } as any,
        error: null,
      }),
    } as any,
    signUp: {
      email: async (params: { name?: string; email: string; password?: string }) => ({
        data: {
          user: { id: "usr_lead_operator", email: params.email, name: params.name ?? "User" },
        } as any,
        error: null,
      }),
    } as any,
    middleware: () => {
      return () => undefined as any;
    },
  } as unknown as ReturnType<typeof createNeonAuth>;
}

export function getAuth(): ReturnType<typeof createNeonAuth> {
  if (instance) return instance;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret || secret.length < 32) {
    console.warn(
      "[Zeus] Neon Auth not configured (NEON_AUTH_BASE_URL / NEON_AUTH_COOKIE_SECRET missing). Using local mock auth session.",
    );
    instance = createMockAuth();
    return instance;
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
