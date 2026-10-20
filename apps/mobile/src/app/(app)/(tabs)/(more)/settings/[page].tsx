import { useLocalSearchParams } from "expo-router";
import { CompanySettings } from "../../../../../features/settings/Company";
import { PhoneSettings } from "../../../../../features/settings/Phone";
import { ReportTemplates } from "../../../../../features/settings/ReportTemplates";
import { SchedulingSettings } from "../../../../../features/settings/Scheduling";
import { ChecklistComponents } from "../../../../../features/settings/Components";
import { PriceBook } from "../../../../../features/settings/PriceBook";
import { WebsitePage } from "../../../../../features/settings/SettingsIndex";
import { ExclusionReasons, Severities } from "../../../../../features/settings/SimpleLists";
import { Team } from "../../../../../features/settings/Team";
import { TestTypes } from "../../../../../features/settings/TestTypes";

/** One settings page (spec 5.12): in the app, except Payments and Import (the website). */
export default function SettingsPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  switch (page) {
    case "price-book":
      return <PriceBook />;
    case "components":
      return <ChecklistComponents />;
    case "tests":
      return <TestTypes />;
    case "severities":
      return <Severities />;
    case "exclusions":
      return <ExclusionReasons />;
    case "team":
      return <Team />;
    case "company":
      return <CompanySettings />;
    case "scheduling":
      return <SchedulingSettings />;
    case "reports":
      return <ReportTemplates />;
    case "phone":
      return <PhoneSettings />;
    default:
      return <WebsitePage page={page} />;
  }
}
