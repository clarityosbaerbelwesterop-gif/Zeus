import { idSchema } from "@zeus/shared";
import { dealRequestError, jsonDeal, serializeDeal } from "@/lib/deal-http";
import { getDeal, updateDealStage } from "@/lib/product";
import { assertTrustedMutationOrigin } from "@/lib/trusted-origin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const deal = await getDeal(idSchema.parse(id));
    return jsonDeal({ deal: serializeDeal(deal) });
  } catch (error) {
    return dealRequestError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await assertTrustedMutationOrigin();
    const { id } = await context.params;
    const dealId = idSchema.parse(id);
    const body = (await request.json()) as Record<string, unknown>;
    const current = await getDeal(dealId);
    const workspaceId =
      body.workspaceId === undefined ? current.workspaceId : idSchema.parse(body.workspaceId);
    if (workspaceId !== current.workspaceId) throw new Error("Deal not found.");
    if (typeof body.stage !== "string") throw new Error("Invalid deal request.");
    const deal = await updateDealStage({ dealId, workspaceId, stage: body.stage });
    return jsonDeal({ deal: serializeDeal(deal) });
  } catch (error) {
    return dealRequestError(error);
  }
}
