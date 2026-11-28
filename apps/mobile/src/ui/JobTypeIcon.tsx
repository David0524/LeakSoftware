import { View } from "react-native";
import { JOB_TYPE_LABELS, type JobType } from "@leakbook/core";
import { Icon, type IconName } from "./Icon";
import { color } from "./theme";

/**
 * Each kind of job's symbol (owner, 2026-11-28: "add an icon for each job like Maintenance (make
 * this a water drop since it's the most common, regular job)"). The same on every platform: a
 * drop, a magnifying glass, a wrench and screwdriver, a clipboard.
 */
export const JOB_TYPE_ICON: Record<JobType, IconName> = {
  maintenance: "jobMaintenance",
  detection: "jobDetection",
  repair: "jobRepair",
  inspection: "jobInspection",
};

/**
 * A job's type as a symbol. `badge`: in a 32 pt tinted circle, leading a Jobs row; otherwise the
 * bare glyph, muted, before a Schedule tile's name. It reads as the type's name.
 */
export function JobTypeIcon({ type, badge = false }: { type: JobType; badge?: boolean }) {
  const name = JOB_TYPE_ICON[type] ?? "jobDetection";
  const label = JOB_TYPE_LABELS[type] ?? "Job";
  if (!badge)
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label}>
        <Icon name={name} size={16} color={color.textMuted} />
      </View>
    );
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: color.iconTint,
      }}
    >
      <Icon name={name} size={17} color={color.link} weight="semibold" />
    </View>
  );
}
