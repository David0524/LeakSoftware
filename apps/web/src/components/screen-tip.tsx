import { companyServices, seenTips, tipFor, type TipPackage } from "@leakbook/core";
import { getOffice, getUser } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { TipCard } from "./tip";

/** This screen's tip for the person and their shop's package, until they close it. */
export async function ScreenTip({ screen, pkg }: { screen: string; pkg?: TipPackage }) {
  const [office, user] = await Promise.all([getOffice(), getUser()]);
  const company = await getCompany(office);
  const tip = tipFor({
    platform: "web",
    screen,
    role: office.isManager ? "owner" : "tech",
    services: companyServices(company.settings),
    seen: seenTips(user?.user_metadata.tips_seen),
    pkg,
  });
  return tip ? <TipCard id={tip.id} title={tip.title} message={tip.message} /> : null;
}
