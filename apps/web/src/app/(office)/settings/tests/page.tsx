import type { Metadata } from "next";
import { formatFieldLines, type TestType } from "@leakbook/core";
import { removeConfigRow, saveTestType } from "@/app/actions/settings";
import {
  SField,
  STextArea,
  SSwitch,
  SettingsFields,
  SettingsForm,
} from "@/components/settings-forms";
import { SettingsListPage, SheetDanger, SheetRow } from "@/components/settings-list";
import { Grouped } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig } from "@/lib/data";

export const metadata: Metadata = { title: "Test Types · Sundeck Pro" };

/** Labels for built-in calculator thresholds (test_type.field_schema.options). */
const OPTION_LABELS: Record<string, { label: string; hint: string }> = {
  pass_max_drop_psi: {
    label: "Largest drop that still passes (PSI)",
    hint: "0 means the line must hold steady.",
  },
  min_duration_min: {
    label: "Shortest test that counts (minutes)",
    hint: "Shorter tests are marked unclear.",
  },
  fail_over_in_per_day: {
    label: "Fail above this loss per day (inches)",
    hint: "Water lost beyond evaporation, per 24 hours.",
  },
};

const FIELD_HELP =
  "One field per line. Add “(unit)” for a measurement, “: notes” for long text, or choices separated by “/”. End with * if required.";

function Outcomes({ t, p }: { t?: TestType; p: string }) {
  const on = new Set(t?.result_options ?? ["pass", "fail", "inconclusive"]);
  return (
    <fieldset>
      <legend className="mb-2 px-4 text-[0.8125rem] text-text-muted uppercase sm:px-0 sm:text-[1.0625rem] sm:font-medium sm:text-text sm:normal-case">
        Outcomes offered
      </legend>
      <SettingsFields className="sm:flex sm:flex-wrap sm:gap-x-6">
        <SSwitch
          label="Pass"
          name="outcome_pass"
          id={`pass-${p}`}
          defaultChecked={on.has("pass")}
        />
        <SSwitch
          label="Fail"
          name="outcome_fail"
          id={`fail-${p}`}
          defaultChecked={on.has("fail")}
        />
        <SSwitch
          label="Unclear"
          name="outcome_inconclusive"
          id={`unclear-${p}`}
          defaultChecked={on.has("inconclusive")}
        />
      </SettingsFields>
    </fieldset>
  );
}

/** Name and order: the first rows of every test type's form. */
function NameFields({ t, p, placeholder }: { t?: TestType; p: string; placeholder?: string }) {
  return (
    <>
      <SField
        label="Name"
        name="name"
        id={`name-${p}`}
        defaultValue={t?.name}
        placeholder={placeholder}
      />
      <SField
        label="Order"
        name="sort_order"
        id={`order-${p}`}
        inputMode="numeric"
        defaultValue={t ? t.sort_order : 100}
      />
    </>
  );
}

export default async function TestTypesPage() {
  const office = await getOffice();
  const types = await listConfig<TestType>(office, "test_type");
  return (
    <SettingsListPage
      title="Test Types"
      subtitle="Tests techs record on the phone. Pressure and bucket tests do the math; set the pass and fail lines your shop uses."
      add={{
        label: "Add Test Type",
        form: (
          <SettingsForm action={saveTestType} submit="Add Test Type" primary full>
            <SettingsFields labelWidth="5rem" className="sm:grid sm:grid-cols-[1fr_120px] sm:gap-4">
              <NameFields p="new" placeholder="Thermal camera scan" />
            </SettingsFields>
            <SettingsFields>
              <STextArea
                label="Fields"
                name="fields"
                id="fields-new"
                rows={5}
                placeholder={
                  "Location *\nSurface temp (°F)\nResult: Leak / No leak / Unclear\nNotes: notes"
                }
                hint={FIELD_HELP}
              />
            </SettingsFields>
            <Outcomes p="new" />
          </SettingsForm>
        ),
      }}
    >
      <Grouped>
        {types.map((t) => (
          <SheetRow
            key={t.id}
            title={t.name}
            label={t.name}
            detail={t.calculator ? "Calculates the result" : undefined}
            value={t.active ? undefined : "Off"}
          >
            <SettingsForm action={saveTestType} primary full>
              <input type="hidden" name="id" value={t.id} />
              <SettingsFields
                labelWidth="5rem"
                className="sm:grid sm:grid-cols-[1fr_120px] sm:gap-4"
              >
                <NameFields t={t} p={t.id} />
              </SettingsFields>
              {t.calculator ? (
                <div className="space-y-2">
                  <SettingsFields>
                    {Object.entries(t.field_schema.options ?? {}).map(([key, value]) => (
                      <SField
                        key={key}
                        label={OPTION_LABELS[key]?.label ?? key}
                        hint={OPTION_LABELS[key]?.hint}
                        name={`option_${key}`}
                        id={`option-${key}-${t.id}`}
                        inputMode="decimal"
                        defaultValue={value}
                        stacked
                      />
                    ))}
                  </SettingsFields>
                  <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">
                    Fields: {t.field_schema.fields.map((f) => f.label).join(", ")}. Built-in; the
                    phone calculates the result from these.
                  </p>
                </div>
              ) : (
                <SettingsFields>
                  <STextArea
                    label="Fields"
                    name="fields"
                    id={`fields-${t.id}`}
                    rows={Math.max(4, t.field_schema.fields.length + 1)}
                    defaultValue={formatFieldLines(t.field_schema.fields)}
                    hint={FIELD_HELP}
                  />
                </SettingsFields>
              )}
              <Outcomes t={t} p={t.id} />
              <SettingsFields>
                <SSwitch
                  label="Techs can record this test"
                  name="active"
                  id={`active-${t.id}`}
                  defaultChecked={t.active}
                />
              </SettingsFields>
            </SettingsForm>
            {!t.calculator ? (
              <SheetDanger>
                <SettingsForm
                  action={removeConfigRow}
                  submit="Remove Test Type"
                  danger
                  full
                  confirm="Remove this test type?"
                >
                  <input type="hidden" name="table" value="test_type" />
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="path" value="/settings/tests" />
                </SettingsForm>
              </SheetDanger>
            ) : null}
          </SheetRow>
        ))}
      </Grouped>
    </SettingsListPage>
  );
}
