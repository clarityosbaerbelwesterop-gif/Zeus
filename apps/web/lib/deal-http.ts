export function jsonDeal(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

function isZodError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && (error as { name?: string }).name === "ZodError",
  );
}

export function dealRequestError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Request failed.";
  if (message === "UNAUTHENTICATED") {
    return jsonDeal({ error: "Authentication required." }, 401);
  }
  if (/permission|cross-origin mutation denied/iu.test(message)) {
    return jsonDeal({ error: "Forbidden." }, 403);
  }
  if (/not found/iu.test(message)) {
    return jsonDeal({ error: "Not found." }, 404);
  }
  if (isZodError(error) || /invalid|unknown deal|must be/iu.test(message)) {
    return jsonDeal({ error: "Invalid deal request." }, 400);
  }
  return jsonDeal({ error: "Invalid deal request." }, 400);
}

export function serializeDeal(deal: {
  id: string;
  workspaceId: string;
  title: string;
  stage: string;
  valueCents: number | null;
  currency: string | null;
  ownerUserId: string;
  conversationId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: deal.id,
    workspaceId: deal.workspaceId,
    title: deal.title,
    stage: deal.stage,
    valueCents: deal.valueCents,
    currency: deal.currency,
    ownerUserId: deal.ownerUserId,
    conversationId: deal.conversationId,
    status: deal.status,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}
