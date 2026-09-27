import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import type { HouseholdEvent, Severity } from "@nexus/shared";
import { events, expectedVisitors, members, rules } from "./store.js";

// Open-ended reasoning for events that don't match one of NEXUS's seeded
// household rules (see context-engine.ts). The seeded rules stay the
// primary, always-available path so a demo never depends on a live model
// call succeeding; Bedrock runs for the "no rule matched" case, which is
// exactly where a fixed if/else chain runs out and judgment earns its keep.
//
// Uses Claude on Amazon Bedrock via Anthropic's Bedrock client, with a
// structured-output schema so the reply is always a parseable assessment.
// Credentials come from the standard AWS chain (env vars, profile, SSO,
// or AWS_BEARER_TOKEN_BEDROCK). If they're missing or the call fails for
// any reason, `reasonWithBedrock` returns null and the caller falls back to
// the static default: a real integration that fails safe, not a mock.

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-opus-5";

let client: AnthropicBedrockMantle | null = null;
function getClient(): AnthropicBedrockMantle {
  // Created lazily so a missing AWS_REGION doesn't crash the server at boot.
  client ??= new AnthropicBedrockMantle({
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    timeout: 20_000,
    maxRetries: 1,
  });
  return client;
}

const AssessmentSchema = z.object({
  importance: z.enum(["info", "notice", "warning", "critical"]),
  reasoning: z.string().describe("One plain-language sentence a family member would understand."),
  shouldAlert: z.boolean(),
  suggestedActions: z.array(z.enum(["view", "dismiss", "check_in", "notify_guardian"])),
});

export interface BedrockAssessment {
  importance: Severity;
  reasoning: string;
  shouldAlert: boolean;
  suggestedActions: string[];
}

const SYSTEM_PROMPT = `You are NEXUS, a household context engine connected to Ring, Alexa+, and a Fire TV.
Given one household event plus the household's context, decide whether it deserves a human's
attention right now. Interrupting people is costly: most routine events should NOT alert. Alert
when there is a plausible safety, security, or care risk, and pick the smallest set of actions
that lets the household resolve it. Write the reasoning as one short sentence spoken to the family.`;

function householdContext(event: HouseholdEvent): string {
  const when = new Date(event.timestamp);
  return [
    `Local time at the household: ${when.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}`,
    `Household members: ${members.map((m) => `${m.name} (${m.role}${m.needsCheckIn ? ", needs check-ins" : ""})`).join("; ")}`,
    `Household rules:\n${rules.map((r) => `- ${r.description}`).join("\n")}`,
    `Expected visitors: ${
      expectedVisitors.length
        ? expectedVisitors.map((v) => `${v.label} ${v.windowStart} to ${v.windowEnd}`).join("; ")
        : "none"
    }`,
    `Recent events (newest first): ${
      events
        .filter((e) => e.id !== event.id)
        .slice(0, 5)
        .map((e) => `${e.type} at ${e.timestamp}`)
        .join("; ") || "none"
    }`,
    `Event to assess: ${JSON.stringify({ type: event.type, source: event.source, timestamp: event.timestamp, data: event.data })}`,
  ].join("\n\n");
}

export async function reasonWithBedrock(event: HouseholdEvent): Promise<BedrockAssessment | null> {
  try {
    const response = await getClient().messages.parse({
      model: MODEL_ID,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(AssessmentSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: householdContext(event) }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    return response.parsed_output;
  } catch (err) {
    console.warn("[bedrock-reasoner] falling back to default assessment:", (err as Error).message);
    return null;
  }
}
