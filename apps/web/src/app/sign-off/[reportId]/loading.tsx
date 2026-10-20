import { DOC_PAGE } from "@/components/doc-ui";
import { ReportLoading } from "@/components/report-loading";

export default function Loading() {
  return (
    <main className={DOC_PAGE}>
      <ReportLoading title="Getting the report ready to sign" />
    </main>
  );
}
