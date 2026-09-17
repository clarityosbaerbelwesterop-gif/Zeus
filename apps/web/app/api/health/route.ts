import { NextResponse } from "next/server";

export function GET() {
  const aiConfigured = Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.UNOROUTER_API_KEY_1 ||
      process.env.GEMINI_API_KEY,
  );
  const authConfigured = Boolean(process.env.NEON_AUTH_BASE_URL);
  return NextResponse.json(
    {
      status: "ok",
      aiConfigured,
      authConfigured,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
