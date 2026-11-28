import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkBusinessDetails,
  formatPhone,
  registrationStatus,
  toE164,
  uuidv7,
  type BusinessDetails,
  type RegistrationKind,
  type RegistrationStage,
} from "@leakbook/core";
import { CONTACT_EMAIL } from "@/lib/site";
import { adminClient } from "./admin";
import { REVIEW_NUMBERS_MESSAGE, isReviewShop } from "./review-shop";
import { activeLine } from "./texting";
import {
  TwilioError,
  TwilioRequestError,
  accountApi,
  buyNumber,
  createSubaccount,
  lineType,
  numberWebhooks,
  searchNumbers,
  subaccountAuth,
  twilioConfigured,
  twilioRequest,
  type TwilioAuth,
} from "./twilio";
import { READ_ONLY_MESSAGE, shopWritable } from "./usage";

// Texting registration (owner, 2026-11-27; docs/plans/texting-registration.md). A shop picks a
// toll-free number, a local number, or its own number and enters its business once; this
// submits it to Twilio and follows each review until the line can text. Every shop gets its own
// Twilio subaccount (Twilio's ISV setup: registrations are made as the subaccount that sends).
//
// The work is a list of steps per kind. Each step either finishes (its Twilio ids are saved at
// once, so a retry never buys or registers twice), waits for a review (checked again by
// /api/cron/texting), or fails (the error is kept for staff and retried later). A review that
// comes back sends the shop to "Needs Changes"; editing the details starts the reviews again.
//
// Use My Own Number: Twilio's hosted-number API is in private preview, "not intended for use by
// new customers", so staff start the hosting order in the shop's subaccount in Twilio's Console;
// the steps notice the number when it arrives there and finish by themselves.

type Db = SupabaseClient;

const TRUSTHUB = "https://trusthub.twilio.com/v1";
const MESSAGING = "https://messaging.twilio.com/v1";
/** Twilio's policies: a secondary customer profile, and the A2P messaging profile. */
const PROFILE_POLICY = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
const A2P_POLICY = "RNb0d4771c2c98518d916a3d4cd70a8f8b";

/** How long until a review is checked again, and the longest wait after repeated errors. */
const REVIEW_CHECK_MS = 30 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

export interface Registration {
  id: string;
  company_id: string;
  kind: RegistrationKind;
  phone_line_id: string | null;
  business: BusinessDetails;
  stage: RegistrationStage | "cancelled";
  step: string;
  twilio: Record<string, string>;
  problem: string | null;
  last_error: string | null;
  attempts: number;
  next_check_at: string;
  ready_at: string | null;
}

const COLUMNS =
  "id, company_id, kind, phone_line_id, business, stage, step, twilio, problem, last_error, attempts, next_check_at, ready_at";

/** The steps for each kind, in order. */
const A2P_STEPS = [
  "address",
  "profile",
  "profile_wait",
  "trust",
  "trust_wait",
  "brand",
  "brand_wait",
  "service",
  "campaign",
  "campaign_wait",
];
export const STEPS: Record<RegistrationKind, string[]> = {
  toll_free: ["account", "number", "tf_verify", "tf_wait", "ready"],
  local: ["account", "number", ...A2P_STEPS, "attach", "ready"],
  own: ["account", ...A2P_STEPS, "hosted_wait", "attach", "ready"],
};

/** Lines that can't get a confirmation text (Twilio Lookup's types). */
const NOT_TEXTABLE = ["landline", "fixedVoip", "tollFree", "pager", "voicemail", "uan"];
export const NOT_A_CELL = "This looks like a landline. Use a cell phone that gets texts.";

/**
 * The contact person's mobile must get texts: phone companies may text it to confirm the
 * business (as Housecall Pro checks for its pros). Unknown answers are let through.
 */
async function contactCanText(phone: string): Promise<boolean> {
  const type = await lineType(phone);
  return !type || !NOT_TEXTABLE.includes(type);
}

/** Plain words for staff: what each step is doing. */
export const STEP_LABEL: Record<string, string> = {
  start: "Starting",
  account: "Making the shop's Twilio subaccount",
  number: "Buying the number",
  tf_verify: "Sending the toll-free verification",
  tf_wait: "Waiting for toll-free review",
  address: "Saving the business address",
  profile: "Sending the business profile",
  profile_wait: "Waiting for business profile review",
  trust: "Sending the messaging profile",
  trust_wait: "Waiting for messaging profile review",
  brand: "Registering the brand",
  brand_wait: "Waiting for brand review",
  service: "Making the Messaging Service",
  campaign: "Registering the campaign",
  campaign_wait: "Waiting for campaign review",
  hosted_wait: "Waiting for the number to be hosted (start it in Twilio's Console)",
  attach: "Adding the number to the campaign",
  ready: "Ready",
};

