"use server";

import { getAuth } from "@zeus/auth/server";
import { redirect } from "next/navigation";
import { assertTrustedMutationOrigin } from "@/lib/trusted-origin";

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signIn(_previous: { error: string } | null, formData: FormData) {
  await assertTrustedMutationOrigin();
  const email = field(formData, "email").trim();
  const password = field(formData, "password");
  if (!email || !password) return { error: "Enter your email and password." };
  const { error } = await getAuth().signIn.email({ email, password });
  if (error) return { error: error.message || "Sign in failed." };
  redirect("/app");
}
