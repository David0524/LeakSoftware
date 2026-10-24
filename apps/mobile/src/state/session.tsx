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
import { heardFromOther, parseHeardFrom, type Company, type Membership } from "@leakbook/core";
import { endLiveStop } from "../lib/liveStop";
import {
  endSignIn,
  forgetSignIn,
  rememberSignIn,
  signedInUser,
  signedOutUser,
  type SignedInUser,
} from "../lib/signedOut";
import { unregisterPush } from "../lib/push";
import { getServices, type Services } from "../lib/services";
import { useRows, useSyncStatus } from "../data/hooks";

export type { SignedInUser };

interface SessionValue {
  services: Services;
  /** Remembered on the device; an expired token offline does not sign the tech out. */
  user: SignedInUser | null;
  /**
   * The account the server signed out on this phone (owner, 2026-10-22), while its work and
   * unsent changes wait here for it to sign in again. Sign In says so and fills in its email.
   */
  signedOut: SignedInUser | null;
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
  /** `heardFrom`: "How did you hear about us?" (an option key), kept with the account. */
  signUp(
    fullName: string,
    email: string,
    password: string,
    heardFrom?: string | null,
    heardFromOtherText?: string,
  ): Promise<{ error?: string; confirmEmail?: boolean }>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => getServices(), []);
  const { supabase, sync, kv } = services;
  const [user, setUser] = useState<SignedInUser | null>(() => signedInUser(kv));
  const [signedOut, setSignedOut] = useState<SignedInUser | null>(() => signedOutUser(kv));
  const [activeId, setActiveId] = useState<string | null>(() => kv.get("active_company"));
  const [needsCode, setNeedsCode] = useState(false);

  const remember = useCallback(
    (u: SignedInUser) => {
      // A different account on this device must never see the previous account's data, nor
      // send its unsent changes (including one the server signed out).
      rememberSignIn(kv, sync, u);
      setSignedOut(null);
      setUser(u);
      sync.start();
    },
    [kv, sync],
  );

  /**
   * The server refused this phone's sign-in and a refresh didn't help (owner, 2026-10-22):
   * end the session on this phone only and show Sign In, keeping the phone's data and unsent
   * changes for the same account.
   */
  const sessionEnded = useCallback(() => {
    const ended = endSignIn(kv, sync);
    if (!ended) return;
    setSignedOut(ended);
    setUser(null);
    setNeedsCode(false);
    // After this turn: it may run inside onAuthStateChange, where auth calls must not wait.
    setTimeout(() => void supabase.auth.signOut({ scope: "local" }).catch(() => undefined), 0);
  }, [kv, sync, supabase]);

  useEffect(() => {
    if (user) sync.start();
    // The sync service reports a sign-in the server ended (lib/sync-service.ts).
    const service = getServices().sync;
    service.onSessionEnded = sessionEnded;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // supabase-js dropped a session whose refresh the server refused.
      if (event === "SIGNED_OUT") {
        sessionEnded();
        return;
      }
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
      service.onSessionEnded = null;
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
    signedOut,
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
    signUp: async (fullName, email, password, heardFrom, heardFromOtherText) => {
      const heard = parseHeardFrom(heardFrom);
      const other = heardFromOther(heard, heardFromOtherText);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            ...(heard ? { heard_from: heard } : {}),
            ...(other ? { heard_from_other: other } : {}),
          },
        },
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
      forgetSignIn(kv);
      setUser(null);
      setSignedOut(null);
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
