"use server";

import { getAuth } from "@zeus/auth/server";
import { redirect } from "next/navigation";
import { assertTrustedMutationOrigin } from "@/lib/trusted-origin";

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signUp(_previous: { error: string } | null, formData: FormData) {
  await assertTrustedMutationOrigin();
  const name = field(formData, "name").trim();
  const email = field(formData, "email").trim();
  const password = field(formData, "password");
  if (!name || !email || password.length < 8) {
    return { error: "Use a name, valid email and at least 8 password characters." };
  }
  const { error } = await getAuth().signUp.email({ name, email, password });
  if (error) return { error: error.message || "Account creation failed." };
  redirect("/app");
}
