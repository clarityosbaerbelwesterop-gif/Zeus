import { idSchema } from "@zeus/shared";
import { dealRequestError, jsonDeal, serializeDeal } from "@/lib/deal-http";
import { createDeal, listDeals } from "@/lib/product";
import { assertTrustedMutationOrigin } from "@/lib/trusted-origin";

export const dynamic = "force-dynamic";

function optionalUuid(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return idSchema.parse(value);
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Invalid deal request.");
  return value;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const workspaceId = idSchema.parse(url.searchParams.get("workspaceId"));
    const stage = url.searchParams.get("stage") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const deals = await listDeals({
      workspaceId,
      ...(stage ? { stage } : {}),
      ...(status ? { status } : {}),
    });
    return jsonDeal({ deals: deals.map(serializeDeal) });
  } catch (error) {
    return dealRequestError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await assertTrustedMutationOrigin();
    const body = (await request.json()) as Record<string, unknown>;
    const workspaceId = idSchema.parse(body.workspaceId);
    if (typeof body.title !== "string") throw new Error("Invalid deal request.");
    const dealId = await createDeal({
      workspaceId,
      title: body.title,
      ...(typeof body.stage === "string" ? { stage: body.stage } : {}),
      ...(typeof body.status === "string" ? { status: body.status } : {}),
      ...(typeof body.valueCents === "number" || body.valueCents === null
        ? { valueCents: body.valueCents }
        : {}),
      ...(typeof body.currency === "string" || body.currency === null
        ? { currency: body.currency }
        : {}),
      ownerUserId: optionalString(body.ownerUserId),
      conversationId: optionalUuid(body.conversationId),
    });
    return jsonDeal({ id: dealId }, 201);
  } catch (error) {
    return dealRequestError(error);
  }
}
