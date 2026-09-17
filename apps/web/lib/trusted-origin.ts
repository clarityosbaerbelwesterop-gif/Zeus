import { headers } from "next/headers";
import { assertTrustedOrigin, isHostedRuntime, resolvePublicOrigin } from "@zeus/security";

export async function assertTrustedMutationOrigin(): Promise<void> {
  const publicOrigin = resolvePublicOrigin();
  if (!publicOrigin) {
    if (isHostedRuntime()) {
      throw new Error("ZEUS_PUBLIC_ORIGIN or ZEUS_APP_URL is required for state-changing actions.");
    }
    return;
  }
  const requestHeaders = await headers();
  const requestOrigin = requestHeaders.get("origin") ?? requestHeaders.get("referer");
  assertTrustedOrigin(requestOrigin, publicOrigin);
}
