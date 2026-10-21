import { useEffect, useRef, useState } from "react";
import { saveMemberStart, useMemberStart } from "../../../../../data/memberStarts";
import { startForm, startWrite, type StartForm } from "../../../../../lib/memberStart";
import { StartFromFields } from "../../../../../features/settings/StartFrom";
import { useCompany, useSession } from "../../../../../state/session";
import { Button, Notice, Screen, Section } from "../../../../../ui/components";
import { haptics } from "../../../../../ui/haptics";

/**
 * My Profile (owner, 2026-10-21; docs/design/2026-10-21-start-from-home.md): where your day
 * starts, The Shop or Home, as the website's More › My Profile. Your own member_start row,
 * saved through sync; a new home address is then looked up on the map by the website.
 */
export default function MyProfile() {
  const company = useCompany();
  const { user } = useSession();
  const me = user?.id ?? "";
  const row = useMemberStart(company.id, me);
  const [form, setForm] = useState<StartForm>(() => startForm(row));
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  // The row arriving by sync after the page opened fills the form, until it's been changed.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setForm(startForm(row));
  }, [row]);

  const change = (next: StartForm) => {
    touched.current = true;
    setNotice(null);
    setError(undefined);
    setForm(next);
  };
  const w = startWrite(row, form);
  const changed = "error" in w || Object.keys(w.values).length > 0;

  function save() {
    if (!me) return;
    const failed = saveMemberStart(company.id, me, row, form);
    if (failed) return setError(failed);
    touched.current = false;
    haptics.success();
    setNotice("Saved.");
  }

  return (
    <Screen title="My Profile">
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <Section title="Your day">
        <StartFromFields form={form} onChange={change} row={row} error={error} />
      </Section>
      <Button title="Save" wide disabled={!changed} onPress={save} />
    </Screen>
  );
}
