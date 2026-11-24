import { describe, expect, it } from "vitest";
import {
  CARD_IMPORT_TEXT,
  cardHolderName,
  cardMatchLine,
  planCardImport,
  type CardHolder,
  type CardImportCustomer,
} from "./card-import";

const TODAY = "2026-11-24";

const visa = (id: string, exp_year = 2029) => ({
  id,
  kind: "card",
  brand: "visa",
  last4: "4242",
  exp_month: 6,
  exp_year,
});

const holder = (over: Partial<CardHolder> & { stripe_customer_id: string }): CardHolder => ({
  name: null,
  email: null,
  phone: null,
  method: visa(`pm_${over.stripe_customer_id}`),
  ...over,
});

const customer = (over: Partial<CardImportCustomer> & { id: string }): CardImportCustomer => ({
  name: "",
  company_name: null,
  email: null,
  phone: null,
  method_stripe_customer: null,
  ...over,
});

describe("planCardImport", () => {
  const customers = [
    customer({ id: "jane", name: "Jane Smith", email: "Jane@Example.com", phone: "+17025550100" }),
    customer({ id: "bob", name: "Bob Lee", phone: "(702) 555-0199" }),
    customer({ id: "hoa", name: "Ana Ruiz", company_name: "Desert Palms HOA" }),
    customer({ id: "sam1", name: "Sam Cole" }),
    customer({ id: "sam2", name: "Sam Cole" }),
  ];

  it("matches by email, then phone, then a person's or company's name", () => {
    const plan = planCardImport(
      [
        holder({ stripe_customer_id: "cus_a", email: " jane@example.COM ", name: "J. Smith" }),
        holder({ stripe_customer_id: "cus_b", phone: "702-555-0199" }),
        holder({ stripe_customer_id: "cus_c", name: "Desert Palms H.O.A." }),
      ],
      customers,
      TODAY,
    );
    expect(plan.ready.map((r) => [r.holder.stripe_customer_id, r.customer_id, r.reason])).toEqual([
      ["cus_b", "bob", "phone"],
      ["cus_c", "hoa", "name"],
      ["cus_a", "jane", "email"],
    ]);
    expect(plan.ready.every((r) => r.selected)).toBe(true);
    expect(plan.needsMatch).toEqual([]);
  });

  it("sends a name two customers share, and nobody's, to Needs a Match", () => {
    const plan = planCardImport(
      [
        holder({ stripe_customer_id: "cus_sam", name: "Sam Cole" }),
        holder({ stripe_customer_id: "cus_new", name: "Pat Nobody", email: "pat@example.com" }),
      ],
      customers,
      TODAY,
    );
    expect(plan.ready).toEqual([]);
    expect(plan.needsMatch.map((r) => [r.holder.stripe_customer_id, r.customer_id])).toEqual([
      ["cus_new", null],
      ["cus_sam", null],
    ]);
    expect(plan.needsMatch.every((r) => !r.selected)).toBe(true);
  });

  it("gives a customer one card: the stronger match wins, and a tie wins for nobody", () => {
    const stronger = planCardImport(
      [
        holder({ stripe_customer_id: "cus_name", name: "Jane Smith" }),
        holder({ stripe_customer_id: "cus_mail", email: "jane@example.com" }),
      ],
      customers,
      TODAY,
    );
    expect(stronger.ready.map((r) => r.holder.stripe_customer_id)).toEqual(["cus_mail"]);
    expect(stronger.needsMatch.map((r) => r.holder.stripe_customer_id)).toEqual(["cus_name"]);

    const tie = planCardImport(
      [
        holder({ stripe_customer_id: "cus_1", email: "jane@example.com" }),
        holder({ stripe_customer_id: "cus_2", email: "jane@example.com" }),
      ],
      customers,
      TODAY,
    );
    expect(tie.ready).toEqual([]);
    expect(tie.needsMatch).toHaveLength(2);
  });

  it("leaves out expired cards and customers with a card already until turned on", () => {
    const plan = planCardImport(
      [
        holder({ stripe_customer_id: "cus_old", email: "jane@example.com" }),
        holder({ stripe_customer_id: "cus_b", phone: "7025550199", method: visa("pm_b", 2024) }),
      ],
      [{ ...customers[0]!, method_stripe_customer: "cus_saved_here" }, customers[1]!],
      TODAY,
    );
    expect(plan.ready.map((r) => [r.customer_id, r.selected, r.note])).toEqual([
      ["bob", false, "Card expired"],
      ["jane", false, "Has a card on file already; importing replaces it"],
    ]);
  });

  it("counts customers already imported and those without a card, and lists neither", () => {
    const plan = planCardImport(
      [
        holder({ stripe_customer_id: "cus_done", email: "jane@example.com" }),
        holder({ stripe_customer_id: "cus_empty", email: "bob@example.com", method: null }),
      ],
      [{ ...customers[0]!, method_stripe_customer: "cus_done" }],
      TODAY,
    );
    expect(plan).toEqual({ ready: [], needsMatch: [], done: 1, withoutCard: 1 });
  });
});

describe("card import words", () => {
  it("reads naturally for one and for many", () => {
    expect(CARD_IMPORT_TEXT.importButton(1)).toBe("Turn On Autopay for 1 Customer");
    expect(CARD_IMPORT_TEXT.importButton(42)).toBe("Turn On Autopay for 42 Customers");
    expect(CARD_IMPORT_TEXT.result(3)).toBe("Autopay is on for 3 customers.");
  });

  it("says which card and how it matched", () => {
    const plan = planCardImport(
      [holder({ stripe_customer_id: "cus_a", email: "jane@example.com" })],
      [customer({ id: "jane", name: "Jane Smith", email: "jane@example.com" })],
      TODAY,
    );
    expect(cardMatchLine(plan.ready[0]!)).toBe("Visa •••• 4242 · matched by email");
    const bob = planCardImport(
      [holder({ stripe_customer_id: "cus_b", name: "Robert Lee", phone: "7025550199" })],
      [customer({ id: "bob", name: "Bob Lee", phone: "702-555-0199" })],
      TODAY,
    ).ready[0]!;
    expect(cardMatchLine(bob, "Bob Lee")).toBe(
      "Visa •••• 4242 · “Robert Lee” in Stripe · matched by phone",
    );
    expect(cardMatchLine(bob, "robert lee")).toBe("Visa •••• 4242 · matched by phone");
    expect(cardHolderName(holder({ stripe_customer_id: "x", email: "a@b.co" }))).toBe("a@b.co");
  });
});
