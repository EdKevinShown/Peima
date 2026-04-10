import { Injectable } from "@nestjs/common";
import { SummaryAiConfigService } from "./summary-ai.config.service";

export type SummaryAiChatFailureKind =
  | "disabled"
  | "missing_api_key"
  | "timeout"
  | "network"
  | "http"
  | "empty_content"
  | "invalid_json_response";

export type SummaryAiChatResult =
  | { ok: true; content: string }
  | {
      ok: false;
      kind: SummaryAiChatFailureKind;
      status?: number;
      detail?: string;
    };

@Injectable()
export class SummaryAiChatCompletionsClient {
  constructor(private readonly aiConfig: SummaryAiConfigService) {}

  async complete(system: string, user: string): Promise<SummaryAiChatResult> {
    if (!this.aiConfig.summaryAiEnabled) {
      return { ok: false, kind: "disabled" };
    }
    if (!this.aiConfig.apiKey) {
      return { ok: false, kind: "missing_api_key" };
    }

    const url = `${this.aiConfig.baseUrl}/v1/chat/completions`;
    const body = {
      model: this.aiConfig.model,
      messages: [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ],
      temperature: 0.35,
      max_tokens: 900,
    };

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.aiConfig.timeoutMs,
    );

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.aiConfig.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail: string | undefined;
        try {
          detail = await res.text();
          if (detail && detail.length > 500) {
            detail = `${detail.slice(0, 500)}…`;
          }
        } catch {
          detail = undefined;
        }
        return {
          ok: false,
          kind: "http",
          status: res.status,
          detail,
        };
      }

      let json: {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      try {
        json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
      } catch (e) {
        return {
          ok: false,
          kind: "invalid_json_response",
          detail: e instanceof Error ? e.message : String(e),
        };
      }
      const content = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) {
        return { ok: false, kind: "empty_content" };
      }
      return { ok: true, content };
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") {
        return { ok: false, kind: "timeout" };
      }
      return {
        ok: false,
        kind: "network",
        detail: e instanceof Error ? e.message : String(e),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
