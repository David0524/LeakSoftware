import Link from "next/link";
import { getOffice } from "@/lib/auth";
import { LocalTime } from "./local-time";

/**
 * Across the top of every office page while Sundeck Pro staff help a shop (Admin portal,
 * owner 2026-10-22): whose shop, View Only or Can Make Changes, when it ends, and End
 * Session. Navy, so it's never mistaken for the shop's own notices.
 */
export async function SupportBanner() {
  const office = await getOffice();
  const s = office.support;
  if (!s) return null;
  return (
    <div role="status" className="bg-navy px-4 py-2 text-white" data-testid="support-banner">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1">
        <p className="min-w-0 flex-1 text-[0.9375rem]">
          <span className="font-semibold">Support: {s.companyName}</span>
          {" · "}
          {s.access === "view" ? "View Only. Changes are off." : "Can Make Changes."}
          {" · "}
          Ends <LocalTime iso={s.endsAt} />
        </p>
        <Link
          href={`/admin/shops/${s.companyId}`}
          className="min-h-11 content-center px-2 text-[0.9375rem] underline"
        >
          Admin
        </Link>
        <form method="post" action="/api/admin/support/end">
          <input type="hidden" name="company_id" value={s.companyId} />
          <button
            type="submit"
            className="min-h-11 rounded-full bg-white/15 px-4 text-[0.9375rem] font-semibold hover:bg-white/25"
          >
            End Session
          </button>
        </form>
      </div>
    </div>
  );
}
