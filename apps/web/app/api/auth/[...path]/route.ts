/* eslint-disable */
import { getAuth } from "@zeus/auth/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const handlers = getAuth().handler() as any;
  return handlers.GET(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const handlers = getAuth().handler() as any;
  return handlers.POST(request, context);
}
