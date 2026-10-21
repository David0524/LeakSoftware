import { router } from "expo-router";
import { useCallback } from "react";
import { Linking } from "react-native";
import { toE164, type OnMyWayVia } from "@leakbook/core";
import type { JobView } from "../../data/jobs";
import { useConversations, useLine } from "../../data/texting";
import { messageKind, messageRoute, smsUrl, stopMoment } from "../../lib/heroMessage";
import { onMyWayMessage, recordOnMyWay } from "./OnMyWay";

/**
 * Message for a stop on Today, on the card and in its row (owner, 2026-10-20: On My Way lives in
 * Message; docs/design/2026-10-20-gestures.md section 2). On the tech's own stop before they
 * arrive, and until On My Way has gone out today, it opens the On My Way text filled in: the
 * in-app compose sheet with the shop's number (sending it records On My Way), else the phone's
 * own Messages, recorded when opened, as the car's fallback did. Otherwise a blank text, as
 * before: the shop's conversation when its number works, else the phone's Messages.
 */
export function useStopMessage(input: {
  companyId: string;
  /** The tech's own day (not an owner looking at a teammate's). */
  mine: boolean;
  today: string;
  timeZone: string;
  tech: string;
  shop: string;
  windowMin: number;
  via: OnMyWayVia;
}): (job: JobView, driveMin: number) => void {
  const { companyId, mine, today, timeZone, tech, shop, windowMin, via } = input;
  const line = useLine(companyId);
  const conversations = useConversations(companyId);
  const lineActive = line?.status === "active";
  return useCallback(
    (job: JobView, driveMin: number) => {
      const phone = job.customer?.phone;
      if (!phone) return;
      const kind = messageKind({
        mine,
        moment: stopMoment(job, today),
        onMyWayAt: job.on_my_way_at,
        today,
        timeZone,
      });
      const draft =
        kind === "on_my_way"
          ? {
              jobId: job.id,
              driveMin,
              body: onMyWayMessage({
                customer: job.customer?.name ?? null,
                tech,
                shop,
                driveMin,
                windowMin,
                timeZone,
              }),
            }
          : null;
      // The shop's number: the in-app compose sheet (On My Way goes from the phone when the shop
      // chose that in Settings).
      if (lineActive && job.customer?.id && !(draft && via === "phone")) {
        const e164 = toE164(phone);
        const conversation = e164 ? conversations.find((x) => x.phone === e164) : undefined;
        router.push(
          messageRoute({
            conversationId: conversation?.id,
            customerId: job.customer.id,
            jobId: job.id,
            draft,
          }),
        );
        return;
      }
      void Linking.openURL(smsUrl(phone, draft?.body)).then(
        () => {
          if (draft) recordOnMyWay(job.id, companyId, driveMin);
        },
        () => undefined,
      );
    },
    [companyId, mine, today, timeZone, tech, shop, windowMin, via, lineActive, conversations],
  );
}