export type RegisterResult =
  { message: string } | { error: string; fields?: Record<string, string> };

// ---------------------------------------------------------------------------
// What the shop sees
// ---------------------------------------------------------------------------

/** The registration as the apps and the website show it. The EIN shows its last 4 only. */
export function registrationView(reg: Registration | null, lineNumber: string | null) {
  if (!reg || reg.stage === "cancelled") return null;
  const number = lineNumber ? formatPhone(lineNumber) : null;
  const status = registrationStatus(reg.stage, reg.kind, number, reg.problem);
  const { ein, ...business } = reg.business;
  return {
    kind: reg.kind,
    stage: reg.stage,
    title: status.title,
    detail: status.detail,
    tone: status.tone,
    business: { ...business, ein: "" },
    ein_last4: (ein ?? "").replace(/\D/g, "").slice(-4),
  };
}

export async function currentRegistration(db: Db, companyId: string) {
  const { data } = await db
    .from("texting_registration")
    .select(COLUMNS)
    .eq("company_id", companyId)
    .neq("stage", "cancelled")
    .is("deleted_at", null)
    .maybeSingle();
  return (data as Registration | null) ?? null;
}

/**
 * Where a shop's texts and calls go out: its subaccount and Messaging Service, when a
 * registration made them (lines from before registrations use the main account).
 */
export async function lineRoute(db: Db, companyId: string) {
  const reg = await currentRegistration(db, companyId);
  return {
    account: reg?.twilio.account_sid ?? null,
    messagingService: reg?.twilio.messaging_service_sid ?? null,
  };
}

// ---------------------------------------------------------------------------
// Starting, editing, cancelling (owners and admins; the caller checked)
// ---------------------------------------------------------------------------

const NOT_SET_UP = "Texting isn’t set up on this server.";

/**
 * Start a registration: the kind, the business details, and the number for local (one picked
 * from the area code search) or own (the shop's). Local numbers are bought at once, so the
 * picked one is the shop's; the rest of the work starts right away and carries on in the
 * background.
 */
export async function startRegistration(
  user: Db,
  companyId: string,
  userId: string,
  input: { kind: unknown; number?: unknown; business: Record<string, unknown> },
  origin: string,
): Promise<RegisterResult> {
  if (!(await shopWritable(user, companyId))) return { error: READ_ONLY_MESSAGE };
  const db = adminClient();
  if (!db) return { error: NOT_SET_UP };
  if (await isReviewShop(companyId, db)) return { error: REVIEW_NUMBERS_MESSAGE };
  const kind = input.kind as RegistrationKind;
  if (!["toll_free", "local", "own"].includes(kind))
    return { error: "Choose how to get a number." };

  const checked = checkBusinessDetails(input.business as Record<string, unknown>);
  const number =
    kind === "toll_free" ? null : toE164(typeof input.number === "string" ? input.number : "");
  if ("fields" in checked || (kind !== "toll_free" && !number)) {
    const fields: Record<string, string> = "fields" in checked ? { ...checked.fields } : {};
    if (kind !== "toll_free" && !number) fields.number = "Enter a US phone number.";
    return { error: "Check the highlighted fields.", fields };
  }
  if (!(await contactCanText(checked.details.phone)))
    return { error: "Check the highlighted fields.", fields: { phone: NOT_A_CELL } };
  if (await currentRegistration(db, companyId))
    return { error: "This shop is already setting up a number." };
  const existing = await activeLine(db, companyId);
  if (existing?.status === "active") return { error: "This shop already has a number." };
  // A number entered before registrations (pending, no registration): its own number goes on
  // with it; choosing another way lets it go.
  if (existing) await db.from("phone_line").update({ status: "released" }).eq("id", existing.id);

  // The line comes first (pending until its texts are approved): for a local number, buying it
  // now makes it the shop's; for the shop's own, it holds the number.
  let lineId: string | null = null;
  const twilio: Record<string, string> = {};
  if (number) {
    lineId = uuidv7();
    const { error } = await db.from("phone_line").insert({
      id: lineId,
      company_id: companyId,
      number,
      source: kind === "own" ? "existing" : "new",
      status: "pending",
    });
    if (error)
      return {
        error:
          error.code === "23505" ? "Another shop uses that number." : "Couldn’t save the number.",
      };
    twilio.number = number;
  }

  const id = uuidv7();
  const { error } = await db.from("texting_registration").insert({
    id,
    company_id: companyId,
    kind,
    phone_line_id: lineId,
    business: checked.details,
    twilio,
    created_by: userId,
  });
  if (error) {
    if (lineId) await db.from("phone_line").update({ status: "released" }).eq("id", lineId);
    return {
      error:
        error.code === "23505"
          ? "This shop is already setting up a number."
          : "Couldn’t start the registration.",
    };
  }

  if (!twilioConfigured()) {
    // The live site without Twilio keys: the details wait, and the 30-minute check starts the
    // work once Twilio is connected. Anywhere else it's demo mode: made up and ready at once.
    if (process.env.VERCEL_ENV === "production")
      return { message: "We’ve got your details. We’ll start registering your number shortly." };
    await finishDemo(db, id, companyId, lineId);
    return { message: "Your number is ready." };
  }
  const reg = await getRegistration(db, id);
  if (reg) {
    await advance(db, reg, origin);
    const after = await getRegistration(db, id);
    if (kind === "local" && after && !after.twilio.number_sid) {
      // The picked number couldn't be bought (someone else took it): start over.
      await cancelRegistration(companyId);
      return { error: "Couldn’t get that number. Search again and pick another." };
    }
  }
  return { message: "We’re registering your number. This usually takes one to three weeks." };
}

