import { useEffect, useState } from "react";
import { AccessibilityInfo, Linking, Share } from "react-native";
import { localMinutes, onMyWayText, type OnMyWayVia } from "@leakbook/core";
import { sendCompanyText } from "../../data/texting";
import { Button } from "../../ui/components";
import { chooseAction } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";

/**
 * On My Way (spec 5.1, the website's components/on-my-way.tsx): a text to the customer with an
 * arrival time (now plus the drive). By default it goes from the company number, into the
 * shared Messages; without a working number it asks before using the phone's own Messages.
 * Shops can choose the phone instead: Messages when the customer has a number, else the share
 * sheet. The label says what happened for 3 seconds (no toast).
 */
export function OnMyWay({
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
}) {
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done || done === "Sending…") return;
    const t = setTimeout(() => setDone(null), 3000);
    return () => clearTimeout(t);
  }, [done]);

  function say(label: string, spoken: string) {
    setDone(label);
    if (spoken) AccessibilityInfo.announceForAccessibility(spoken);
  }

  async function fromPhone(text: string) {
    if (phone) {
      // "?&body=" works in both iPhone and Android Messages.
      const url = `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
      try {
        await Linking.openURL(url);
        say("Texted ✓", `Opened Messages with the text: ${text}`);
        return;
      } catch {
        // No Messages app: share instead.
      }
    }
    try {
      const r = await Share.share({ message: text });
      if (r.action === Share.dismissedAction) return;
      say("Shared ✓", "Shared the text.");
    } catch {
      say("Not Sent", "The text couldn’t be shared.");
    }
  }

  async function send() {
    haptics.light();
    const arriveMin = localMinutes(new Date().toISOString(), timeZone) + Math.max(5, driveMin);
    const text = onMyWayText({ customer, tech, shop, arriveMin, windowMin });
    if (phone && via === "messages" && !lineActive) {
      chooseAction({
        title: "On My Way goes out from your company number, which isn’t working yet.",
        message: isManager
          ? "Set it up in Settings › Phone and Texting. You can send this one from your phone."
          : "Ask an owner to set it up. You can send this one from your phone.",
        actions: [{ label: "Send From My Phone", onPress: () => void fromPhone(text) }],
      });
      return;
    }
    if (phone && via === "messages" && lineActive && customerId) {
      setDone("Sending…");
      try {
        await sendCompanyText({ customerId, body: text, jobId });
        say("Texted ✓", `Texted from the company number: ${text}`);
      } catch (e) {
        say("Not Sent", e instanceof Error ? e.message : "Not sent.");
      }
      return;
    }
    await fromPhone(text);
  }

  return (
    <Button
      kind="secondary"
      title={done ?? "On My Way"}
      onPress={() => void send()}
      disabled={done === "Sending…"}
      style={{ paddingHorizontal: 12 }}
    />
  );
}
