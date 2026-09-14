"use server";

import { getAuth } from "@zeus/auth/server";
import { redirect } from "next/navigation";

export async function signUp(_previous: { error: string } | null, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || password.length < 8) return { error: "Use a name, valid email and at least 8 password characters." };
  const { error } = await getAuth().signUp.email({ name, email, password });
  if (error) return { error: error.message || "Account creation failed." };
  redirect("/app");
}
