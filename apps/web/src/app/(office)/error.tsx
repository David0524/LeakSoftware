"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function OfficeError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorScreen {...props} />;
}
