import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      aiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      authConfigured: Boolean(process.env.NEON_AUTH_BASE_URL),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
