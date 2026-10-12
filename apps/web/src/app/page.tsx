import Image from "next/image";

// Placeholder home page. The real public home page and sign-in arrive in milestone M6.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <Image src="/leakbook-logo.svg" alt="LeakBook" width={360} height={102} priority />
      <p className="max-w-md text-center text-text-muted">
        Inspection reports, repair quotes, and invoicing for pool leak detection shops.
      </p>
    </main>
  );
}
