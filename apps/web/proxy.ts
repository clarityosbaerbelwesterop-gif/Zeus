import { getAuth } from "@zeus/auth/server";
import type { NextRequest } from "next/server";

export default function proxy(request: NextRequest) {
  const protect = getAuth().middleware({ loginUrl: "/auth/sign-in" });
  return protect(request);
}

export const config = { matcher: ["/app/:path*"] };
