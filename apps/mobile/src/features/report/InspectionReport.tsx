import { StyleSheet, Text, View } from "react-native";
import {
  NOT_PRESENT_LABEL,
  inspectionReport,
  type ChecklistItemResult,
  type ComponentType,
  type JobComponent,
} from "@leakbook/core";
import { Card, T } from "../../ui/components";
import { color, face, MAX_TEXT_SCALE, shape, space, type } from "../../ui/theme";

type Report = ReturnType<typeof inspectionReport>;
type Tone = Report["needsAttention"][number]["tone"];

/**
 * A pool inspection's answers, built on this phone for Review and Sign (2026-10-20), as the
 * website's report: Needs attention first, then each section as question and answer rows with
 * notes under the answer, then the form's recommendations.
 */
export function InspectionReview({
  components,
  resultByComponent,
  typeById,
}: {
  components: JobComponent[];
  resultByComponent: Map<string, ChecklistItemResult>;
  typeById: Map<string, ComponentType>;
}) {
  const snapshot = components.flatMap((c) => {
    const t = typeById.get(c.component_type_id);
    const r = resultByComponent.get(c.id);
    return t
      ? [
          {
            id: c.id,
            result_id: r?.id ?? null,
            label: c.label,
            type_key: t.key,
            type_name: t.name,
            status: r?.status ?? "pending",
            method: r?.method ?? null,
            exclusion_reason: r?.exclusion_reason ?? null,
            notes: r?.notes ?? null,
            section: t.section,
            answer: t.answer,
            outcome: r?.outcome ?? null,
            location_text: r?.location_text ?? null,
            group_label: t.group_label ?? null,
            options: t.options,
            notice: t.notice ?? null,
            value: r?.value,
          },
        ]
      : [];
  });
  const report = inspectionReport({ components: snapshot });

  return (
    <>
      <Card>
        <T variant="cardTitle">Needs attention</T>
        {report.needsAttention.length ? (
          report.needsAttention.map((r) => (
            <AnswerRow
              key={r.id}
              group={r.group}
              question={r.question}
              notes={r.notes}
              answer={r.answer}
              tone={r.tone}
            />
          ))
        ) : (
          <T>Nothing we inspected needs attention.</T>
        )}
      </Card>
      {report.sections.length ? (
        <Card>
          <T variant="cardTitle">What we inspected</T>
          {report.sections.map((sec) => (
            <View key={sec.section} style={styles.section}>
              <T variant="bodyEmphasis">{sec.title}</T>
              {sec.groups.map((g, i) => (
                <View key={`${g.label ?? ""}-${i}`}>
                  {g.label ? (
                    <T variant="sectionLabel" style={styles.groupLabel}>
                      {g.notPresent ? `${g.label} · ${NOT_PRESENT_LABEL}` : g.label}
                    </T>
                  ) : null}
                  {g.rows.map((r) => (
                    <AnswerRow
                      key={r.id}
                      question={r.question}
                      notes={r.notes}
                      answer={r.answer}
                      tone={r.tone}
                    />
                  ))}
                </View>
              ))}
            </View>
          ))}
        </Card>
      ) : null}
      {report.recommendations.length ? (
        <Card>
          <T variant="cardTitle">Recommendations</T>
          {report.recommendations.map((r) => (
            <T key={r}>{`• ${r}`}</T>
          ))}
        </Card>
      ) : null}
    </>
  );
}

function toneColor(tone: Tone): string {
  return tone === "pass"
    ? color.pass
    : tone === "attention"
      ? color.warning
      : tone === "leaking"
        ? color.fail
        : tone === "not_applicable"
          ? color.excluded
          : color.fill;
}

/** A question and its answer as a status pill, with notes under the question. */
function AnswerRow({
  group,
  question,
  notes,
  answer,
  tone,
}: {
  group?: string | null;
  question: string;
  notes: string | null;
  answer: string;
  tone: Tone;
}) {
  return (
    <View style={[styles.row, { borderBottomColor: color.separator }]}>
      <View style={{ flex: 1, gap: 2 }}>
        {group ? (
          <T variant="secondary" muted>
            {group}
          </T>
        ) : null}
        <T>{question}</T>
        {notes ? (
          <T variant="secondary" muted>
            {notes}
          </T>
        ) : null}
      </View>
      <View style={[styles.pill, { backgroundColor: toneColor(tone) }]}>
        <Text
          style={[styles.pillText, { color: tone === "pending" ? color.text : color.onStatus }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {answer}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space["1"], marginTop: space["2"] },
  groupLabel: { marginTop: space["3"] },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["3"],
    paddingVertical: space["2"],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    borderRadius: shape.pill,
    paddingHorizontal: space["3"],
    paddingVertical: space["1"],
    maxWidth: "50%",
  },
  pillText: { ...type.secondary, ...face.semiBold },
});
