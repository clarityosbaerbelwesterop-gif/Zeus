import { getAuth } from "@zeus/auth/server";

export const dynamic = "force-dynamic";
const handlers = getAuth().handler();
export const GET = handlers.GET;
export const POST = handlers.POST;
