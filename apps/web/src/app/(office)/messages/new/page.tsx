import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toE164 } from "@leakbook/core";
import { LineNotice } from "@/components/inbox";
import { Composer } from "@/components/messages";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCustomer } from "@/lib/data";
import { getLine, listConversations } from "@/lib/messages";

export const metadata: Metadata = { title: "New Message · Sundeck Pro" };

/** Text someone from the company number: a customer (?customer=) or any mobile number. */
export default async function NewMessagePage({ searchParams }: PageProps<"/messages/new">) {
  const office = await getOffice();
  const { customer: customerParam, job } = await searchParams;
  const customerId = typeof customerParam === "string" ? customerParam : undefined;
  const [line, data, conversations] = await Promise.all([
    getLine(office),
    customerId ? getCustomer(office, customerId) : null,
    listConversations(office),
  ]);
  const customer = data?.customer ?? null;
  // Already talking with them: open that conversation instead.
  const phone = toE164(customer?.phone);
  const existing = phone ? conversations.find((c) => c.phone === phone) : undefined;
  if (existing) redirect(`/messages/${existing.id}`);

  return (
    <>
      <PageHeader
        title="New Message"
        back={{ href: "/messages", label: "Messages" }}
        subtitle={
          customer ? `To ${customer.name}${customer.phone ? `, ${customer.phone}` : ""}` : undefined
        }
      />
      <div className="max-w-2xl space-y-4">
        {line?.status === "active" ? (
          <Composer
            customerId={customer?.id}
            askPhone={!customer}
            pictures={line.pictures}
            jobId={typeof job === "string" ? job : undefined}
          />
        ) : (
          <LineNotice line={line} isOwner={office.isOwner} />
        )}
      </div>
    </>
  );
}
