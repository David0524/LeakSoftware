import {
  BUSINESS_WORK_LABELS,
  SECOND_BUSINESS_TEXT,
  TECH_CARD_TEXT,
  businessChoices,
  businessIdentity,
  hasSecondBusiness,
  jobBusiness,
  jobBusinessName,
  memberPhotoPath,
  showsTechOnReports,
  techInitial,
  workBusiness,
  type Business,
  type BusinessCompany,
  type BusinessJob,
  type BusinessWork,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// business.ts (2026-11-26): the second business name and the tech's photo.

const nick: BusinessCompany = {
  name: "All In Pool Solutions",
  phone: "702-555-0199",
  email: "office@allin.example",
  logo_path: "c/logo-1.png",
  brand_primary: "#12263A",
  review_url: "https://g.page/allin",
  settings: { services: "both" },
  second_name: "Southern Nevada Leak Detection",
  second_phone: "702-555-0100",
  second_email: " ",
  second_logo_path: "c/logo2-1.png",
  second_brand_primary: null,
  second_review_url: null,
  second_for: "leak",
};

const companies: BusinessCompany[] = [
  nick,
  {
    ...nick,
    second_for: "pool",
    second_brand_primary: "#0A5C8A",
    second_review_url: "https://x.y",
  },
  { ...nick, settings: { services: "pool" } },
  { ...nick, settings: null },
  { ...nick, second_name: "  " },
  { name: "Plain Pools", settings: { services: "both" } },
];

const jobs: [BusinessJob, BusinessJob | null][] = [
  [{ type: "detection" }, null],
  [{ type: "inspection" }, null],
  [{ type: "maintenance" }, null],
  [{ type: "repair" }, null],
  [{ type: "repair" }, { type: "detection" }],
  [{ type: "repair" }, { type: "maintenance" }],
  [{ type: "repair" }, { type: "maintenance", business: "second" }],
  [{ type: "repair", business: "second" }, null],
  [{ type: "detection", business: "main" }, null],
  [{ type: "detection", business: "other" }, null],
];

export const business: ModuleCases = {
  hasSecondBusiness: rule(
    (c: BusinessCompany) => hasSecondBusiness(c),
    companies.map((c) => [c]),
  ),
  workBusiness: rule(
    (c: BusinessCompany, w: BusinessWork) => workBusiness(c, w),
    companies.flatMap((c) =>
      (["leak", "pool"] as BusinessWork[]).map((w) => [c, w] as [BusinessCompany, BusinessWork]),
    ),
  ),
  jobBusiness: rule(
    (c: BusinessCompany, j: BusinessJob, p: BusinessJob | null) => jobBusiness(c, j, p),
    companies.flatMap((c) =>
      jobs.map(([j, p]) => [c, j, p] as [BusinessCompany, BusinessJob, BusinessJob | null]),
    ),
  ),
  businessIdentity: rule(
    (c: BusinessCompany, b: Business) => businessIdentity(c, b),
    companies.flatMap((c) =>
      (["main", "second"] as Business[]).map((b) => [c, b] as [BusinessCompany, Business]),
    ),
  ),
  jobBusinessName: rule(
    (c: BusinessCompany, j: BusinessJob | null, p: BusinessJob | null) => jobBusinessName(c, j, p),
    [
      [nick, null, null],
      ...jobs.map(
        ([j, p]) => [nick, j, p] as [BusinessCompany, BusinessJob | null, BusinessJob | null],
      ),
    ],
  ),
  businessChoices: rule(
    (c: BusinessCompany) => businessChoices(c),
    companies.map((c) => [c]),
  ),
  BUSINESS_WORK_LABELS: rule(() => BUSINESS_WORK_LABELS, [[]]),
  SECOND_BUSINESS_TEXT: rule(() => SECOND_BUSINESS_TEXT, [[]]),
  showsTechOnReports: rule(
    (s: unknown) => showsTechOnReports(s),
    [
      [null],
      [{}],
      [{ tech_on_reports: true }],
      [{ tech_on_reports: "true" }],
      [{ tech_on_reports: false }],
    ],
  ),
  TECH_CARD_TEXT: rule(() => TECH_CARD_TEXT, [[]]),
  techInitial: rule(
    (n: string | null) => techInitial(n),
    [["Brian"], [" brian"], [""], [null], ["Émile"]],
  ),
  memberPhotoPath: rule(
    (c: string, u: string, at: number) => memberPhotoPath(c, u, at),
    [["c1", "u1", 1764000000000]],
  ),
};
