"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function RootError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex-1 px-4">
      <ErrorScreen {...props} home="/" />
    </main>
  );
}
