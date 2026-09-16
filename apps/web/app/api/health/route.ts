import { NextResponse } from "next/server";

export function GET() {
  const aiConfigured = Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.UNOROUTER_API_KEY_1 ||
      process.env.GEMINI_API_KEY,
  );
  const authConfigured = true; // Auth works out of the box with local session store and Neon Auth when configured
  return NextResponse.json(
    {
      status: "ok",
      aiConfigured,
      authConfigured,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
