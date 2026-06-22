import { NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  getSessionTokenFromRequest,
} from "@/lib/auth/session";
import { deleteAuthSession } from "@/lib/portfolio/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  deleteAuthSession(getSessionTokenFromRequest(request));

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
