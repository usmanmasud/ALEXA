import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { HouseholdEvent, Severity } from "@nexus/shared";
import { rules } from "./store.js";

// Fallback reasoning for events that don't match one of NEXUS's seeded
// household rules (see context-engine.ts). The seeded rules stay the
// primary, always-available path so a demo never depends on a live model
// call succeeding; Bedrock only runs for the "no rule matched" case, which
// is exactly where a fixed if/else chain runs out and open-ended reasoning
// earns its keep.
//
// Requires AWS_REGION + Bedrock model access. If credentials are missing or
// the call fails for any reason, `reasonWithBedrock` returns null and the
// caller falls back to the static default — this is a genuine AWS
// integration, not a mock, but it fails safe.

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20241022-v2:0";

const AssessmentSchema = z.object({
  importance: z.enum(["info", "notice", "warning", "critical"]),
  reasoning: z.string(),
  shouldAlert: z.boolean(),
  suggestedActions: z.array(z.enum(["view", "dismiss", "check_in", "notify_guardian"])),
});

export interface BedrockAssessment {
  importance: Severity;
  reasoning: string;
  shouldAlert: boolean;
  suggestedActions: string[];
}

const SYSTEM_PROMPT = `You are NEXUS, a household context engine. Given a household event and the
household's configured rules, decide whether the event deserves a human's attention right now.
Be conservative: most routine events should NOT trigger an alert. Respond with ONLY a JSON object
matching this shape, no prose, no markdown fences:
{"importance": "info"|"notice"|"warning"|"critical", "reasoning": "<one sentence, plain language>",
 "shouldAlert": boolean, "suggestedActions": ["view"|"dismiss"|"check_in"|"notify_guardian", ...]}`;

export async function reasonWithBedrock(event: HouseholdEvent): Promise<BedrockAssessment | null> {
  try {
    const prompt = [
      `Household rules:\n${rules.map((r) => `- ${r.description}`).join("\n")}`,
      `Event: ${JSON.stringify({ type: event.type, source: event.source, timestamp: event.timestamp, data: event.data })}`,
    ].join("\n\n");

    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 300, temperature: 0.1 },
      }),
    );

    const text = response.output?.message?.content?.find((b) => "text" in b)?.text;
    if (!text) return null;

    const parsed = AssessmentSchema.parse(JSON.parse(text));
    return parsed;
  } catch (err) {
    console.warn("[bedrock-reasoner] falling back to default assessment:", (err as Error).message);
    return null;
  }
}
