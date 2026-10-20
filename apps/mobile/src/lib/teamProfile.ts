// A person's profile (owner, 2026-10-20: Settings › Team › Profiles): name, phone, email,
// address, emergency contact and notes, kept by owners and admins. Checked as the website's
// saveTeamProfile (apps/web/src/app/actions/settings.ts).

export interface TeamProfileForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  emergency_name: string;
  emergency_phone: string;
  notes: string;
}

export interface TeamProfileValues {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  notes: string | null;
}

/** The row's values, or the message for each field that needs fixing. */
export function teamProfileValues(
  form: TeamProfileForm,
): { values: TeamProfileValues } | { fields: Partial<Record<keyof TeamProfileForm, string>> } {
  const t = (k: keyof TeamProfileForm) => form[k].trim();
  const name = t("name");
  if (!name) return { fields: { name: "Enter a name." } };
  const email = t("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { fields: { email: "Enter an email like name@example.com." } };
  return {
    values: {
      name,
      phone: t("phone") || null,
      email: email || null,
      address: t("address") || null,
      emergency_name: t("emergency_name") || null,
      emergency_phone: t("emergency_phone") || null,
      notes: t("notes") || null,
    },
  };
}
