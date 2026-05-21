"use server";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import { PASSWORD } from "../config";

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (password !== PASSWORD) {
    redirect("/login?error=1");
  }
  const session = await getSession();
  session.authenticated = true;
  session.loginAt = Date.now();
  await session.save();
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
