import { router } from "expo-router";
import { formatSchedule } from "@leakbook/core";
import { useOutOfRange } from "../../data/chemicals";
import { useTeam } from "../../data/schedule";
import { useCompany } from "../../state/session";
import { Empty, Group, ListRow, Section, T } from "../../ui/components";
import { color, tabular } from "../../ui/theme";

/**
 * Chemicals › Out of Range (owner, 2026-11-16): the last 30 days' readings well outside the
 * pool's range, newest first, with the pool, the value, the range, the date and the tech. A row
 * opens the pool's Chemical screen. The website's `OutOfRange` on /chemicals.
 */
export function OutOfRangeList() {
  const company = useCompany();
  const rows = useOutOfRange(company.id);
  const team = useTeam(company.id);
  if (rows.length === 0) return <Empty>No readings out of range in the last 30 days.</Empty>;
  return (
    <Section title="Last 30 days" footer="Readings well outside the pool’s range, newest first.">
      <Group>
        {rows.map((r) => (
          <ListRow
            key={r.id}
            onPress={() =>
              router.push({ pathname: "/chemicals", params: { property: r.propertyId } })
            }
            accessibilityLabel={`${r.pool}, ${r.label} ${r.valueText}, ${r.direction}, aim for ${r.range}`}
          >
            <T>{r.pool}</T>
            <T style={[tabular, { color: color.fail }]}>
              {`${r.label} ${r.valueText} · ${r.direction === "low" ? "Low" : "High"}`}
            </T>
            <T variant="secondary" muted>
              {[
                `Aim for ${r.range}`,
                formatSchedule(r.recordedAt, new Date(), company.timezone),
                r.recordedBy ? team.find((t) => t.user_id === r.recordedBy)?.name : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </T>
          </ListRow>
        ))}
      </Group>
    </Section>
  );
}
