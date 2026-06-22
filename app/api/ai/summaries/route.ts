import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/session";
import {
  buildSummaryPrompt,
  extractOpenAIText,
  parseSummaryJson,
} from "@/lib/ai-summary";
import type { EtfScore, StrategyType } from "@/types/etf";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";
const strategies: StrategyType[] = ["aggressive", "balanced", "defensive"];

type RequestBody = {
  strategy?: StrategyType;
  scores?: EtfScore[];
};

function formatOpenAIError(status: number, text: string) {
  if (text.includes("insufficient_quota")) {
    return {
      status: 429,
      message:
        "OpenAI API quota is insufficient. Check API billing/limits for OPENAI_API_KEY.",
    };
  }

  if (status === 401) {
    return {
      status,
      message: "OpenAI API key is invalid or unauthorized.",
    };
  }

  if (status === 429) {
    return {
      status,
      message: "OpenAI API rate limit was exceeded. Try again later.",
    };
  }

  return {
    status,
    message: `OpenAI request failed with status ${status}.`,
  };
}

function getOpenAIKey() {
  return process.env.OPENAI_API_KEY;
}

export async function POST(request: Request) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const apiKey = getOpenAIKey();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured. Set it in .env.local and restart the dev server.",
      },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as RequestBody;
    const scores = body.scores ?? [];
    const strategy = strategies.includes(body.strategy as StrategyType)
      ? (body.strategy as StrategyType)
      : "balanced";

    if (scores.length === 0) {
      return NextResponse.json(
        { error: "scores must include at least one ETF score." },
        { status: 400 }
      );
    }

    const model = process.env.OPENAI_SUMMARY_MODEL ?? DEFAULT_MODEL;
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content:
              "You produce concise Korean ETF score summaries. You are not a financial advisor and must avoid trade instructions.",
          },
          {
            role: "user",
            content: buildSummaryPrompt({ strategy, scores }),
          },
        ],
        text: {
          verbosity: "low",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const formatted = formatOpenAIError(response.status, errorText);

      return NextResponse.json(
        { error: formatted.message },
        { status: formatted.status }
      );
    }

    const text = extractOpenAIText(await response.json());
    const summaries = parseSummaryJson(text);

    return NextResponse.json({
      summaries,
      model,
      warnings:
        Object.keys(summaries).length < scores.length
          ? ["AI response did not include every ETF symbol."]
          : [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI summary generation failed.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
