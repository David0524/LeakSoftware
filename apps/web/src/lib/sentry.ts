import type { init } from "@sentry/nextjs";

type Options = NonNullable<Parameters<typeof init>[0]>;

// Shared Sentry settings (M11): errors only, and nothing about customers or users. Reports,
// addresses, and phone numbers live in request bodies, headers, cookies, and query strings,
// so none of those are collected.
export const SENTRY_PRIVACY: {
  dataCollection: NonNullable<Options["dataCollection"]>;
  tracesSampleRate: number;
} = {
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
  },
  tracesSampleRate: 0,
};
