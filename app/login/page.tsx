import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { AUTH_COOKIE_NAME } from "@/lib/auth/session";
import { isValidAuthSession } from "@/lib/portfolio/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "로그인 | ETF Portfolio Operator",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (isValidAuthSession(token)) {
    redirect("/");
  }

  return <LoginForm />;
}
