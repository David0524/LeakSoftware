import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { FINDING_STATUS_LABELS, type Job } from "@leakbook/core";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import { useSession } from "../../state/session";
import { Button, Group, ListRow, T } from "../../ui/components";
import { color, face, space } from "../../ui/theme";
import { confirmDeleteFinding } from "./remove";

/** The finding's number circle. */
const NUM = 28;

/**
 * Findings, as on the website (spec 5.4): a row per finding with its severity circle; tap to
 * edit, swipe left to delete; then Add Finding. The pool diagram with the numbered pins is its
 * own section above (DiagramPanel).
 */
export function FindingsTab({ job }: { job: Job }) {
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const ordered = [...insp.findings].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <View style={{ gap: space["4"] }}>
      {ordered.length === 0 ? (
        <T muted>No findings recorded.</T>
      ) : (
        <View style={{ gap: space["5"] }}>
          {/* Hairlines start after the number, where the text does (60). */}
          <Group separatorInset={space["4"] + NUM + space["4"]}>
            {ordered.map((f, i) => {
              const sev = config.severityByKey.get(f.severity_key);
              const comp = f.job_component_id
                ? insp.componentById.get(f.job_component_id)
                : undefined;
              return (
                <ListRow
                  key={f.id}
                  accessibilityLabel={`Edit ${f.title}`}
                  onPress={() => router.push(`/jobs/${job.id}/finding/${f.id}`)}
                  onDelete={() =>
                    confirmDeleteFinding(services.sync, job.company_id, f.id, f.title)
                  }
                  leading={
                    <View style={[styles.num, { backgroundColor: sev?.color ?? color.fail }]}>
                      <Text
                        style={[styles.numText, { color: color.paper }]}
                        maxFontSizeMultiplier={1.4}
                      >
                        {i + 1}
                      </Text>
                    </View>
                  }
                >
                  <T variant="bodyEmphasis">{f.title}</T>
                  <T variant="secondary" muted>
                    {[
                      sev?.name ?? f.severity_key,
                      comp?.label,
                      FINDING_STATUS_LABELS[f.status],
                      f.pin_x != null ? "Pinned on the diagram" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </T>
                  {f.location_text ? <T style={{ marginTop: 4 }}>{f.location_text}</T> : null}
                  {f.notes ? (
                    <T variant="secondary" style={{ marginTop: 4 }}>
                      {f.notes}
                    </T>
                  ) : null}
                </ListRow>
              );
            })}
          </Group>
        </View>
      )}
      <Button
        title="Add Finding"
        kind="secondary"
        onPress={() => router.push(`/jobs/${job.id}/finding/new`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  num: {
    width: NUM,
    height: NUM,
    borderRadius: NUM / 2,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  numText: { ...face.bold, fontSize: 15, lineHeight: 20 },
});
