import { expect, test } from "@playwright/test";
import { adminClient, signedInClient } from "./backend";
import { RUN } from "./helpers";
import { findEmails } from "./outbox";

// The App Review shop (owner, 2026-10-24; docs/release/PRODUCTION.md, section 9): with
// company.review_shop on, the shop's emails and texts are recorded as sent but go nowhere
// (email to sundeckpro.com still goes, for testing), and phone numbers and calls are refused
// with a calm explanation. The started app writes emails to the outbox and has no Twilio
// account, so a held email is one the outbox never gets. Needs 20261022002800_review_shop.sql.

const NUMBERS = "Phone numbers can’t be added to the App Review shop.";
const CALLS = "Calls can’t be placed from the App Review shop.";

test("the App Review shop's sends are recorded but not delivered", async ({ request }) => {
  const admin = adminClient();
  test.skip(
    !admin || !!process.env.E2E_BASE_URL,
    "Needs SUPABASE_SERVICE_ROLE_KEY and the started app (CI runs it against Supabase in Docker).",
  );
  test.setTimeout(180_000);

  // A shop of its own, made as sign-up does, then switched on by the service role (the
  // review-account script's job), on the demo plan so it's never locked.
  const who = { email: `review-${RUN}@demo.leakbook.test`, password: "Review-shop-e2e-1" };
  const { error: userError } = await admin!.auth.admin.createUser({
    email: who.email,
    password: who.password,
    email_confirm: true,
    user_metadata: { full_name: "Riley Review" },
  });
  expect(userError).toBeNull();
  const owner = await signedInClient(who.email, who.password);
  const { data: company, error: companyError } = await owner.rpc("create_company", {
    company_name: `Review Pools ${RUN}`,
    company_timezone: "America/Phoenix",
    company_services: "leak",
  });
  expect(companyError).toBeNull();
  const co = company as string;
  expect((await admin!.rpc("admin_set_demo", { target_company: co, demo: true })).error).toBeNull();

  // Members can't turn it on (the database refuses); the service role can.
  const { error: refused } = await owner.from("company").update({ review_shop: true }).eq("id", co);
  expect(refused?.code).toBe("42501");
  const { error: switched } = await admin!
    .from("company")
    .update({
      review_shop: true,
      address_line1: "2602 N 16th St",
      city: "Phoenix",
      state: "AZ",
      postal_code: "85016",
    })
    .eq("id", co);
  expect(switched).toBeNull();

  // Two customers in a city only they have: one at example.com, one at sundeckpro.com.
  const city = `Reviewton ${RUN}`;
  const pat = `pat-${RUN}@example.com`;
  const qa = `qa-${RUN}@sundeckpro.com`;
  const customers: string[] = [];
  for (const [name, email, phone] of [
    [`Pat ${RUN} Example`, pat, "(602) 555-0112"],
    [`Quinn ${RUN} QA`, qa, null],
  ] as const) {
    const { data: job, error } = await owner.rpc("create_job", {
      target_company: co,
      new_customer: { name, email, phone },
      existing_customer: null,
      new_property: { address_line1: "200 W Washington St", city, state: "AZ" },
      existing_property: null,
      job: { status: "unscheduled", type: "detection" },
      components: [],
    });
    expect(error).toBeNull();
    const { data: row } = await owner
      .from("job")
      .select("bill_to_customer_id")
      .eq("id", job as string)
      .single();
    customers.push(row!.bill_to_customer_id as string);
  }

  const { data: session } = await owner.auth.getSession();
  const headers = { authorization: `Bearer ${session.session!.access_token}` };

  // Email Customers: both are recorded as sent; only the sundeckpro.com address gets it.
  const subject = `Spring opening ${RUN}`;
  const sent = await request.post("/api/mass-email/send", {
    headers,
    data: {
      company_id: co,
      subject,
      body: "Hi {first name},\n\nOpenings start next week.",
      audience: { city },
      expected: 2,
    },
  });
  expect(sent.status()).toBe(200);
  expect(await sent.json()).toMatchObject({ message: "Sent to 2 customers.", sent: 2, failed: 0 });
  const { data: recipients } = await admin!
    .from("email_campaign_recipient")
    .select("email, status, provider_id")
    .eq("company_id", co);
  const byEmail = new Map((recipients ?? []).map((r) => [r.email as string, r]));
  expect(byEmail.get(pat)).toMatchObject({ status: "sent" });
  expect(byEmail.get(pat)!.provider_id).toMatch(/^review-/);
  expect(byEmail.get(qa)).toMatchObject({ status: "sent" });
  expect(byEmail.get(qa)!.provider_id).toMatch(/^outbox-/);
  expect(await findEmails((e) => e.to === pat)).toHaveLength(0);
  expect(await findEmails((e) => e.to === qa && e.subject === subject)).toHaveLength(1);

  // Phone numbers: refused before a search, a purchase, or setting up the shop's own number.
  for (const action of [
    { action: "search", area_code: "602" },
    { action: "take", number: "+16025550147" },
    { action: "keep", number: "(602) 555-0147" },
  ]) {
    const r = await request.post("/api/phone", { headers, data: { company_id: co, ...action } });
    expect(r.status(), action.action).toBe(400);
    expect((await r.json()).error).toBe(NUMBERS);
  }
  const { count: lines } = await admin!
    .from("phone_line")
    .select("id", { count: "exact", head: true })
    .eq("company_id", co);
  expect(lines).toBe(0);

  // With its made-up texting number (as the review-account script gives it), a text is
  // recorded as sent; calls are refused.
  const number = `+14805550${180 + Math.floor(Math.random() * 10)}`;
  const { data: line, error: lineError } = await admin!
    .from("phone_line")
    .insert({ company_id: co, number, status: "active", provider_sid: "review-shop" })
    .select("id")
    .single();
  expect(lineError).toBeNull();
  try {
    const text = await request.post("/api/texts", {
      headers,
      data: { customerId: customers[0], body: `On my way ${RUN}` },
    });
    expect(text.status()).toBe(200);
    const { conversationId } = (await text.json()) as { conversationId: string };
    const { data: message } = await admin!
      .from("text_message")
      .select("status, provider_sid, body")
      .eq("conversation_id", conversationId)
      .single();
    expect(message).toMatchObject({ status: "sent", body: `On my way ${RUN}` });
    expect(message!.provider_sid).toMatch(/^demo-/);

    const call = await request.post("/api/calls", { headers, data: { conversationId } });
    expect(call.status()).toBe(400);
    expect((await call.json()).error).toBe(CALLS);
  } finally {
    // The number is made up; let it go so another run can use it.
    await admin!.from("phone_line").update({ status: "released" }).eq("id", line!.id);
  }
});
