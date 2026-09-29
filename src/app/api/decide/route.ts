import { triage } from "@/decisions/triage";

// PLACEHOLDER endpoint — swap triage for the app's real decision(s).
export async function POST(request: Request) {
  const { message } = (await request.json()) as { message?: string };
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }
  return Response.json(await triage(message));
}
