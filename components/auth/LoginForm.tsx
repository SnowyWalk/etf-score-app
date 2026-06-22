"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm() {
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsPending(true);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "로그인에 실패했습니다.");
        return;
      }

      window.location.replace("/");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="size-5" />
          </div>
          <CardTitle>ETF Portfolio Operator</CardTitle>
          <CardDescription>포트폴리오를 보려면 비밀번호를 입력하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={login}>
            <label className="grid gap-2 text-sm" htmlFor="password">
              비밀번호
              <input
                id="password"
                name="password"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                required
                autoFocus
                className="h-10 rounded-md border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isPending}>
              {isPending ? "확인 중" : "로그인"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
