import { View } from "react-native";
import { testOutcomeLabel, type Outcome, type VerdictTone } from "@leakbook/core";
import { Card, Pill, T } from "../../ui/components";
import { color, space } from "../../ui/theme";

/** One row of "Tests we ran": the test, where, its reading summary, and the outcome. */
export interface ReportTestRow {
  id: string;
  name: string;
  where: string | null;
  result: string | null;
  outcome: Outcome | null | undefined;
}

function toneColor(tone: VerdictTone): string {
  if (tone === "pass") return color.pass;
  if (tone === "leaking") return color.fail;
  if (tone === "attention") return color.warning;
  return color.excluded;
}

/**
 * "Tests we ran" on the homeowner report (owner, 2026-10-19: "We want to show off all the work
 * we did"): every test, pass or fail, after What we checked, as the website's report
 * (apps/web/src/components/report-view.tsx `tests`). The draft's tests text leads when it has
 * one. Hidden when there are neither tests nor text.
 */
export function ReportTests({
  title,
  text,
  tests,
}: {
  title?: string | null;
  text?: string | null;
  tests: ReportTestRow[];
}) {
  if (!tests.length && !text?.trim()) return null;
  return (
    <Card style={{ gap: space["3"] }}>
      <T variant="cardTitle">{title || "Tests we ran"}</T>
      {text?.trim() ? <T>{text.trim()}</T> : null}
      {tests.map((t, i) => {
        const outcome = testOutcomeLabel(t.outcome);
        return (
          <View
            key={t.id}
            style={[
              { flexDirection: "row", alignItems: "flex-start", gap: space["3"] },
              i > 0 && {
                borderTopWidth: 0.5,
                borderTopColor: color.separator,
                paddingTop: space["3"],
              },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="bodyEmphasis">{t.name}</T>
              {t.where ? (
                <T variant="secondary" muted>
                  {t.where}
                </T>
              ) : null}
              {t.result ? <T variant="secondary">{t.result}</T> : null}
            </View>
            <Pill label={outcome.label} color={toneColor(outcome.tone)} />
          </View>
        );
      })}
    </Card>
  );
}
