import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  NARRATIVE_PROMPT_VERSION,
  narrativeSystemPrompt,
  narrativeUserPrompt,
  plainNarrative,
  validateNarrative,
  type Narrative,
  type NarrativeProblem,
  type ReportSnapshot,
} from "@leakbook/core";

// The report's written sections (BUILD_PLAN 6.2). Claude writes them from the frozen job
// facts; the validator checks every source, number, component, and must-mention finding;
// one retry lists the problems; anything still wrong is shown to the tech to fix.

const NarrativeSchema = z.object({
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      paragraphs: z.array(z.object({ text: z.string(), source_ids: z.array(z.string()) })),
    }),
  ),
});

export interface NarrativeResult {
  narrative: Narrative;
  problems: NarrativeProblem[];
  model: string;
  promptVersion: string;
}

/** The model call, injectable for tests. Returns the parsed narrative or null. */
export type NarrativeModel = (system: string, user: string) => Promise<unknown>;

export const PLAIN_MODEL = "leakbook-plain";

export function claudeModel(
  client: Anthropic = new Anthropic(),
  model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
): NarrativeModel & { id: string } {
  const call = async (system: string, user: string) => {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // Server-side fallback: if this model declines, the API retries on another.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(NarrativeSchema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal")
      throw new Error("The model declined to write this report.");
    return response.parsed_output;
  };
  return Object.assign(call, { id: model });
}

/**
 * Writes the narrative. Without an AI provider (no ANTHROPIC_API_KEY) it returns the plain
 * draft built from the data, labeled as such, so reports still work.
 */
export async function writeNarrative(
  snapshot: ReportSnapshot,
  template: "homeowner" | "partner",
  tone: string,
  model: (NarrativeModel & { id: string }) | null = process.env.ANTHROPIC_API_KEY
    ? claudeModel()
    : null,
): Promise<NarrativeResult> {
  if (!model) {
    const narrative = plainNarrative(snapshot, template);
    return {
      narrative,
      problems: validateNarrative(narrative, snapshot),
      model: PLAIN_MODEL,
      promptVersion: NARRATIVE_PROMPT_VERSION,
    };
  }

  const system = narrativeSystemPrompt();
  let draft = await model(system, narrativeUserPrompt(snapshot, template, tone));
  let problems = validateNarrative(draft, snapshot);
  if (problems.length > 0) {
    draft = await model(
      system,
      narrativeUserPrompt(
        snapshot,
        template,
        tone,
        problems.map((p) => p.message),
      ),
    );
    problems = validateNarrative(draft, snapshot);
  }
  if (problems.some((p) => p.kind === "bad_shape")) {
    // Unusable output: start the tech from the plain draft instead.
    const narrative = plainNarrative(snapshot, template);
    return {
      narrative,
      problems: validateNarrative(narrative, snapshot),
      model: PLAIN_MODEL,
      promptVersion: NARRATIVE_PROMPT_VERSION,
    };
  }
  return {
    narrative: draft as Narrative,
    problems,
    model: model.id,
    promptVersion: NARRATIVE_PROMPT_VERSION,
  };
}
