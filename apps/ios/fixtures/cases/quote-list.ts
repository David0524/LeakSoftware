import {
  DEFAULT_QUOTE_SEGMENT,
  QUOTE_NEEDS_POOL,
  QUOTE_SEGMENTS,
  QUOTES_EMPTY,
  QUOTES_EMPTY_SEARCH,
  filterQuotes,
  isQuoteJob,
  newQuoteRecords,
  quoteRowDetail,
  quoteSegment,
  quoteSegmentCounts,
  quoteTitle,
  quoteWaitingForPool,
  validateNewQuote,
  JOB_STATUSES,
  type NewQuoteInput,
  type QuoteListItem,
  type QuoteStatus,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "declined", "expired"];

const item = (over: Partial<QuoteListItem>): QuoteListItem => ({
  number: 1001,
  status: "sent",
  total_cents: 125000,
  customer: "Jane Diaz",
  jobStatus: "quote",
  ...over,
});

const list: QuoteListItem[] = [
  item({ number: 1001 }),
  item({ number: 1002, status: "draft" }),
  item({ number: 1003, customer: "Bo Lee", jobNumber: 1050, jobStatus: "unscheduled" }),
  item({ number: null, status: "draft", customer: null }),
  item({ number: 1004, status: "expired", customer: "Ana Ruiz" }),
  item({ number: 1005, status: "declined", customer: "ANA RUIZ" }),
  item({ number: 1006, status: "accepted", jobStatus: "quote" }),
  item({ number: 1007, status: "accepted", jobNumber: 1060, jobStatus: "unscheduled" }),
];

const blank: NewQuoteInput = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
};

const inputs: NewQuoteInput[] = [
  blank,
  { ...blank, customerName: "   " },
  { ...blank, customerName: " Jane Diaz ", customerPhone: " 602-555-0100 ", customerEmail: " " },
  { ...blank, customerName: "Jane", customerEmail: "jane@" },
  { ...blank, customerName: "Jane", customerEmail: " jane@example.com " },
  { ...blank, customerId: "c1", customerEmail: "not an email" },
  { ...blank, customerId: "", customerName: "" },
  { ...blank, customerName: "Jane", city: "Phoenix" },
  { ...blank, customerName: "Jane", state: " az ", postalCode: "85016" },
  { ...blank, customerName: "Jane", propertyId: "p1", city: "Phoenix" },
  { ...blank, customerName: "Jane", propertyId: "", postalCode: "85016" },
  {
    ...blank,
    customerName: "Jane",
    addressLine1: " 1423 Palm Ct ",
    city: " Phoenix ",
    state: " az ",
    postalCode: " 85016 ",
  },
  { ...blank, customerName: "Jane", addressLine1: "1423 Palm Ct" },
  { ...blank, customerId: "c1", propertyId: "p1", addressLine1: "1423 Palm Ct" },
];

// quote-list.ts: standalone quotes and the Quotes list (owner, 2026-11-24).
export const quoteList: ModuleCases = {
  QUOTE_TEXTS: rule(
    () => ({
      QUOTE_SEGMENTS,
      DEFAULT_QUOTE_SEGMENT,
      QUOTE_NEEDS_POOL,
      QUOTES_EMPTY,
      QUOTES_EMPTY_SEARCH,
    }),
    [[]],
  ),
  isQuoteJob: rule(
    (status: string) => isQuoteJob({ status }),
    [...JOB_STATUSES, "bogus", ""].map((s) => [s] as [string]),
  ),
  quoteSegment: rule(
    (status: QuoteStatus) => quoteSegment(status),
    STATUSES.map((s) => [s] as [QuoteStatus]),
  ),
  quoteWaitingForPool: rule(
    (status: QuoteStatus, jobStatus: string) => quoteWaitingForPool({ status, jobStatus }),
    STATUSES.flatMap((s) =>
      ["quote", "unscheduled", "scheduled"].map((j) => [s, j] as [QuoteStatus, string]),
    ),
  ),
  filterQuotes: rule(
    (quotes: QuoteListItem[], segment: string | null, q: string | null) =>
      filterQuotes(quotes, { segment: segment ?? undefined, q: q ?? undefined }).map(
        (x) => x.number,
      ),
    [
      [list, null, null],
      [list, "draft", null],
      [list, "sent", ""],
      [list, "accepted", null],
      [list, "declined", null],
      [list, "bogus", null],
      [list, "sent", "diaz"],
      [list, "sent", "  DIAZ  "],
      [list, "sent", "#1003"],
      [list, "sent", "1050"],
      [list, "sent", "105"],
      [list, "declined", "ana"],
      [list, "accepted", "1060"],
      [list, "draft", "#"],
      [list, "draft", "jane"],
      [list, "sent", "nobody"],
      [[], null, null],
    ],
  ),
  quoteSegmentCounts: rule((quotes: QuoteListItem[]) => quoteSegmentCounts(quotes), [[list], [[]]]),
  quoteTitle: rule((n: number | null) => quoteTitle(n), [[1043], [null], [0], [1038]]),
  quoteRowDetail: rule(
    (number: number | null, total: number) => quoteRowDetail({ number, total_cents: total }),
    [
      [1043, 125000],
      [null, 0],
      [1038, 123456789],
      [7, 5],
    ],
  ),
  validateNewQuote: rule(
    (input: NewQuoteInput) => validateNewQuote(input),
    inputs.map((i) => [i] as [NewQuoteInput]),
  ),
  newQuoteRecords: rule(
    (input: NewQuoteInput, assigned: string | null) => newQuoteRecords(input, assigned),
    inputs.flatMap((i) => [
      [i, null] as [NewQuoteInput, string | null],
      [i, "u1"] as [NewQuoteInput, string | null],
    ]),
  ),
};
