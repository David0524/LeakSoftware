import { useLocalSearchParams } from "expo-router";
import { ChecklistComponents } from "../../../../../features/settings/Components";
import { PriceBook } from "../../../../../features/settings/PriceBook";
import { WebsitePage } from "../../../../../features/settings/SettingsIndex";
import { ExclusionReasons, Severities } from "../../../../../features/settings/SimpleLists";
import { Team } from "../../../../../features/settings/Team";
import { TestTypes } from "../../../../../features/settings/TestTypes";

/** One settings page (spec 5.12): the list pages in the app, the rest on the website. */
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
    default:
      return <WebsitePage page={page} />;
  }
}
