"use client";

import { useActionState, useState } from "react";
import {
  addShopNote,
  extendTrial,
  setDemo,
  startSupport,
  turnOffTwoStep,
  type AdminState,
} from "@/app/actions/admin";
import { Segmented } from "@/components/segmented";
import { Sheet } from "@/components/sheet";
import { Button, Checkbox, Field, Notice, TextArea } from "@/components/ui";

// The Admin portal's actions (owner, 2026-10-22). Each opens a sheet that asks for a reason,
// since every one is written to the staff log.

function Result({ state }: { state: AdminState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * Open Shop: the shop's own office, as its admin, for 30 minutes to 2 hours. View Only by
 * default (owner: "Choose per session").
 */
export function OpenShop({ companyId, name }: { companyId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<"30" | "60" | "120">("30");
  const [access, setAccess] = useState<"view" | "edit">("view");
  const [state, action, pending] = useActionState(startSupport, {});
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Open Shop
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Open ${name}`}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          <p className="text-[0.9375rem] text-text-muted">
            You’ll see the shop’s office as its admin does, never the owner-only pages. The session
            and its reason are kept in the Activity Log; the shop isn’t told.
          </p>
          <TextArea
            label="Reason"
            name="reason"
            required
            minLength={3}
            maxLength={500}
            placeholder="Owner can’t find last week’s invoice (call, Oct 22)"
          />
          <Segmented
            label="Access"
            name="access"
            value={access}
            onChange={setAccess}
            options={[
              { value: "view", label: "View Only" },
              { value: "edit", label: "Can Make Changes" },
            ]}
          />
          <Segmented
            label="For"
            name="minutes"
            value={minutes}
            onChange={setMinutes}
            options={[
              { value: "30", label: "30 Min" },
              { value: "60", label: "1 Hour" },
              { value: "120", label: "2 Hours" },
            ]}
          />
          <Result state={state} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Opening…" : "Open Shop"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Extend Trial by 7, 14, or 30 days (only shops Stripe doesn't bill yet). */
export function ExtendTrial({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<"7" | "14" | "30">("14");
  const [state, action, pending] = useActionState(extendTrial, {});
  return (
    <>
      <Button type="button" kind="secondary" onClick={() => setOpen(true)}>
        Extend Trial
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Extend Trial">
        <form action={action} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          <p className="text-[0.9375rem] text-text-muted">
            Adds days to the trial, from today if it already ended. The shop works without a card
            until then.
          </p>
          <Segmented
            label="Add"
            name="days"
            value={days}
            onChange={setDays}
            options={[
              { value: "7", label: "7 Days" },
              { value: "14", label: "14 Days" },
              { value: "30", label: "30 Days" },
            ]}
          />
          <TextArea label="Reason" name="reason" required minLength={3} maxLength={500} />
          <Result state={state} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Extending…" : "Extend Trial"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Make Demo Shop (no charge) or End Demo (a week of trial). */
export function DemoToggle({ companyId, demo }: { companyId: string; demo: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(setDemo, {});
  const title = demo ? "End Demo" : "Make Demo Shop";
  return (
    <>
      <Button type="button" kind={demo ? "danger" : "secondary"} onClick={() => setOpen(true)}>
        {title}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="demo" value={demo ? "0" : "1"} />
          <p className="text-[0.9375rem] text-text-muted">
            {demo
              ? "The shop goes back to a trial that ends in 7 days. To keep working after that, the owner adds a card."
              : "The shop works with no card and no charge, like a demo code. It doesn’t count toward revenue."}
          </p>
          <TextArea label="Reason" name="reason" required minLength={3} maxLength={500} />
          <Result state={state} />
          <Button
            type="submit"
            kind={demo ? "danger" : "primary"}
            disabled={pending}
            className="w-full"
          >
            {pending ? "Saving…" : title}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export function ShopNoteForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(addShopNote, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="company_id" value={companyId} />
      <TextArea label="New Note" name="note" maxLength={4000} required />
      <Result state={state} />
      <Button type="submit" kind="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save Note"}
      </Button>
    </form>
  );
}

/** For someone who lost their authenticator, after checking it's really them. */
export function TwoStepOff({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(turnOffTwoStep, {});
  return (
    <>
      <Button type="button" kind="danger" onClick={() => setOpen(true)}>
        Turn Off Two-Step
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Turn Off Two-Step">
        <form action={action} className="space-y-4">
          <input type="hidden" name="user_id" value={userId} />
          <p className="text-[0.9375rem] text-text-muted">
            For someone who lost their phone. Afterwards their password alone signs in as {email},
            so check it’s really them first: write from their account’s email, or call the number
            the shop has for them.
          </p>
          <Checkbox label="I checked it’s really them" name="checked" value="1" />
          <Field label="How you checked" name="reason" required minLength={3} maxLength={500} />
          <Result state={state} />
          <Button type="submit" kind="danger" disabled={pending} className="w-full">
            {pending ? "Turning Off…" : "Turn Off Two-Step"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
