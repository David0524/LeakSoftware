import { useEffect, useRef } from "react";
import { AccessibilityInfo, Linking, Share } from "react-native";
import { localMinutes, onMyWayText, type OnMyWayVia, friendlyError } from "@leakbook/core";
import { sendCompanyText } from "../../data/texting";
import { chooseAction } from "../../ui/confirm";
import { startLiveStop, takeStopAction } from "../../lib/liveStop";
import { getServices } from "../../lib/services";
import { onMyWayValues } from "../../lib/todayHero";
import { smsUrl } from "../../lib/heroMessage";
import { useCompany } from "../../state/session";
import { haptics } from "../../ui/haptics";

/** The On My Way text for a stop: the customer, the tech, the shop and the arrival (now plus the
 *  drive, at least 5 minutes). */
export function onMyWayMessage(input: {
  customer: string | null;
  tech: string;
  shop: string;
  driveMin: number;
  windowMin: number;
  timeZone: string;
}): string {
  const arriveMin =
    localMinutes(new Date().toISOString(), input.timeZone) + Math.max(5, input.driveMin);
  return onMyWayText({
    customer: input.customer,
    tech: input.tech,
    shop: input.shop,
    arriveMin,
    windowMin: input.windowMin,
  });
}

/**
 * On My Way kept on the job once the text is on its way (row and outbox together), which also
 * puts the stop on the way on Today's card and the current-stop notification (2026-10-19).
 */
export function recordOnMyWay(jobId: string, companyId: string, driveMin: number) {
  getServices().sync.write("job", jobId, companyId, onMyWayValues(new Date(), driveMin));
  startLiveStop();
}

/**
 * The current-stop notification's On My Way (spec 5.1, the website's components/on-my-way.tsx):
 * a text to the customer with an arrival time. On Today the car is gone (owner, 2026-10-20: On My
 * Way lives in Message, docs/design/2026-10-20-gestures.md section 2), so this draws nothing: it
 * sends when the notification asks for this stop. By default it goes from the company number,
 * into the shared Messages; without a working number it asks before using the phone's own
 * Messages. Shops can choose the phone instead: Messages when the customer has a number, else
 * the share sheet. What happened is read aloud.
 */
export function OnMyWayTrigger({
  phone,
  customer,
  customerId,
  tech,
  shop,
  driveMin,
  windowMin,
  timeZone,
  via,
  lineActive,
  isManager,
  jobId,
  trigger,
}: {
  phone: string | null;
  customer: string | null;
  customerId: string | null;
  tech: string;
  shop: string;
  driveMin: number;
  windowMin: number;
  timeZone: string;
  via: OnMyWayVia;
  lineActive: boolean;
  isManager: boolean;
  jobId: string;
  /** Changes when the current-stop notification's On My Way asks for this stop. */
  trigger?: number;
}) {
  const company = useCompany();
  const sending = useRef(false);

  function say(spoken: string) {
    if (spoken) AccessibilityInfo.announceForAccessibility(spoken);
  }

  async function fromPhone(text: string, record: () => void) {
    if (phone) {
      try {
        await Linking.openURL(smsUrl(phone, text));
        record();
        say(`Opened Messages with the text: ${text}`);
        return;
      } catch {
        // No Messages app: share instead.
      }
    }
    try {
      const r = await Share.share({ message: text });
      if (r.action === Share.dismissedAction) return;
      record();
      say("Shared the text.");
    } catch {
      say("The text couldn’t be shared.");
    }
  }

  async function send() {
    if (sending.current) return;
    haptics.light();
    const text = onMyWayMessage({ customer, tech, shop, driveMin, windowMin, timeZone });
    const record = () => recordOnMyWay(jobId, company.id, driveMin);
    if (phone && via === "messages" && !lineActive) {
      chooseAction({
        title: "On My Way goes out from your company number, which isn’t working yet.",
        message: isManager
          ? "Set it up in Settings › Phone and Texting. You can send this one from your phone."
          : "Ask an owner to set it up. You can send this one from your phone.",
        actions: [{ label: "Send From My Phone", onPress: () => void fromPhone(text, record) }],
      });
      return;
    }
    if (phone && via === "messages" && lineActive && customerId) {
      sending.current = true;
      try {
        await sendCompanyText({ customerId, body: text, jobId });
        record();
        say(`Texted from the company number: ${text}`);
      } catch (e) {
        say(friendlyError(e, "Not sent."));
      } finally {
        sending.current = false;
      }
      return;
    }
    await fromPhone(text, record);
  }

  // The notification's On My Way opens Today on this stop and sends it here (owner, 2026-10-20).
  const latest = useRef(send);
  useEffect(() => {
    latest.current = send;
  });
  useEffect(() => {
    if (trigger && takeStopAction(trigger)) void latest.current();
  }, [trigger]);

  return null;
}
