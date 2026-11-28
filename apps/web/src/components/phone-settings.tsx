"use client";

import { useActionState, useState } from "react";
import {
  BUSINESS_FIELDS,
  BUSINESS_FOOTER,
  BUSINESS_GROUP_FOOTER,
  BUSINESS_SECTIONS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABEL,
  KIND_DETAIL,
  KIND_TITLE,
  REGISTRATION_KINDS,
  formatPhone,
  type BusinessDetails,
  type RegistrationKind,
} from "@leakbook/core";
import {
  findNumbers,
  registerNumber,
  updateBusiness,
  type NumberSearch,
} from "@/app/actions/texting";
import { Banner } from "./doc-ui";
import { SField, SSelect, SettingsFields, SettingsForm, SettingsSection } from "./settings-forms";
import { Button, Field, SectionTitle, cx } from "./ui";
import { orOffline } from "@/lib/offline";

// Settings › Phone and Texting: getting a company number (owner, 2026-11-27; plan
// docs/plans/texting-registration.md). Choose how, pick or enter the number, then the business
// details phone companies need. The apps show the same steps with the same words.

const INPUT_MODE: Record<string, "text" | "numeric" | "email" | "tel" | "url"> = {
  text: "text",
  number: "numeric",
  email: "email",
  phone: "tel",
  url: "url",
};

/** A list of choices with a checkmark on the chosen one, as iOS Settings lists them. */
function ChoiceList<K extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: K | null;
  options: { value: K; title: string; detail?: string }[];
  onChange: (v: K) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grouped">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{o.title}</span>
              {o.detail ? (
                <span className="block text-[0.9375rem] text-text-muted">{o.detail}</span>
              ) : null}
            </span>
            <span aria-hidden className={cx("w-5 text-xl text-link", !on && "invisible")}>
              ✓
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The business details, in their two groups. `saved`: what was sent before (EIN left out). */
function BusinessFields({
  saved,
  einLast4,
}: {
  saved?: Partial<BusinessDetails>;
  einLast4?: string;
}) {
  return (
    <>
      {BUSINESS_SECTIONS.map((section, i) => (
        <div key={section.title} className={i > 0 ? "pt-4" : undefined}>
          {/* The first group sits under the section's own title (Business details). */}
          {i > 0 ? <SectionTitle>{section.title}</SectionTitle> : null}
          <SettingsFields labelWidth="7.5rem">
            {section.keys.map((key) => {
              if (key === "business_type")
                return (
                  <SSelect
                    key={key}
                    label="Type"
                    name="business_type"
                    defaultValue={saved?.business_type ?? "llc"}
                    options={BUSINESS_TYPES.map((t) => ({
                      value: t,
                      label: BUSINESS_TYPE_LABEL[t],
                    }))}
                  />
                );
              const f = BUSINESS_FIELDS.find((x) => x.key === key)!;
              const keep = key === "ein" && einLast4;
              return (
                <SField
                  key={key}
                  label={f.label}
                  name={key}
                  inputMode={INPUT_MODE[f.keyboard]}
                  type={f.keyboard === "email" ? "email" : f.keyboard === "phone" ? "tel" : "text"}
                  autoComplete="off"
                  placeholder={keep ? `Ends in ${einLast4}` : f.placeholder}
                  defaultValue={
                    key === "ein"
                      ? ""
                      : key === "phone" && saved?.phone
                        ? formatPhone(saved.phone)
                        : ((saved?.[key] as string | undefined) ?? "")
                  }
                  required={!keep}
                />
              );
            })}
          </SettingsFields>
          <p className="mt-2 px-4 text-[0.9375rem] text-text-muted sm:px-0">
            {BUSINESS_GROUP_FOOTER[section.title]}
          </p>
        </div>
      ))}
      <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">{BUSINESS_FOOTER}</p>
    </>
  );
}

/** Find a local number by area code and pick one. */
function LocalPicker({ picked, onPick }: { picked: string | null; onPick: (n: string) => void }) {
  const [state, search, pending] = useActionState(orOffline(findNumbers), {} as NumberSearch);
  return (
    <div className="space-y-3">
      <form action={search} className="flex items-end gap-2">
        <Field
          label="Area code"
          name="area_code"
          inputMode="numeric"
          pattern="[2-9][0-9]{2}"
          maxLength={3}
          required
          defaultValue={state.values?.area_code}
          className="w-36"
        />
        <Button type="submit" kind="secondary" disabled={pending}>
          {pending ? "Searching…" : "Search"}
        </Button>
      </form>
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.numbers?.length ? (
        <ChoiceList
          label="Numbers you can take"
          value={picked}
          onChange={onPick}
          options={state.numbers.map((n) => ({
            value: n.number,
            title: formatPhone(n.number),
            detail: [n.locality, n.region].filter(Boolean).join(", ") || undefined,
          }))}
        />
      ) : null}
    </div>
  );
}

/** No number yet: choose how to get one, then the business details. */
export function NumberSetup({ ownNumber }: { ownNumber?: string }) {
  const [kind, setKind] = useState<RegistrationKind>(ownNumber ? "own" : "toll_free");
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <SettingsSection title="Get a number" boxed>
        <p className="mb-4 text-text-muted">
          Texting needs a company number. Phone companies review each business before its number can
          text, so it takes a few days to a few weeks. We do the paperwork.
        </p>
        <ChoiceList
          label="How to get a number"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setPicked(null);
          }}
          options={REGISTRATION_KINDS.map((k) => ({
            value: k,
            title: KIND_TITLE[k],
            detail: KIND_DETAIL[k],
          }))}
        />
      </SettingsSection>

      {kind === "local" ? (
        <SettingsSection title="Choose a number" boxed>
          <LocalPicker picked={picked} onPick={setPicked} />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Business details">
        <SettingsForm action={registerNumber} submit="Register Number" full>
          <input type="hidden" name="kind" value={kind} />
          {kind === "local" ? <input type="hidden" name="number" value={picked ?? ""} /> : null}
          {kind === "own" ? (
            <SettingsFields labelWidth="7.5rem">
              <SField
                label="Your number"
                name="number"
                type="tel"
                autoComplete="off"
                placeholder="(702) 555-0100"
                defaultValue={ownNumber}
                required
                hint="The number your customers call today."
              />
            </SettingsFields>
          ) : null}
          {kind === "local" && !picked ? (
            <p className="text-[0.9375rem] text-text-muted">
              Search an area code and pick a number above.
            </p>
          ) : null}
          <BusinessFields />
        </SettingsForm>
      </SettingsSection>
    </div>
  );
}

/** A review came back: change the details and send them again. */
export function EditBusiness({
  saved,
  einLast4,
}: {
  saved: Partial<BusinessDetails>;
  einLast4: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button kind="primary" onClick={() => setOpen(true)}>
        Edit Business Details
      </Button>
    );
  return (
    <SettingsForm action={updateBusiness} submit="Send Again" full onSaved={() => setOpen(false)}>
      <BusinessFields saved={saved} einLast4={einLast4} />
    </SettingsForm>
  );
}
