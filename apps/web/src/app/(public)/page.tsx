import { Landing } from "@/components/landing/landing";

// The public home page: what Tidemark does, shown with small working demos of the app, and
// the packages' prices (owner, 2026-10-15). Pool Maintenance shows first; Leak Detection is
// one switch away, and each shows only what applies to it.

export default function Home() {
  return (
    <main>
      <Landing />
    </main>
  );
}
