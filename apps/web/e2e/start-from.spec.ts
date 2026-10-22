import { expect, test } from "@playwright/test";
import { signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";

// Start the day from home or from the shop (owner, 2026-10-21;
// docs/design/2026-10-21-start-from-home.md): a tech sets Home with an address in More › My
// Profile; until it's on the map the setting says the day starts at the shop; once it is, the
// tech's day on Today drives from home and back home. No routing key in CI, so the lookup's
// result is written here as the website's lookup would write it.

// A real public place (approximate coordinates), never a home.
const PLACE = {
  address_line1: "455 N Galvin Pkwy",
  city: "Phoenix",
  postal_code: "85008",
  lat: 33.45006,
  lng: -111.94886,
};
// Stands in for a home: a museum, not anyone's house.
const HOME = { address: "1625 N Central Ave, Phoenix, AZ 85004", lat: 33.4672, lng: -112.0726 };

// The setting's words (core START_FROM_COPY), the same on every platform.
const START_FROM_COPY = {
  field: "Start My Day From",
  home: "Home",
  homeAddress: "Home Address",
  footer: "Routes, drive times and Optimize start and end here.",
  pending: "Starting from the shop until the address is found on the map.",
};

test("a tech starts their day from home", async ({ page }) => {
  const tech = await signedInClient(TECH.email, TECH.password);
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const techId = (await tech.auth.getUser()).data.user!.id;
  const { data: membership } = await tech
    .from("membership")
    .select("company_id")
    .eq("user_id", techId)
    .limit(1)
    .single();
  const company = membership!.company_id as string;

  try {
    // A job on the tech's day today, at a place on the map.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(
      new Date(),
    );
    const start = `${today}T21:00:00-07:00`;
    const { data: jobId, error } = await owner.rpc("create_job", {
      target_company: company,
      new_customer: { name: `Home Start ${RUN}`, phone: "602-555-0142" },
      existing_customer: null,
      new_property: {
        address_line1: PLACE.address_line1,
        city: PLACE.city,
        state: "AZ",
        postal_code: PLACE.postal_code,
        has_spa: false,
      },
      existing_property: null,
      job: {
        status: "scheduled",
        scheduled_start: start,
        scheduled_end: new Date(Date.parse(start) + 3_600_000).toISOString(),
        assigned_user_id: techId,
      },
      components: [],
    });
    if (error) throw error;
    const { data: job } = await owner.from("job").select("property_id").eq("id", jobId).single();
    await owner
      .from("property")
      .update({ latitude: PLACE.lat, longitude: PLACE.lng, location_source: "manual" })
      .eq("id", job!.property_id);

    // More › My Profile: Start My Day From, Home, and the home address.
    await signIn(page, TECH, "/more");
    await page.getByRole("link", { name: /My Profile/ }).click();
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
    const setting = page.getByTestId("start-from");
    await expect(setting.getByRole("radiogroup", { name: START_FROM_COPY.field })).toBeVisible();
    await expect(setting).toContainText(START_FROM_COPY.footer);
    await setting.getByRole("radio", { name: START_FROM_COPY.home }).click();
    await setting.getByRole("combobox", { name: START_FROM_COPY.homeAddress }).fill(HOME.address);
    await setting.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/^Saved\./).first()).toBeVisible();

    const { data: row } = await tech
      .from("member_start")
      .select("id, start_from, home_address")
      .eq("user_id", techId)
      .is("deleted_at", null)
      .single();
    expect(row).toMatchObject({ start_from: "home", home_address: HOME.address });

    // Not found on the map: the setting says the day starts at the shop until it is.
    await tech
      .from("member_start")
      .update({ home_latitude: null, home_longitude: null, home_geocoded_address: HOME.address })
      .eq("id", row!.id);
    await page.reload();
    await expect(setting.getByTestId("not-on-map")).toContainText(START_FROM_COPY.pending);

    // Found: the day starts and ends at home.
    await tech
      .from("member_start")
      .update({
        home_latitude: HOME.lat,
        home_longitude: HOME.lng,
        home_geocoded_address: HOME.address,
      })
      .eq("id", row!.id);
    await page.reload();
    await expect(setting.getByTestId("not-on-map")).toHaveCount(0);

    await page.goto("/today");
    // The drive home at the end of the day says where the day ends (the summary line that
    // said "from home" is gone, owner 2026-10-22).
    await expect(page.getByText(/\d+ (min|hr).* back home$/)).toBeVisible();
    await expect(page.getByText(/back to the shop/)).toHaveCount(0);
  } finally {
    // Back to the shop, so the demo tech's other tests see the shop's wording.
    await tech.from("member_start").update({ start_from: "shop" }).eq("user_id", techId);
  }
});
