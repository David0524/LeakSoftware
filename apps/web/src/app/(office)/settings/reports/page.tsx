import type { Metadata } from "next";
import { saveReportTemplate } from "@/app/actions/settings";
import { SField, STextArea, SettingsForm } from "@/components/settings-forms";
import { Card, Checkbox, PageHeader } from "@/components/ui";
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
    <>
      <PageHeader
        title="Report Templates"
        subtitle="The wording and tone of written reports. The facts (tests, findings, photos) always come from the job."
      />
      <div className="space-y-6">
        {templates.map((t) =>
          t.key === "insurance" ? (
            <Card key={t.id}>
              <h2 className="font-display text-xl font-bold">
                {t.name} <span className="font-normal text-text-muted">· Coming soon</span>
              </h2>
              <p className="mt-1 text-text-muted">{ABOUT.insurance}</p>
            </Card>
          ) : (
            <Card key={t.id}>
              <h2 className="font-display text-xl font-bold">{t.name}</h2>
              <p className="mt-1 mb-4 text-text-muted">{ABOUT[t.key]}</p>
              <SettingsForm action={saveReportTemplate}>
                <input type="hidden" name="id" value={t.id} />
                <SField label="Name" name="name" id={`name-${t.id}`} defaultValue={t.name} />
                <STextArea
                  label="Tone and instructions"
                  name="tone"
                  id={`tone-${t.id}`}
                  rows={5}
                  defaultValue={t.tone}
                  hint="How the written summary should sound, e.g. “Friendly, no jargon, short paragraphs.”"
                />
                <Checkbox
                  label="Techs can send this report"
                  name="enabled"
                  id={`enabled-${t.id}`}
                  defaultChecked={t.enabled}
                />
              </SettingsForm>
            </Card>
          ),
        )}
      </div>
    </>
  );
}
