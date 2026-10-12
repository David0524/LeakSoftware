import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Company, Membership } from "@leakbook/core";
import { getServices, type Services } from "../lib/services";
import { useRows, useSyncStatus } from "../data/hooks";

export interface SignedInUser {
  id: string;
  email: string;
}

interface SessionValue {
  services: Services;
  /** Remembered on the device; an expired token offline does not sign the tech out. */
  user: SignedInUser | null;
  companies: Company[];
  company: Company | null;
  membership: Membership | null;
  setActiveCompany(id: string): void;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(
    fullName: string,
    email: string,
    password: string,
  ): Promise<{ error?: string; confirmEmail?: boolean }>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const USER_KEY = "session:user";

export function SessionProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => getServices(), []);
  const { supabase, sync, kv } = services;
  const [user, setUser] = useState<SignedInUser | null>(() => {
    const raw = kv.get(USER_KEY);
    return raw ? (JSON.parse(raw) as SignedInUser) : null;
  });
  const [activeId, setActiveId] = useState<string | null>(() => kv.get("active_company"));

  const remember = useCallback(
    (u: SignedInUser) => {
      const previous = kv.get(USER_KEY);
      // A different account on this device must never see the previous account's data.
      if (previous && (JSON.parse(previous) as SignedInUser).id !== u.id) sync.clearLocalData();
      kv.set(USER_KEY, JSON.stringify(u));
      setUser(u);
      sync.start();
    },
    [kv, sync],
  );

  useEffect(() => {
    if (user) sync.start();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) remember({ id: session.user.id, email: session.user.email ?? "" });
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once
  }, []);

  const memberships = useRows<Membership>("membership").filter(
    (m) => m.user_id === user?.id && m.status === "active" && !m.deleted_at,
  );
  const allCompanies = useRows<Company>("company");
  const companies = allCompanies.filter((c) => memberships.some((m) => m.company_id === c.id));
  const company = companies.find((c) => c.id === activeId) ?? companies[0] ?? null;
  const membership = memberships.find((m) => m.company_id === company?.id) ?? null;

  const value: SessionValue = {
    services,
    user,
    companies,
    company,
    membership,
    setActiveCompany: (id) => {
      kv.set("active_company", id);
      setActiveId(id);
    },
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return friendlyAuthError(error.message);
      remember({ id: data.user.id, email: data.user.email ?? email.trim() });
      return null;
    },
    signUp: async (fullName, email, password) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) return { error: friendlyAuthError(error.message) };
      if (!data.session) return { confirmEmail: true };
      remember({ id: data.session.user.id, email: data.session.user.email ?? email.trim() });
      return {};
    },
    signOut: async () => {
      sync.clearLocalData();
      kv.remove(USER_KEY);
      setUser(null);
      setActiveId(null);
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

/** The active company; screens under (app) can rely on it being set. */
export function useCompany(): Company {
  const { company } = useSession();
  if (!company) throw new Error("No active company");
  return company;
}

export { useSyncStatus };

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match.";
  if (/already registered|already exists/i.test(message))
    return "An account with this email already exists. Sign in instead.";
  if (/password/i.test(message) && /least|short|characters/i.test(message)) {
    return "Use a password of at least 10 characters.";
  }
  if (/network|fetch/i.test(message)) return "No connection. Connect to the internet to sign in.";
  return message;
}
