import "server-only";

import { NextResponse } from "next/server";

import { isValidAuthSession } from "@/lib/portfolio/repository";

export const AUTH_COOKIE_NAME = "etf_score_session";

export function getSessionTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const prefix = `${AUTH_COOKIE_NAME}=`;
  const entry = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
}

export function requireApiAuth(request: Request) {
  const token = getSessionTokenFromRequest(request);

  if (isValidAuthSession(token)) {
    return undefined;
  }

  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export function authCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    expires: expiresAt,
  };
}
