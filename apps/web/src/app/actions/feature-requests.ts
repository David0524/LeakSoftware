"use server";

import { getOffice } from "@/lib/auth";
import {
  FEATURE_REQUEST_EMPTY,
  FEATURE_REQUEST_THANKS,
  featureRequestText,
  recordFeatureRequest,
} from "@/server/feature-requests";
import type { FormState } from "./auth";

/** Request a Feature on the website (the apps post to /api/feature-requests). */
export async function requestFeature(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const request = featureRequestText(form.get("request"));
  if (!request) return { fields: { request: FEATURE_REQUEST_EMPTY } };
  const result = await recordFeatureRequest({
    user: office.user,
    company: office.company,
    request,
    page: String(form.get("page") ?? "") || null,
  });
  return result.ok ? { message: FEATURE_REQUEST_THANKS } : { error: result.error };
}
