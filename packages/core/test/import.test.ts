import { describe, expect, it } from "vitest";
import {
  buildImport,
  customerKeys,
  firstVisitOn,
  guessMapping,
  parseAddress,
  parseCsv,
  parseFrequency,
  parseGallons,
  parseWeekday,
} from "../src";

describe("parseCsv", () => {
  it("reads quotes, commas and line breaks in cells, CRLF, a BOM, and blank lines", () => {
    const csv = '﻿Name,Notes\r\n"Rivera, Ana","Gate ""4512""\nside door"\r\n\r\nBo,\r\n';
    expect(parseCsv(csv)).toEqual([
      ["Name", "Notes"],
      ["Rivera, Ana", 'Gate "4512"\nside door'],
      ["Bo", ""],
    ]);
  });

  it("finds semicolon and tab separators", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("guessMapping", () => {
  it("matches common export headers", () => {
    expect(
      guessMapping([
        "Customer Name",
        "Email Address",
        "Mobile Phone",
        "Service Address",
        "City",
        "State",
        "Zip",
        "Gallons",
        "Service Day",
        "Frequency",
        "Rate",
        "Technician",
        "Gate Code",
        "Last Service Date",
      ]),
    ).toEqual([
      "name",
      "email",
      "phone",
      "address_line1",
      "city",
      "state",
      "postal_code",
      "gallons",
      "visit_day",
      "frequency",
      "price",
      "tech",
      "access_notes",
      "skip",
    ]);
  });

  it("uses each field once and splits first and last names", () => {
    expect(guessMapping(["First Name", "Last Name", "Phone", "Phone 2"])).toEqual([
      "first_name",
      "last_name",
      "phone",
      "skip",
    ]);
  });
});

describe("values", () => {
  it("reads days, how often, and gallons the ways people write them", () => {
    expect(parseWeekday("Mon")).toEqual({ day: 1, several: false });
    expect(parseWeekday("thursday")).toEqual({ day: 4, several: false });
    expect(parseWeekday("Tue/Fri")).toEqual({ day: 2, several: true });
    expect(parseWeekday("someday")).toBeNull();
    expect(parseFrequency("Weekly")).toBe(1);
    expect(parseFrequency("Bi-Weekly")).toBe(2);
    expect(parseFrequency("every other week")).toBe(2);
    expect(parseFrequency("Monthly")).toBe(4);
    expect(parseFrequency("sometimes")).toBeNull();
    expect(parseGallons("20,000")).toBe(20_000);
    expect(parseGallons("18k")).toBe(18_000);
    expect(parseGallons("big")).toBeNull();
  });

  it("splits a full address", () => {
    expect(parseAddress("123 Main St, Apt 4, Mesa, AZ 85201")).toEqual({
      address_line1: "123 Main St",
      address_line2: "Apt 4",
      city: "Mesa",
      state: "AZ",
      postal_code: "85201",
    });
    expect(parseAddress("9 Elm Rd, Mesa AZ 85201")).toMatchObject({
      address_line1: "9 Elm Rd",
      city: "Mesa",
      state: "AZ",
      postal_code: "85201",
    });
  });

  it("finds the first visit on the service day", () => {
    // 2026-10-16 is a Friday.
    expect(firstVisitOn(5, "2026-10-16")).toBe("2026-10-16");
    expect(firstVisitOn(1, "2026-10-16")).toBe("2026-10-19");
  });
});

describe("buildImport", () => {
  const team = [
    { id: "t1", name: "Jake Turner", email: "jake@shop.test" },
    { id: "t2", name: "Priya Shah", email: null },
  ];
  const mapping = guessMapping([
    "Name",
    "Email",
    "Phone",
    "Address",
    "Gallons",
    "Service Day",
    "Frequency",
    "Monthly Rate",
    "Tech",
  ]);

  it("makes customers, pools, and plans, and says what it changed", () => {
    const { records, problems } = buildImport(
      [
        [
          "Ana Rivera",
          "ANA@x.test",
          "(480) 555-0101",
          "1 Palm Ln, Mesa, AZ 85201",
          "18,000",
          "Tue",
          "Weekly",
          "$173.33",
          "jake",
        ],
        ["Bo Lee", "not-an-email", "", "", "", "", "", "", ""],
        ["", "", "", "", "", "", "", "", ""],
        [
          "Cy Park",
          "",
          "602-555-0102",
          "2 Oak St, Tempe, AZ 85281",
          "",
          "Mon/Thu",
          "every other week",
          "",
          "Sam",
        ],
      ],
      mapping,
      { services: "pool", team },
    );
    expect(problems).toEqual([{ row: 3, message: "No name, so it was skipped." }]);
    expect(records).toHaveLength(3);
    const [ana, bo, cy] = records;
    expect(ana!.customer).toMatchObject({
      name: "Ana Rivera",
      email: "ana@x.test",
      phone: "+14805550101",
    });
    expect(ana!.property).toMatchObject({
      address_line1: "1 Palm Ln",
      city: "Mesa",
      approx_gallons: 18_000,
    });
    // $173.33 a month, weekly: 173.33 × 12 ÷ 52 = $40 a visit.
    expect(ana!.plan).toEqual({ weekday: 2, interval_weeks: 1, price_cents: 4000, tech_id: "t1" });
    expect(bo!.property).toBeNull();
    expect(bo!.warnings).toHaveLength(2);
    expect(cy!.plan).toMatchObject({ weekday: 1, interval_weeks: 2, tech_id: null });
    expect(cy!.warnings.join(" ")).toContain("first is used");
    expect(cy!.warnings.join(" ")).toContain("isn’t on the team");
  });

  it("makes no plans for a leak detection shop", () => {
    const { records } = buildImport(
      [["Ana", "", "", "1 Palm Ln", "", "Tue", "", "", ""]],
      mapping,
      { services: "leak", team },
    );
    expect(records[0]!.plan).toBeNull();
  });

  it("recognizes a customer by email, phone, or name and address", () => {
    expect(
      customerKeys({
        name: "Ana Rivera",
        email: "Ana@X.test",
        phone: "+14805550101",
        address: "1 Palm Ln",
      }),
    ).toEqual(["e:ana@x.test", "p:4805550101", "a:anarivera|1palmln"]);
  });
});