async function finishDemo(db: Db, id: string, companyId: string, lineId: string | null) {
  let line = lineId;
  if (!line) {
    const [n] = await searchNumbers(null);
    line = uuidv7();
    await db.from("phone_line").insert({
      id: line,
      company_id: companyId,
      number: n.number,
      source: "new",
      status: "pending",
    });
  }
  await db.from("phone_line").update({ status: "active" }).eq("id", line);
  await db
    .from("texting_registration")
    .update({
      phone_line_id: line,
      stage: "ready",
      step: "ready",
      ready_at: new Date().toISOString(),
      twilio: { demo: "true" },
    })
    .eq("id", id);
}

/**
 * New business details after a review came back: saved, and the reviews start again (the
 * subaccount and the number stay).
 */
export async function updateRegistration(
  user: Db,
  companyId: string,
  business: Record<string, unknown>,
  origin: string,
): Promise<RegisterResult> {
  if (!(await shopWritable(user, companyId))) return { error: READ_ONLY_MESSAGE };
  const db = adminClient();
  if (!db) return { error: NOT_SET_UP };
  const reg = await currentRegistration(db, companyId);
  if (!reg) return { error: "There’s no registration to change." };
  if (reg.stage === "ready") return { error: "Your number is already ready." };
  // The EIN isn't sent back to the apps (only its last 4): left empty, the saved one stays.
  const ein =
    typeof business.ein === "string" && business.ein.trim() ? business.ein : reg.business.ein;
  const checked = checkBusinessDetails({ ...business, ein });
  if ("fields" in checked)
    return { error: "Check the highlighted fields.", fields: checked.fields };
  if (!(await contactCanText(checked.details.phone)))
    return { error: "Check the highlighted fields.", fields: { phone: NOT_A_CELL } };

  // Keep what isn't a review: the subaccount, the number, the Messaging Service.
  const keep = ["account_sid", "number", "number_sid", "messaging_service_sid"];
  const twilio = Object.fromEntries(
    Object.entries(reg.twilio).filter(([k]) => keep.includes(k)),
  ) as Record<string, string>;
  // A toll-free verification can't be made twice for a number: the old one goes first.
  if (reg.twilio.tf_verification_sid)
    twilio.old_tf_verification_sid = reg.twilio.tf_verification_sid;
  const steps = STEPS[reg.kind];
  const restart = reg.kind === "toll_free" ? "tf_verify" : "address";
  await db
    .from("texting_registration")
    .update({
      business: checked.details,
      twilio,
      stage: "registering",
      step: steps.includes(restart) ? restart : steps[0],
      problem: null,
      last_error: null,
      attempts: 0,
      next_check_at: new Date().toISOString(),
    })
    .eq("id", reg.id);
  const fresh = await getRegistration(db, reg.id);
  if (fresh && twilioConfigured()) await advance(db, fresh, origin);
  return { message: "Sent again. We’ll let you know how it goes." };
}

/** Stop a registration that isn't finished; its pending line is let go. */
export async function cancelRegistration(companyId: string): Promise<RegisterResult> {
  const db = adminClient();
  if (!db) return { error: NOT_SET_UP };
  const reg = await currentRegistration(db, companyId);
  if (reg && reg.stage !== "ready") {
    await db.from("texting_registration").update({ stage: "cancelled" }).eq("id", reg.id);
    // A bought number stays in the shop's subaccount until staff release it (Admin › Texting).
  }
  await db
    .from("phone_line")
    .update({ status: "released" })
    .eq("company_id", companyId)
    .eq("status", "pending");
  return { message: "Cancelled." };
}

