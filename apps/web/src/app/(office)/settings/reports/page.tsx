import type { Metadata } from "next";
import {
  SAVED_REPORT_SECTIONS,
  offersLeak,
  offersPool,
  savedReportSections,
  visitReportMode,
} from "@leakbook/core";
import { VisitReportSetting } from "@/components/visit-report-setting";
import { getCompany } from "@/lib/data";
import { removeConfigRow, saveReportTemplate, saveSavedReport } from "@/app/actions/settings";
import {
  SField,
  SSwitch,
  STextArea,
  SettingsFields,
  SettingsForm,
} from "@/components/settings-forms";
import {
  SettingsAddRow,
  SettingsListPage,
  SheetDanger,
  SheetRow,
} from "@/components/settings-list";
import { Grouped } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig } from "@/lib/data";

export const metadata: Metadata = { title: "Report Templates · Sundeck Pro" };

interface Template {
  id: string;
  key: "homeowner" | "partner" | "insurance";
  name: string;
  enabled: boolean;
  tone: string;
}

const ABOUT: Record<Exclude<Template["key"], "partner">, string> = {
  homeowner: "For the pool owner: plain words, what was found, what it means, and what to do next.",
  insurance: "For insurance claims.",
};

interface SavedReport {
  id: string;
  name: string;
  sections: unknown;
}

/** A saved report's name and its text for each section. */
function SavedReportFields({ saved }: { saved?: SavedReport }) {
  const text = savedReportSections(saved?.sections);
  const id = saved?.id ?? "new";
  return (
    <>
      <SettingsFields labelWidth="5rem">
        <SField
          label="Name"
          name="name"
          id={`saved-name-${id}`}
          defaultValue={saved?.name}
          placeholder="No leak found"
          required
        />
      </SettingsFields>
      {SAVED_REPORT_SECTIONS.map((s) => (
        <SettingsFields key={s.key}>
          <STextArea
            label={s.title}
            name={s.key}
            id={`saved-${s.key}-${id}`}
            rows={4}
            maxLength={4000}
            defaultValue={text[s.key] ?? ""}
          />
        </SettingsFields>
      ))}
    </>
  );
}

export default async function ReportTemplatesPage() {
  const office = await getOffice();
  const [templates, saved, company] = await Promise.all([
    listConfig<Template>(office, "report_template"),
    listConfig<SavedReport>(office, "saved_report"),
    getCompany(office),
  ]);
  const order = ["homeowner", "insurance"];
  // The partner report is gone (owner, 2026-10-18); its sent reports still open.
  const shown = templates
    .filter((t) => t.key !== "partner")
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  // Pool care shops have only visit reports; the leak report and saved reports are leak
  // detection's (2026-10-20).
  const leak = offersLeak(company.settings);
  return (
    <SettingsListPage
      title="Report Templates"
      subtitle={
        leak
          ? "Which reports techs can send, and what they’re called. Each report is written from the job’s checklist, tests, and findings."
          : "What goes to the customer after each maintenance visit."
      }
      add={
        leak
          ? {
              label: "Add Saved Report",
              inList: true,
              form: (
                <SettingsForm action={saveSavedReport} submit="Add Saved Report" primary full>
                  <SavedReportFields />
                </SettingsForm>
              ),
            }
          : undefined
      }
    >
      {leak ? (
        <Grouped>
          {shown.map((t) =>
            t.key === "insurance" ? (
              <SheetRow
                key={t.id}
                title={t.name}
                label={t.name}
                detail={ABOUT.insurance}
                value="Coming soon"
              />
            ) : (
              <SheetRow
                key={t.id}
                title={t.name}
                label={t.name}
                detail={ABOUT[t.key as "homeowner"]}
                value={t.enabled ? "On" : "Off"}
              >
                <SettingsForm action={saveReportTemplate} primary full>
                  <input type="hidden" name="id" value={t.id} />
                  <SettingsFields labelWidth="5rem">
                    <SField label="Name" name="name" id={`name-${t.id}`} defaultValue={t.name} />
                  </SettingsFields>
                  <SettingsFields>
                    <SSwitch
                      label="Techs can send this report"
                      name="enabled"
                      id={`enabled-${t.id}`}
                      defaultChecked={t.enabled}
                    />
                  </SettingsFields>
                </SettingsForm>
              </SheetRow>
            ),
          )}
        </Grouped>
      ) : null}

      {/* Your own wording, used word for word (owner, 2026-10-20: "Not like AI prompts, but a
          copy/paste essentially that the tech uses each time"). */}
      {offersPool(company.settings) ? (
        <Grouped
          title="Visit reports"
          className={leak ? "mt-8" : undefined}
          footer="A maintenance visit’s report: the water test, the checklist and cleanings, and photos, at a link for the customer."
        >
          <li className="py-3">
            <VisitReportSetting initial={visitReportMode(company.settings)} />
          </li>
        </Grouped>
      ) : null}

      {leak ? (
        <Grouped
          title="Saved reports"
          className="mt-8"
          footer="Text you use again and again. On a report, Use Saved Report puts it in word for word."
        >
          {saved.map((r) => (
            <SheetRow
              key={r.id}
              title={r.name}
              label={r.name}
              detail={SAVED_REPORT_SECTIONS.filter((s) => savedReportSections(r.sections)[s.key])
                .map((s) => s.title)
                .join(", ")}
            >
              <SettingsForm action={saveSavedReport} primary full>
                <input type="hidden" name="id" value={r.id} />
                <SavedReportFields saved={r} />
              </SettingsForm>
              <SheetDanger>
                <SettingsForm
                  action={removeConfigRow}
                  submit="Delete"
                  danger
                  full
                  confirm="Delete this saved report?"
                >
                  <input type="hidden" name="table" value="saved_report" />
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="path" value="/settings/reports" />
                </SettingsForm>
              </SheetDanger>
            </SheetRow>
          ))}
          <SettingsAddRow label="Add Saved Report" />
        </Grouped>
      ) : null}
    </SettingsListPage>
  );
}
