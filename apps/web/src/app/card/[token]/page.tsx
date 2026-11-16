import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { autopayConsent, cardFeeBps, textOnBrand } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { ContactLine } from "@/components/contact-line";
import { Banner, DOC_PAGE } from "@/components/doc-ui";
import { SaveCardForm } from "@/components/save-card";
import { adminClient } from "@/server/admin";
import { paymentsConfigured } from "@/server/stripe";

export const metadata: Metadata = { title: "Automatic Payments", robots: { index: false } };

interface CardRequest {
  customer_name: string;
  company: {
    name: string;
    phone: string | null;
    email: string | null;
    logo_path: string | null;
    brand_primary: string;
    settings: unknown;
  };
  charges_enabled: boolean;
  saved: string | null;
  autopay: boolean;
}

/**
 * Request Card on File (docs/design/2026-11-16-autopay.md): the customer saves a card or bank
 * account with the shop for automatic payments, without paying anything now. No sign-in, only
 * the link the office sent (30 days).
 */
export default async function SaveCardPage({ params, searchParams }: PageProps<"/card/[token]">) {
  const { token } = await params;
  const { saved: justSaved } = await searchParams;
  const db = adminClient();
  if (!db) notFound();
  const { data } = await db.rpc("card_request_details", { link_token: token });
  const r = data as CardRequest | null;
  if (!r) notFound();
  const c = r.company;
  const logo = c.logo_path
    ? (await db.storage.from("company-assets").createSignedUrl(c.logo_path, 3600)).data
    : null;
  const onBrand = textOnBrand(c.brand_primary, tokens.color.brand.navy, tokens.color.brand.paper);
  const first = r.customer_name.split(" ")[0] || r.customer_name;

  return (
    <main className={DOC_PAGE}>
      <article className="mx-auto max-w-xl p-4 sm:p-8">
        <header
          className="-mx-4 flex flex-wrap items-center gap-3 px-5 py-5 max-sm:-mt-4 sm:mx-0 sm:rounded-lg"
          style={{ backgroundColor: c.brand_primary, color: onBrand }}
        >
          {logo?.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={logo.signedUrl}
              alt={`${c.name} logo`}
              className="max-h-14 max-w-40 rounded bg-paper p-1"
            />
          ) : null}
          <div className="min-w-0">
            <p className="font-display text-2xl font-extrabold">{c.name}</p>
            <p className="text-[0.9375rem]">
              <ContactLine phone={c.phone} email={c.email} />
            </p>
          </div>
        </header>

        <section className="mt-6 space-y-4 rounded-2xl bg-surface p-5 sm:bg-bg">
          <h1 className="font-display text-2xl font-bold">Automatic Payments</h1>
          {justSaved ? (
            <Banner tone="success">
              Saved. Your invoices from {c.name} will be paid automatically, and you’ll get a
              receipt each time. You can close this page.
            </Banner>
          ) : r.saved && r.autopay ? (
            <p>
              Your invoices from {c.name} are paid automatically with {r.saved}. To use a different
              card or bank account, save it below.
            </p>
          ) : (
            <p>
              Hi {first}, {c.name} asks you to save a card or bank account. Your invoices are then
              paid the day they’re sent, and you get a receipt each time. Nothing is charged now.
            </p>
          )}
          {justSaved ? null : !paymentsConfigured() || !r.charges_enabled ? (
            <Banner tone="warning">
              {c.name} can’t take online payments yet. Please contact them.
            </Banner>
          ) : (
            <>
              <SaveCardForm token={token} />
              <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">
                {autopayConsent(c.name, cardFeeBps(c.settings))} Saved securely by Stripe; {c.name}{" "}
                never sees your full card or account number.
              </p>
            </>
          )}
        </section>
        <footer className="mt-10 px-4 text-[0.9375rem] text-text-muted sm:px-0">
          Powered by Sundeck Pro
        </footer>
      </article>
    </main>
  );
}
