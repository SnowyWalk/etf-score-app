import { describe, expect, it } from "vitest";

import { extractOpenAIText, parseSummaryJson } from "./ai-summary";

describe("AI summary helpers", () => {
  it("extracts output_text when present", () => {
    expect(
      extractOpenAIText({
        output_text: '{"summaries":{"SPY":"요약"}}',
      })
    ).toBe('{"summaries":{"SPY":"요약"}}');
  });

  it("extracts text from message content fallback", () => {
    expect(
      extractOpenAIText({
        output: [
          {
            content: [{ text: '{"summaries":' }, { text: '{"QQQ":"요약"}}' }],
          },
        ],
      })
    ).toBe('{"summaries":{"QQQ":"요약"}}');
  });

  it("parses and normalizes summary symbols", () => {
    expect(
      parseSummaryJson('{"summaries":{"spy":" 점수 기반 요약 "}}')
    ).toEqual({
      SPY: "점수 기반 요약",
    });
  });
});
