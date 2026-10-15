import type { Metadata } from "next";
import { saveReportTemplate } from "@/app/actions/settings";
import {
  SField,
  STextArea,
  SSwitch,
  SettingsFields,
  SettingsForm,
} from "@/components/settings-forms";
import { SettingsListPage, SheetRow } from "@/components/settings-list";
import { Grouped } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig } from "@/lib/data";

export const metadata: Metadata = { title: "Report Templates · Tidemark" };

interface Template {
  id: string;
  key: "homeowner" | "partner" | "insurance";
  name: string;
  enabled: boolean;
  tone: string;
}

const ABOUT: Record<Template["key"], string> = {
  homeowner: "For the pool owner: plain words, what was found, what it means, and what to do next.",
  partner: "For pool companies and builders who send you work: technical, test readings first.",
  insurance: "For insurance claims.",
};

export default async function ReportTemplatesPage() {
  const office = await getOffice();
  const templates = await listConfig<Template>(office, "report_template");
  const order = ["homeowner", "partner", "insurance"];
  templates.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return (
    <SettingsListPage
      title="Report Templates"
      subtitle="The wording and tone of written reports. The facts (tests, findings, photos) always come from the job."
    >
      <Grouped>
        {templates.map((t) =>
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
              detail={ABOUT[t.key]}
              value={t.enabled ? "On" : "Off"}
            >
              <SettingsForm action={saveReportTemplate} primary full>
                <input type="hidden" name="id" value={t.id} />
                <SettingsFields labelWidth="5rem">
                  <SField label="Name" name="name" id={`name-${t.id}`} defaultValue={t.name} />
                  <STextArea
                    label="Tone and instructions"
                    name="tone"
                    id={`tone-${t.id}`}
                    rows={5}
                    defaultValue={t.tone}
                    hint="How the written summary should sound, e.g. “Friendly, no jargon, short paragraphs.”"
                  />
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
    </SettingsListPage>
  );
}
