import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import type { Company, Membership } from "@leakbook/core";
import { endLiveStop } from "../lib/liveStop";
import { unregisterPush } from "../lib/push";
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
  /**
   * Two-step sign-in (owner, 2026-10-16): the account has an authenticator code and this
   * session hasn't passed it. Shop data stays closed (the database refuses it), so the app
   * shows the code screen and doesn't sync until the code is in.
   */
  needsCode: boolean;
  verifyCode(code: string): Promise<string | null>;
  cancelCode(): Promise<void>;
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
  const [needsCode, setNeedsCode] = useState(false);

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
      if (!session?.user) return;
      // A session still waiting on its code isn't let in yet (two-step sign-in).
      if (waitingOnCode(session)) {
        sync.stop();
        setNeedsCode(true);
        return;
      }
      remember({ id: session.user.id, email: session.user.email ?? "" });
    });
    // Two-step turned on elsewhere (the website) while this phone was signed in: checked
    // when the app opens and comes back to the front, with the account's current factors.
    const check = async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: s } = await supabase.auth.getSession();
      if (u.user && s.session && waitingOnCode(s.session, u.user)) {
        sync.stop();
        setNeedsCode(true);
      }
    };
    void check();
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      data.subscription.unsubscribe();
      app.remove();
    };
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
    needsCode,
    verifyCode: async (code) => {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp.find((f) => f.status === "verified");
      if (!factor) return "This account has no authenticator set up. Sign in again.";
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: code.replace(/\s+/g, ""),
      });
      if (error || !data) return "That code didn't work. Try the newest one.";
      const { data: s } = await supabase.auth.getSession();
      setNeedsCode(false);
      if (s.session?.user) remember({ id: s.session.user.id, email: s.session.user.email ?? "" });
      return null;
    },
    cancelCode: async () => {
      setNeedsCode(false);
      await value.signOut();
    },
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
      if (waitingOnCode(data.session, data.user)) {
        setNeedsCode(true);
        return null;
      }
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
      // This phone stops getting the person's notifications, and the current stop's goes.
      await unregisterPush().catch(() => undefined);
      await endLiveStop().catch(() => undefined);
      sync.clearLocalData();
      kv.remove(USER_KEY);
      setUser(null);
      setActiveId(null);
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Whether a session must still pass the account's authenticator code (aal1 with a factor). */
function waitingOnCode(session: Session, user: User = session.user): boolean {
  const verified = (user.factors ?? []).some((f) => f.status === "verified");
  return verified && accessLevel(session.access_token) !== "aal2";
}

function accessLevel(token: string): string | null {
  try {
    const part = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(part)) as { aal?: string }).aal ?? null;
  } catch {
    return null;
  }
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
