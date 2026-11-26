import { companyServices, type JobType } from "./models";
import { techFirstNames } from "./report-summary";

// A second business name, and the tech on reports (Cole via the owner, 2026-11-26;
// docs/design/2026-11-26-second-business-and-tech-photos.md).
//
// A shop with Services = Both may add a second business (name, logo, phone, email, review link,
// main color) for one line of work. Each job uses one of the two on everything the customer sees
// about it. The database works the same out in app.job_business
// (20261022005900_second_business.sql). Ported to SundeckCore/Business.swift. No I/O.

/** Which of the shop's two businesses a job uses. */
export type Business = "main" | "second";
/** The line of work the second business is for. */
export type BusinessWork = "leak" | "pool";

/** The company row's columns these rules read (as synced). */
export interface BusinessCompany {
  name: string;
  phone?: string | null;
  email?: string | null;
  logo_path?: string | null;
  brand_primary?: string | null;
  review_url?: string | null;
  settings?: unknown;
  second_name?: string | null;
  second_phone?: string | null;
  second_email?: string | null;
  second_logo_path?: string | null;
  second_brand_primary?: string | null;
  second_review_url?: string | null;
  second_for?: string | null;
}

/** The job row's columns these rules read. */
export interface BusinessJob {
  type: JobType | string;
  business?: string | null;
}

/** What a business shows the customer. */
export interface BusinessIdentity {
  business: Business;
  name: string;
  phone: string | null;
  email: string | null;
  logoPath: string | null;
  brandPrimary: string | null;
  reviewUrl: string | null;
}

const blank = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** The second business's line of work (leak detection unless set to pool care). */
export function secondBusinessWork(company: BusinessCompany): BusinessWork {
  return company.second_for === "pool" ? "pool" : "leak";
}

/** Whether the shop has a second business in use: Services is Both and it has a name. */
export function hasSecondBusiness(company: BusinessCompany): boolean {
  return companyServices(company.settings) === "both" && blank(company.second_name) !== null;
}

/** The line of work a job type belongs to; null for a repair (it follows its source job). */
export function jobWork(type: string): BusinessWork | null {
  if (type === "detection" || type === "inspection") return "leak";
  if (type === "maintenance") return "pool";
  return null;
}

/** The business for a line of work (used for things tied to no one job, such as autopay). */
export function workBusiness(company: BusinessCompany, work: BusinessWork): Business {
  return hasSecondBusiness(company) && secondBusinessWork(company) === work ? "second" : "main";
}

/**
 * Which business a job uses: the main one without a second business; else the job's own choice;
 * else by its line of work; a repair follows the job it came from (`parent`, its own choice or
 * its work) and uses the main one without one.
 */
export function jobBusiness(
  company: BusinessCompany,
  job: BusinessJob,
  parent?: BusinessJob | null,
): Business {
  if (!hasSecondBusiness(company)) return "main";
  if (job.business === "main" || job.business === "second") return job.business;
  const work = jobWork(job.type);
  if (work) return workBusiness(company, work);
  if (job.type === "repair" && parent) {
    if (parent.business === "main" || parent.business === "second") return parent.business;
    const parentWork = jobWork(parent.type);
    if (parentWork) return workBusiness(company, parentWork);
  }
  return "main";
}

/**
 * What a business shows: the second one's name and logo (no logo when it has none, never the
 * main one), and its phone, email, review link and color, each falling back to the main one's.
 */
export function businessIdentity(company: BusinessCompany, business: Business): BusinessIdentity {
  const main: BusinessIdentity = {
    business: "main",
    name: company.name,
    phone: blank(company.phone),
    email: blank(company.email),
    logoPath: blank(company.logo_path),
    brandPrimary: blank(company.brand_primary),
    reviewUrl: blank(company.review_url),
  };
  if (business === "main" || !hasSecondBusiness(company)) return main;
  return {
    business: "second",
    name: blank(company.second_name) ?? company.name,
    phone: blank(company.second_phone) ?? main.phone,
    email: blank(company.second_email) ?? main.email,
    logoPath: blank(company.second_logo_path),
    brandPrimary: blank(company.second_brand_primary) ?? main.brandPrimary,
    reviewUrl: blank(company.second_review_url) ?? main.reviewUrl,
  };
}

/** The name a job's customer sees (share texts, On My Way, signature statements). */
export function jobBusinessName(
  company: BusinessCompany,
  job: BusinessJob | null | undefined,
  parent?: BusinessJob | null,
): string {
  if (!job) return company.name;
  return businessIdentity(company, jobBusiness(company, job, parent)).name;
}

/** The Business row's choices on the job page: both names, main first. Empty without one. */
export function businessChoices(company: BusinessCompany): { value: Business; label: string }[] {
  if (!hasSecondBusiness(company)) return [];
  return [
    { value: "main", label: company.name },
    { value: "second", label: businessIdentity(company, "second").name },
  ];
}

export const BUSINESS_WORK_LABELS: Record<BusinessWork, string> = {
  leak: "Leak Detection",
  pool: "Pool Care",
};

export const SECOND_BUSINESS_TEXT = {
  header: "Second Business",
  name: "Business Name",
  logo: "Logo",
  phone: "Phone",
  email: "Email",
  reviewUrl: "Review Link",
  color: "Main Color",
  useFor: "Use For",
  footer:
    "Jobs of this kind, and repairs that come from them, show this name, logo and contact info on reports, quotes, invoices, texts and emails. Everything else uses your main business. Leave the name blank to turn it off.",
  /** The job page's row. */
  jobRow: "Business",
} as const;

// ---------------------------------------------------------------------------
// The tech on reports
// ---------------------------------------------------------------------------

/** Whether reports end with the tech's photo and name (company.settings.tech_on_reports). */
export function showsTechOnReports(settings: unknown): boolean {
  return (settings as { tech_on_reports?: unknown } | null)?.tech_on_reports === true;
}

export const TECH_CARD_TEXT = {
  label: "Show the Tech on Reports",
  footer: "Reports end with “Your pool was serviced by Brian” and their photo. Add photos in Team.",
  photo: "Photo",
  myPhoto: "Your Photo",
  myPhotoFooter: "Customers see it on reports when your shop shows the tech.",
  addPhoto: "Add Photo",
  changePhoto: "Change Photo",
  removePhoto: "Remove Photo",
  /** Photo size saved, square, in pixels. */
  size: 512,
} as const;

/**
 * The line under the tech's photo at the end of a report: "Your pool was serviced by Brian",
 * by the report's job type (a monthly report is pool service). Null without a printable name.
 */
export function techCardLine(
  jobType: string | null | undefined,
  names: (string | null | undefined)[],
): string | null {
  const who = techFirstNames(names);
  if (!who) return null;
  switch (jobType) {
    case "maintenance":
      return `Your pool was serviced by ${who}`;
    case "detection":
      return `Your leak detection was done by ${who}`;
    case "inspection":
      return `Your pool inspection was done by ${who}`;
    case "repair":
      return `Your repair was done by ${who}`;
    default:
      return `Your pool was serviced by ${who}`;
  }
}

/** One initial for a tech without a photo. */
export function techInitial(name: string | null | undefined): string {
  const t = name?.trim();
  return t ? t[0]!.toUpperCase() : "?";
}

/** Where a member's photo is stored (company-assets): a new name per upload. */
export function memberPhotoPath(companyId: string, userId: string, at: number): string {
  return `${companyId}/team/${userId}-${at}.jpg`;
}
