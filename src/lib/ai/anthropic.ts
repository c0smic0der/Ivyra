import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Lazily-constructed singleton — reads ANTHROPIC_API_KEY from env. */
export function getAnthropicClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export const HAIKU_MODEL = "claude-haiku-4-5";

// $1.00 / $5.00 per million input/output tokens (docs/02-application-rundown.md §13).
export const HAIKU_INPUT_COST_PER_TOKEN = 1 / 1_000_000;
export const HAIKU_OUTPUT_COST_PER_TOKEN = 5 / 1_000_000;