async function getRegistration(db: Db, id: string) {
  const { data } = await db.from("texting_registration").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as Registration | null) ?? null;
}

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

type StepResult = { done: Record<string, string> } | { wait: true } | { changes: string };

interface Ctx {
  reg: Registration;
  db: Db;
  origin: string;
  shop: string;
  auth: () => Promise<TwilioAuth>;
}

const form = (fields: Record<string, string | string[] | undefined>) => {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) f.append(k, one);
  }
  return f;
};

/** Trust Hub's names for the business types core offers. */
const TRUSTHUB_TYPE: Record<BusinessDetails["business_type"], string> = {
  llc: "Limited Liability Corporation",
  corporation: "Corporation",
  partnership: "Partnership",
  sole_proprietor: "Sole Proprietorship",
  nonprofit: "Non-profit Corporation",
};

function jobPosition(title: string) {
  if (/owner|ceo|president|founder|principal|member/i.test(title)) return "CEO";
  if (/cfo|finance/i.test(title)) return "CFO";
  if (/director/i.test(title)) return "Director";
  if (/general manager|\bgm\b/i.test(title)) return "GM";
  if (/vice president|\bvp\b/i.test(title)) return "VP";
  return "Other";
}

/** What the shop's customers get, for the reviewers (the shop's name in each). */
function campaignText(shop: string) {
  return {
    description: `${shop} is a pool service and leak detection company. It texts its own customers about their appointments (on the way, arrival times), service reports, quotes and invoices, and answers their questions.`,
    flow: `Customers give ${shop} their mobile number when they book a pool service or leak detection visit, by phone, in person, or on ${shop}'s website or service form, and say it's OK to text them. ${shop} uses Sundeck Pro, its field service software, to send them. Texts are about the customer's own service only, usually a few per visit. Message and data rates may apply. Reply STOP to opt out, HELP for help. Texting terms: https://sundeckpro.com/texting-terms Privacy policy: https://sundeckpro.com/privacy`,
    samples: [
      `${shop}: Hi Sam, Alex is on the way and should arrive around 10:30 AM. Reply STOP to opt out.`,
      `${shop}: Your leak detection report is ready: https://sundeckpro.com/r/7f3k2q Questions? Just reply. Reply STOP to opt out.`,
      `${shop}: Reminder: your pool service is tomorrow between 9 and 11 AM. Reply here to reschedule, HELP for help, STOP to opt out. Msg & data rates may apply.`,
    ],
    help: `${shop}: For help, reply here or call us. Texts about your pool service; usually a few per visit. Msg & data rates may apply. Reply STOP to opt out. Terms: sundeckpro.com/texting-terms`,
  };
}

async function trusthubStatus(auth: TwilioAuth, path: string) {
  const r = await twilioRequest<{ status: string }>(`${TRUSTHUB}${path}`, { auth });
  return r.status;
}

/** Evaluate a bundle against its policy, then send it for review. */
async function evaluateAndSubmit(auth: TwilioAuth, path: string, policy: string) {
  const ev = await twilioRequest<{
    status: string;
    results?: { failure_reason?: string; friendly_name?: string; passed?: boolean }[];
  }>(`${TRUSTHUB}${path}/Evaluations`, { form: form({ PolicySid: policy }), auth });
  if (ev.status !== "compliant") {
    const reasons = (ev.results ?? [])
      .filter((r) => r.passed === false && r.failure_reason)
      .map((r) => r.failure_reason)
      .join(" ");
    return reasons || "Some business details are missing or don’t match.";
  }
  await twilioRequest(`${TRUSTHUB}${path}`, { form: form({ Status: "pending-review" }), auth });
  return null;
}

/** Twilio's review status for a Trust Hub bundle, as a step result. */
function reviewResult(status: string, what: string): StepResult | null {
  if (status === "twilio-approved") return null;
  if (status === "twilio-rejected")
    return { changes: `The phone companies couldn’t confirm your ${what}.` };
  return { wait: true };
}

