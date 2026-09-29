import { TypeSafeClient } from "@typesafe-ai/sdk";

// Server-only. The API key must never reach the browser.
let client: TypeSafeClient | undefined;

export function jev(): TypeSafeClient {
  client ??= new TypeSafeClient();
  return client;
}

export const JEV_MODEL = process.env.JEV_MODEL ?? "jev-latest";
