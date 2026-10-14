import type { Metadata } from "next";
import { formatFieldLines, type TestType } from "@leakbook/core";
import { removeConfigRow, saveTestType } from "@/app/actions/settings";
import { SField, STextArea, SettingsForm } from "@/components/settings-forms";
import { Card, Checkbox, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig } from "@/lib/data";

export const metadata: Metadata = { title: "Test Types · Tidemark" };

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
    <fieldset className="flex flex-wrap gap-6">
      <legend className="mb-1 font-medium">Outcomes offered</legend>
      <Checkbox label="Pass" name="outcome_pass" id={`pass-${p}`} defaultChecked={on.has("pass")} />
      <Checkbox label="Fail" name="outcome_fail" id={`fail-${p}`} defaultChecked={on.has("fail")} />
      <Checkbox
        label="Unclear"
        name="outcome_inconclusive"
        id={`unclear-${p}`}
        defaultChecked={on.has("inconclusive")}
      />
    </fieldset>
  );
}

export default async function TestTypesPage() {
  const office = await getOffice();
  const types = await listConfig<TestType>(office, "test_type");
  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Test Types"
        subtitle="Tests techs record on the phone. Pressure and bucket tests do the math; set the pass and fail lines your shop uses."
      />
      <div className="space-y-6">
        {types.map((t) => (
          <Card key={t.id}>
            <h2 className="mb-4 font-display text-xl font-bold">
              {t.name}
              {!t.active ? <span className="font-normal text-text-muted"> · off</span> : null}
            </h2>
            <SettingsForm action={saveTestType}>
              <input type="hidden" name="id" value={t.id} />
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <SField label="Name" name="name" id={`name-${t.id}`} defaultValue={t.name} />
                <SField
                  label="Order"
                  name="sort_order"
                  id={`order-${t.id}`}
                  inputMode="numeric"
                  defaultValue={t.sort_order}
                />
              </div>
              {t.calculator ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(t.field_schema.options ?? {}).map(([key, value]) => (
                    <SField
                      key={key}
                      label={OPTION_LABELS[key]?.label ?? key}
                      hint={OPTION_LABELS[key]?.hint}
                      name={`option_${key}`}
                      id={`option-${key}-${t.id}`}
                      inputMode="decimal"
                      defaultValue={value}
                    />
                  ))}
                  <p className="text-[0.9375rem] text-text-muted sm:col-span-2">
                    Fields: {t.field_schema.fields.map((f) => f.label).join(", ")}. Built-in; the
                    phone calculates the result from these.
                  </p>
                </div>
              ) : (
                <STextArea
                  label="Fields"
                  name="fields"
                  id={`fields-${t.id}`}
                  rows={Math.max(4, t.field_schema.fields.length + 1)}
                  defaultValue={formatFieldLines(t.field_schema.fields)}
                  hint={FIELD_HELP}
                />
              )}
              <Outcomes t={t} p={t.id} />
              <Checkbox
                label="Techs can record this test"
                name="active"
                defaultChecked={t.active}
              />
            </SettingsForm>
            {!t.calculator ? (
              <div className="mt-4">
                <SettingsForm
                  action={removeConfigRow}
                  submit="Remove Test Type"
                  danger
                  confirm="Remove this test type?"
                >
                  <input type="hidden" name="table" value="test_type" />
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="path" value="/settings/tests" />
                </SettingsForm>
              </div>
            ) : null}
          </Card>
        ))}

        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Add a test type</h2>
          <SettingsForm action={saveTestType} submit="Add Test Type" primary>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <SField label="Name" name="name" id="name-new" placeholder="Thermal camera scan" />
              <SField
                label="Order"
                name="sort_order"
                id="order-new"
                inputMode="numeric"
                defaultValue={100}
              />
            </div>
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
            <Outcomes p="new" />
          </SettingsForm>
        </Card>
      </div>
    </>
  );
}