const STEP: Record<string, (c: Ctx) => Promise<StepResult>> = {
  async account(c): Promise<StepResult> {
    if (c.reg.twilio.account_sid) return { done: {} };
    const account = await createSubaccount(`${c.shop} (${c.reg.company_id.slice(0, 8)})`);
    return { done: { account_sid: account } };
  },

  async number(c): Promise<StepResult> {
    const account = c.reg.twilio.account_sid;
    if (c.reg.twilio.number_sid) return { done: {} };
    if (c.reg.kind === "local") {
      const sid = await buyNumber(c.reg.twilio.number, c.origin, account);
      await c.db.from("phone_line").update({ provider_sid: sid }).eq("id", c.reg.phone_line_id!);
      return { done: { number_sid: sid } };
    }
    // Toll-free: the first one Twilio offers.
    const [n] = await searchNumbers(null);
    if (!n) throw new TwilioError("No toll-free numbers available right now.");
    const sid = await buyNumber(n.number, c.origin, account);
    const lineId = uuidv7();
    const { error } = await c.db.from("phone_line").insert({
      id: lineId,
      company_id: c.reg.company_id,
      number: n.number,
      source: "new",
      status: "pending",
      provider_sid: sid,
    });
    if (error) throw new Error(`Saving the line: ${error.message}`);
    await c.db.from("texting_registration").update({ phone_line_id: lineId }).eq("id", c.reg.id);
    c.reg.phone_line_id = lineId;
    return { done: { number: n.number, number_sid: sid } };
  },

  async tf_verify(c): Promise<StepResult> {
    const b = c.reg.business;
    const auth = await c.auth();
    if (c.reg.twilio.old_tf_verification_sid) {
      await twilioRequest(
        `${MESSAGING}/Tollfree/Verifications/${c.reg.twilio.old_tf_verification_sid}`,
        { method: "DELETE", auth },
      ).catch(() => undefined);
    }
    const text = campaignText(c.shop);
    const soleProp = b.business_type === "sole_proprietor";
    const r = await twilioRequest<{ sid: string }>(`${MESSAGING}/Tollfree/Verifications`, {
      auth,
      form: form({
        TollfreePhoneNumberSid: c.reg.twilio.number_sid,
        BusinessName: b.legal_name,
        BusinessWebsite: b.website,
        NotificationEmail: CONTACT_EMAIL,
        UseCaseCategories: ["ACCOUNT_NOTIFICATIONS", "CUSTOMER_CARE"],
        UseCaseSummary: text.description,
        ProductionMessageSample: text.samples[0],
        OptInImageUrls: "https://sundeckpro.com/texting-terms",
        OptInType: "VERBAL",
        HelpMessageSample: text.help,
        MessageVolume: "1,000",
        AdditionalInformation: text.flow,
        BusinessType:
          b.business_type === "nonprofit"
            ? "NON_PROFIT"
            : soleProp
              ? "SOLE_PROPRIETOR"
              : "PRIVATE_PROFIT",
        BusinessRegistrationNumber: soleProp ? undefined : b.ein,
        BusinessRegistrationAuthority: soleProp ? undefined : "EIN",
        BusinessRegistrationCountry: soleProp ? undefined : "US",
        BusinessStreetAddress: b.street,
        BusinessCity: b.city,
        BusinessStateProvinceRegion: b.state,
        BusinessPostalCode: b.postal_code,
        BusinessCountry: "US",
        BusinessContactFirstName: b.first_name,
        BusinessContactLastName: b.last_name,
        BusinessContactEmail: b.email,
        BusinessContactPhone: b.phone,
        PrivacyPolicyUrl: "https://sundeckpro.com/privacy",
        TermsAndConditionsUrl: "https://sundeckpro.com/texting-terms",
      }),
    });
    return { done: { tf_verification_sid: r.sid } };
  },

  async tf_wait(c): Promise<StepResult> {
    const r = await twilioRequest<{ status: string; rejection_reason?: string | null }>(
      `${MESSAGING}/Tollfree/Verifications/${c.reg.twilio.tf_verification_sid}`,
      { auth: await c.auth() },
    );
    if (r.status === "TWILIO_APPROVED") return { done: {} };
    if (r.status === "TWILIO_REJECTED")
      return {
        changes: r.rejection_reason
          ? `The phone companies said: “${r.rejection_reason}”.`
          : "The phone companies couldn’t approve your number.",
      };
    return { wait: true };
  },

  async address(c): Promise<StepResult> {
    if (c.reg.twilio.address_sid) return { done: {} };
    const b = c.reg.business;
    const r = await accountApi<{ sid: string }>(
      c.reg.twilio.account_sid,
      "/Addresses.json",
      form({
        FriendlyName: b.legal_name.slice(0, 64),
        CustomerName: b.legal_name,
        Street: b.street,
        City: b.city,
        Region: b.state,
        PostalCode: b.postal_code,
        IsoCountry: "US",
      }),
    );
    return { done: { address_sid: r.sid } };
  },

  async profile(c): Promise<StepResult> {
    const auth = await c.auth();
    const b = c.reg.business;
    const t = { ...c.reg.twilio };
    const save = (more: Record<string, string>) => {
      Object.assign(t, more);
      return saveTwilio(c, more);
    };
    if (!t.profile_sid) {
      const p = await twilioRequest<{ sid: string }>(`${TRUSTHUB}/CustomerProfiles`, {
        auth,
        form: form({ PolicySid: PROFILE_POLICY, FriendlyName: b.legal_name, Email: CONTACT_EMAIL }),
      });
      await save({ profile_sid: p.sid });
    }
    const attach = (object: string) =>
      twilioRequest(`${TRUSTHUB}/CustomerProfiles/${t.profile_sid}/EntityAssignments`, {
        auth,
        form: form({ ObjectSid: object }),
      });
    if (!t.business_user_sid) {
      const u = await twilioRequest<{ sid: string }>(`${TRUSTHUB}/EndUsers`, {
        auth,
        form: form({
          Type: "customer_profile_business_information",
          FriendlyName: b.legal_name,
          Attributes: JSON.stringify({
            business_name: b.legal_name,
            business_identity: "direct_customer",
            business_type: TRUSTHUB_TYPE[b.business_type],
            business_industry: "PROFESSIONAL_SERVICES",
            business_regions_of_operation: "USA_AND_CANADA",
            business_registration_identifier: "EIN",
            business_registration_number: b.ein,
            website_url: b.website,
          }),
        }),
      });
      await attach(u.sid);
      await save({ business_user_sid: u.sid });
    }
    if (!t.rep_user_sid) {
      const u = await twilioRequest<{ sid: string }>(`${TRUSTHUB}/EndUsers`, {
        auth,
        form: form({
          Type: "authorized_representative_1",
          FriendlyName: `${b.first_name} ${b.last_name}`,
          Attributes: JSON.stringify({
            first_name: b.first_name,
            last_name: b.last_name,
            email: b.email,
            phone_number: b.phone,
            business_title: b.title,
            job_position: jobPosition(b.title),
          }),
        }),
      });
      await attach(u.sid);
      await save({ rep_user_sid: u.sid });
    }
    if (!t.address_doc_sid) {
      const d = await twilioRequest<{ sid: string }>(`${TRUSTHUB}/SupportingDocuments`, {
        auth,
        form: form({
          FriendlyName: `${b.legal_name} address`,
          Type: "customer_profile_address",
          Attributes: JSON.stringify({ address_sids: t.address_sid }),
        }),
      });
      await attach(d.sid);
      await save({ address_doc_sid: d.sid });
    }
    if (!t.primary_attached) {
      const primary = process.env.TWILIO_PRIMARY_PROFILE_SID;
      if (!primary) throw new Error("TWILIO_PRIMARY_PROFILE_SID isn't set.");
      await attach(primary);
      await save({ primary_attached: "true" });
    }
    const problem = await evaluateAndSubmit(
      auth,
      `/CustomerProfiles/${t.profile_sid}`,
      PROFILE_POLICY,
    );
    if (problem) return { changes: problem };
    return { done: {} };
  },

  async profile_wait(c): Promise<StepResult> {
    const status = await trusthubStatus(
      await c.auth(),
      `/CustomerProfiles/${c.reg.twilio.profile_sid}`,
    );
    return reviewResult(status, "business details") ?? { done: {} };
  },

  async trust(c): Promise<StepResult> {
    const auth = await c.auth();
    const b = c.reg.business;
    const t = { ...c.reg.twilio };
    if (!t.trust_sid) {
      const p = await twilioRequest<{ sid: string }>(`${TRUSTHUB}/TrustProducts`, {
        auth,
        form: form({
          PolicySid: A2P_POLICY,
          FriendlyName: `${b.legal_name} A2P`,
          Email: CONTACT_EMAIL,
        }),
      });
      t.trust_sid = p.sid;
      await saveTwilio(c, { trust_sid: p.sid });
    }
    const attach = (object: string) =>
      twilioRequest(`${TRUSTHUB}/TrustProducts/${t.trust_sid}/EntityAssignments`, {
        auth,
        form: form({ ObjectSid: object }),
      });
    if (!t.a2p_user_sid) {
      const u = await twilioRequest<{ sid: string }>(`${TRUSTHUB}/EndUsers`, {
        auth,
        form: form({
          Type: "us_a2p_messaging_profile_information",
          FriendlyName: `${b.legal_name} A2P`,
          Attributes: JSON.stringify({
            company_type: b.business_type === "nonprofit" ? "non-profit" : "private",
          }),
        }),
      });
      await attach(u.sid);
      await attach(t.profile_sid);
      t.a2p_user_sid = u.sid;
      await saveTwilio(c, { a2p_user_sid: u.sid });
    }
    const problem = await evaluateAndSubmit(auth, `/TrustProducts/${t.trust_sid}`, A2P_POLICY);
    if (problem) return { changes: problem };
    return { done: {} };
  },

  async trust_wait(c): Promise<StepResult> {
    const status = await trusthubStatus(await c.auth(), `/TrustProducts/${c.reg.twilio.trust_sid}`);
    return reviewResult(status, "business details") ?? { done: {} };
  },

  async brand(c): Promise<StepResult> {
    if (c.reg.twilio.brand_sid) return { done: {} };
    const r = await twilioRequest<{ sid: string }>(`${MESSAGING}/a2p/BrandRegistrations`, {
      auth: await c.auth(),
      form: form({
        CustomerProfileBundleSid: c.reg.twilio.profile_sid,
        A2PProfileBundleSid: c.reg.twilio.trust_sid,
        // Low-Volume Standard: no secondary vetting (fewer than 6,000 texts a day).
        SkipAutomaticSecVet: "true",
      }),
    });
    return { done: { brand_sid: r.sid } };
  },

  async brand_wait(c): Promise<StepResult> {
    const r = await twilioRequest<{
      status: string;
      errors?: { description?: string }[];
      failure_reason?: string | null;
    }>(`${MESSAGING}/a2p/BrandRegistrations/${c.reg.twilio.brand_sid}`, { auth: await c.auth() });
    if (r.status === "APPROVED") return { done: {} };
    if (r.status === "FAILED" || r.status === "SUSPENDED") {
      const why =
        r.errors
          ?.map((e) => e.description)
          .filter(Boolean)
          .join(" ") || r.failure_reason;
      return {
        changes: why
          ? `The phone companies said: “${why}”.`
          : "The phone companies couldn’t confirm your business.",
      };
    }
    return { wait: true };
  },

  async service(c): Promise<StepResult> {
    if (c.reg.twilio.messaging_service_sid) return { done: {} };
    const r = await twilioRequest<{ sid: string }>(`${MESSAGING}/Services`, {
      auth: await c.auth(),
      form: form({
        FriendlyName: c.shop.slice(0, 64),
        InboundRequestUrl: `${c.origin}/api/twilio/sms`,
        InboundMethod: "POST",
        StatusCallback: `${c.origin}/api/twilio/status`,
      }),
    });
    return { done: { messaging_service_sid: r.sid } };
  },

  async campaign(c): Promise<StepResult> {
    if (c.reg.twilio.campaign_sid) return { done: {} };
    const text = campaignText(c.shop);
    const r = await twilioRequest<{ sid: string }>(
      `${MESSAGING}/Services/${c.reg.twilio.messaging_service_sid}/Compliance/Usa2p`,
      {
        auth: await c.auth(),
        form: form({
          BrandRegistrationSid: c.reg.twilio.brand_sid,
          UsAppToPersonUsecase: "LOW_VOLUME",
          Description: text.description,
          MessageFlow: text.flow,
          MessageSamples: text.samples,
          HasEmbeddedLinks: "true",
          HasEmbeddedPhone: "false",
          PrivacyPolicyUrl: "https://sundeckpro.com/privacy",
          TermsAndConditionsUrl: "https://sundeckpro.com/texting-terms",
        }),
      },
    );
    return { done: { campaign_sid: r.sid } };
  },

  async campaign_wait(c): Promise<StepResult> {
    const r = await twilioRequest<{ campaign_status: string; errors?: { description?: string }[] }>(
      `${MESSAGING}/Services/${c.reg.twilio.messaging_service_sid}/Compliance/Usa2p/${c.reg.twilio.campaign_sid}`,
      { auth: await c.auth() },
    );
    if (r.campaign_status === "VERIFIED") return { done: {} };
    if (r.campaign_status === "FAILED") {
      const why = r.errors
        ?.map((e) => e.description)
        .filter(Boolean)
        .join(" ");
      return {
        changes: why
          ? `The phone companies said: “${why}”.`
          : "The phone companies couldn’t approve how your shop texts customers.",
      };
    }
    return { wait: true };
  },

  async hosted_wait(c): Promise<StepResult> {
    // Staff host the number in the shop's subaccount (Twilio's Console); it shows up here.
    const r = await accountApi<{ incoming_phone_numbers: { sid: string }[] }>(
      c.reg.twilio.account_sid,
      `/IncomingPhoneNumbers.json?${new URLSearchParams({ PhoneNumber: c.reg.twilio.number })}`,
    );
    const found = r.incoming_phone_numbers[0];
    if (!found) return { wait: true };
    // Texts come to Sundeck Pro (calls stay with the shop's phone company).
    await accountApi(
      c.reg.twilio.account_sid,
      `/IncomingPhoneNumbers/${found.sid}.json`,
      form({ SmsUrl: numberWebhooks(c.origin).SmsUrl }),
    );
    await c.db
      .from("phone_line")
      .update({ provider_sid: found.sid })
      .eq("id", c.reg.phone_line_id!);
    return { done: { number_sid: found.sid } };
  },

  async attach(c): Promise<StepResult> {
    if (c.reg.twilio.attached) return { done: {} };
    await twilioRequest(
      `${MESSAGING}/Services/${c.reg.twilio.messaging_service_sid}/PhoneNumbers`,
      {
        auth: await c.auth(),
        form: form({ PhoneNumberSid: c.reg.twilio.number_sid }),
      },
    ).catch((e) => {
      // Already in the service (a retry after a lost answer) is fine.
      if (!(e instanceof TwilioRequestError && e.status === 409)) throw e;
    });
    return { done: { attached: "true" } };
  },

  async ready(c): Promise<StepResult> {
    await c.db
      .from("phone_line")
      .update({ status: "active" })
      .eq("id", c.reg.phone_line_id!)
      .eq("status", "pending");
    return { done: {} };
  },
};

