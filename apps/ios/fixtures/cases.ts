import type { ModuleCases } from "./case";
import { activity } from "./cases/activity";
import { basics } from "./cases/basics";
import { dayMap } from "./cases/day-map";
import { inspection } from "./cases/inspection";
import { maintenance } from "./cases/maintenance";
import { media } from "./cases/media";
import { notifications } from "./cases/notifications";
import { pricing } from "./cases/pricing";
import { routing } from "./cases/routing";
import { routePath } from "./cases/route-path";
import { routeStartCases } from "./cases/route-start";
import { schedule } from "./cases/schedule";
import { search } from "./cases/search";
import { serviceDaysCases } from "./cases/service-days";
import { todayHeroCases } from "./cases/today-hero";
import { progressCues } from "./cases/progress-cues";
import { weekPlan } from "./cases/week-plan";
import { download } from "./cases/download";
import { team } from "./cases/team";
import { logoColors } from "./cases/logo-colors";
import { wrapUpCases } from "./cases/wrap-up";
import { visitReportBarCases } from "./cases/visit-report-bar";
import { repairs } from "./cases/repairs";
import { answerIcons } from "./cases/answer-icons";
import { massEmail } from "./cases/mass-email";
import { customerCounts } from "./cases/customer-counts";
import { receipts } from "./cases/receipts";
import { signedOut } from "./cases/signed-out";
import { heardFrom } from "./cases/heard-from";
import { termsConsent } from "./cases/terms-consent";
import { setupGate } from "./cases/setup-gate";
import { password } from "./cases/password";
import { linkShare } from "./cases/link-share";
import { chemicalAdditions } from "./cases/chemical-additions";
import { reportPhoto } from "./cases/report-photo";

/** One fixture file per entry: apps/ios/Tests/Fixtures/<name>.json. */
export const modules: Record<string, ModuleCases> = {
  activity,
  basics,
  "day-map": dayMap,
  inspection,
  maintenance,
  media,
  notifications,
  pricing,
  routing,
  "route-path": routePath,
  "route-start": routeStartCases,
  schedule,
  search,
  "service-days": serviceDaysCases,
  "today-hero": todayHeroCases,
  "progress-cues": progressCues,
  "week-plan": weekPlan,
  download,
  team,
  "logo-colors": logoColors,
  "wrap-up": wrapUpCases,
  "visit-report-bar": visitReportBarCases,
  repairs,
  "chemical-additions": chemicalAdditions,
  "answer-icons": answerIcons,
  "mass-email": massEmail,
  "customer-counts": customerCounts,
  receipts,
  "signed-out": signedOut,
  "heard-from": heardFrom,
  "terms-consent": termsConsent,
  "setup-gate": setupGate,
  password,
  "link-share": linkShare,
  "report-photo": reportPhoto,
};
