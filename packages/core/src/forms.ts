import type { Property } from "./models";

export interface NewJobInput {
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  propertyId?: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  /** YYYY-MM-DD and HH:MM in the shop's time zone, or empty. */
  scheduleDate: string;
  scheduleTime: string;
}

export type FormErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateNewJob(input: NewJobInput): FormErrors<keyof NewJobInput> {
  const errors: FormErrors<keyof NewJobInput> = {};
  if (!input.customerId && !input.customerName.trim())
    errors.customerName = "Enter the customer's name.";
  if (!input.customerId && input.customerEmail.trim() && !EMAIL.test(input.customerEmail.trim())) {
    errors.customerEmail = "Check the email address.";
  }
  if (!input.propertyId && !input.addressLine1.trim())
    errors.addressLine1 = "Enter the street address.";
  if (input.scheduleDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.scheduleDate)) {
    errors.scheduleDate = "Use the format YYYY-MM-DD.";
  }
  if (input.scheduleTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(input.scheduleTime)) {
    errors.scheduleTime = "Use 24-hour time, like 09:30 or 14:00.";
  }
  if (input.scheduleTime && !input.scheduleDate) errors.scheduleDate = "Pick a date for this time.";
  return errors;
}

/**
 * Convert a wall-clock date and time in a time zone to an ISO instant.
 * Works without a time zone library by measuring the zone's offset at that moment.
 */
export function zonedTimeToIso(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = (time || "08:00").split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(instant));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return (
      Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - instant
    );
  };
  // Two passes handle instants near a daylight saving change.
  let utc = guess - offset(guess);
  utc = guess - offset(utc);
  return new Date(utc).toISOString();
}

export function formatAddress(
  p: Pick<Property, "address_line1" | "city" | "state" | "postal_code">,
): string {
  const cityLine = [p.city, [p.state, p.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [p.address_line1, cityLine].filter(Boolean).join(", ");
}

export type JobTiming =
  | { kind: "now"; at: Date }
  | { kind: "scheduled"; date: string; time: string; timeZone: string }
  | { kind: "later" };

export interface NewJobDetails {
  poolType: Property["pool_type"];
  hasSpa: boolean;
  accessNotes: string;
  timing: JobTiming;
  assignedUserId: string | null;
}

type Values = Record<string, string | number | boolean | null>;

/**
 * Field values for the rows the New job screen creates. Existing customer or property ids
 * in `input` mean that row is reused and not returned.
 */
export function newJobRecords(
  input: NewJobInput,
  d: NewJobDetails,
): {
  customer: Values | null;
  property: Omit<Values, "customer_id"> | null;
  job: Omit<Values, "property_id" | "bill_to_customer_id">;
} {
  const blankToNull = (s: string) => s.trim() || null;
  const customer = input.customerId
    ? null
    : {
        kind: "homeowner",
        name: input.customerName.trim(),
        phone: blankToNull(input.customerPhone),
        email: blankToNull(input.customerEmail),
      };
  const property = input.propertyId
    ? null
    : {
        address_line1: input.addressLine1.trim(),
        city: blankToNull(input.city),
        state: blankToNull(input.state)?.toUpperCase() ?? null,
        postal_code: blankToNull(input.postalCode),
        pool_type: d.poolType ?? null,
        has_pool: true,
        has_spa: d.hasSpa,
        access_notes: blankToNull(d.accessNotes),
      };
  const job: Values = { type: "detection", assigned_user_id: d.assignedUserId };
  if (d.timing.kind === "now") {
    job.status = "in_progress";
    job.started_at = d.timing.at.toISOString();
  } else if (d.timing.kind === "scheduled") {
    job.status = "scheduled";
    job.scheduled_start = zonedTimeToIso(d.timing.date, d.timing.time, d.timing.timeZone);
  } else {
    job.status = "unscheduled";
  }
  return { customer, property, job };
}