async function saveTwilio(c: Ctx, more: Record<string, string>) {
  c.reg.twilio = { ...c.reg.twilio, ...more };
  await c.db.from("texting_registration").update({ twilio: c.reg.twilio }).eq("id", c.reg.id);
}

/**
 * Do as many steps as can be done now: stops at a review to wait for, a review that came
 * back, an error (kept, and tried again later), or the end.
 */
export async function advance(db: Db, reg: Registration, origin: string): Promise<Registration> {
  const { data: company } = await db
    .from("company")
    .select("name")
    .eq("id", reg.company_id)
    .single();
  const shop = ((company?.name as string | undefined) ?? reg.business.legal_name).trim();
  const c: Ctx = {
    reg,
    db,
    origin,
    shop,
    auth: () => subaccountAuth(reg.twilio.account_sid),
  };
  const steps = STEPS[reg.kind];
  const now = () => new Date();
  const update = async (fields: Partial<Registration>) => {
    Object.assign(reg, fields);
    await db.from("texting_registration").update(fields).eq("id", reg.id);
  };

  for (let guard = 0; guard < steps.length + 2; guard++) {
    const step = reg.step === "start" ? steps[0] : reg.step;
    let result: StepResult;
    try {
      const run = STEP[step];
      if (!run) throw new Error(`Unknown step ${step}`);
      result = await run(c);
    } catch (e) {
      const detail =
        e instanceof TwilioRequestError
          ? `${e.detail} (${e.status})`
          : e instanceof Error
            ? e.message
            : String(e);
      const attempts = (reg.attempts ?? 0) + 1;
      const wait = Math.min(REVIEW_CHECK_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
      await update({
        step,
        attempts,
        last_error: `${STEP_LABEL[step] ?? step}: ${detail}`,
        next_check_at: new Date(now().getTime() + wait).toISOString(),
      });
      return reg;
    }
    if ("wait" in result) {
      await update({
        step,
        stage: "registering",
        attempts: 0,
        last_error: null,
        next_check_at: new Date(now().getTime() + REVIEW_CHECK_MS).toISOString(),
      });
      return reg;
    }
    if ("changes" in result) {
      await update({ step, stage: "needs_changes", problem: result.changes, last_error: null });
      return reg;
    }
    if (Object.keys(result.done).length) await saveTwilio(c, result.done);
    const next = steps[steps.indexOf(step) + 1];
    if (!next) {
      await update({
        step: "ready",
        stage: "ready",
        ready_at: now().toISOString(),
        problem: null,
        last_error: null,
        attempts: 0,
      });
      return reg;
    }
    await update({ step: next, attempts: 0, last_error: null });
  }
  return reg;
}

/** The cron run: every registration that's due, one at a time (/api/cron/texting). */
export async function advanceDueRegistrations(db: Db, origin: string, limit = 20) {
  if (!twilioConfigured()) return { checked: 0 };
  const { data } = await db
    .from("texting_registration")
    .select(COLUMNS)
    .in("stage", ["registering", "verify_number"])
    .is("deleted_at", null)
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at")
    .limit(limit);
  const ready: string[] = [];
  for (const reg of (data ?? []) as Registration[]) {
    const after = await advance(db, reg, origin);
    if (after.stage === "ready") ready.push(after.company_id);
  }
  return { checked: data?.length ?? 0, ready };
}

/** Admin › Texting: try again now. */
export async function retryRegistration(id: string) {
  const db = adminClient();
  if (!db) return;
  await db
    .from("texting_registration")
    .update({ attempts: 0, next_check_at: new Date().toISOString() })
    .eq("id", id);
}
