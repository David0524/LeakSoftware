import { useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import {
  FEEDBACK_EMPTY,
  FEEDBACK_FILTERS,
  FEEDBACK_OFFLINE,
  FEEDBACK_TITLE,
  feedbackFilter,
  feedbackOpenLabel,
  type FeedbackFilter,
  type FeedbackRow,
} from "@leakbook/core";
import { useFeedback } from "../../../../data/feedback";
import { FeedbackRows, FeedbackSheet } from "../../../../features/feedback/FeedbackRows";
import { ManagersOnly } from "../../../../features/settings/SettingsList";
import { useCompany } from "../../../../state/session";
import { Button, Empty, Screen, Segmented } from "../../../../ui/components";
import { SkeletonRows } from "../../../../ui/Skeleton";
import { space } from "../../../../ui/theme";

/**
 * More › Customer Feedback (owner's competitor notes, 2026-11-16), as the website's Feedback page:
 * the thumbs customers give from their report page or the review request. A thumbs down is a
 * private complaint, open until it's closed with a note; Open, Closed and Thumbs Up are the
 * segments. Owners and admins. Read from the server like the Dashboard.
 */
export default function FeedbackScreen() {
  return (
    <ManagersOnly title={FEEDBACK_TITLE}>
      <FeedbackPage />
    </ManagersOnly>
  );
}

function FeedbackPage() {
  const company = useCompany();
  const { load, reload } = useFeedback(company.id);
  const [show, setShow] = useState<FeedbackFilter>("open");
  const [open, setOpen] = useState<FeedbackRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const list = load.at === "ready" ? load.list : null;
  const rows = list ? feedbackFilter(list.rows, show) : [];

  return (
    <Screen
      title={FEEDBACK_TITLE}
      subtitle={list ? feedbackOpenLabel(list.open_count) : company.name}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void reload().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Segmented label="Show" options={FEEDBACK_FILTERS} value={show} onChange={setShow} />
      {load.at === "loading" ? (
        <SkeletonRows count={4} dot label="Loading customer feedback" />
      ) : load.at === "error" ? (
        <View style={styles.gap}>
          <Empty>{FEEDBACK_OFFLINE}</Empty>
          <Button title="Try Again" kind="secondary" onPress={() => void reload()} />
        </View>
      ) : rows.length === 0 ? (
        <Empty>{FEEDBACK_EMPTY[show]}</Empty>
      ) : (
        <FeedbackRows rows={rows} timeZone={company.timezone} onOpen={setOpen} />
      )}
      <FeedbackSheet
        row={open}
        timeZone={company.timezone}
        onClose={() => setOpen(null)}
        onChanged={() => void reload()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ gap: { gap: space["3"] } });
