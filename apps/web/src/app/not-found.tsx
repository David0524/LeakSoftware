import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** A link that leads nowhere: a deleted job, a mistyped address, or a turned-off report link. */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg flex-1 px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-extrabold">Page not found</h1>
      <p className="mt-3 text-text-muted">
        This page doesn’t exist or isn’t available anymore. If someone sent you a link, ask them for
        a new one.
      </p>
      <Link href="/" className={buttonClass("secondary", "mt-6")}>
        Go to Tidemark
      </Link>
    </main>
  );
}
