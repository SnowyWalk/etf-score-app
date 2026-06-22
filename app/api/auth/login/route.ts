import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth/session";
import { authenticateAppPassword } from "@/lib/portfolio/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  let password = "";

  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!password || password.length > 128) {
    return NextResponse.json({ error: "비밀번호를 확인하세요." }, { status: 401 });
  }

  const result = authenticateAppPassword(password, getClientKey(request));

  if (!result.ok) {
    if (result.retryAfterSeconds) {
      return NextResponse.json(
        { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }
      );
    }

    return NextResponse.json({ error: "비밀번호를 확인하세요." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    AUTH_COOKIE_NAME,
    result.token,
    authCookieOptions(result.expiresAt)
  );

  return response;
}
