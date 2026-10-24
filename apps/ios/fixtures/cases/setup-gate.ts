import {
  FINISH_SETUP_BODY,
  FINISH_SETUP_FAILED,
  FINISH_SETUP_OFFLINE,
  FINISH_SETUP_STILL,
  FINISH_SETUP_TITLE,
  mustFinishSetup,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

type Access = { onboarded?: boolean | null; plan?: string | null } | null;

// setup-gate.ts: a new shop's owner finishes setup (the card) before working (owner, 2026-10-24).
export const setupGate: ModuleCases = {
  mustFinishSetup: rule(
    (access: Access, role: string | null) =>
      mustFinishSetup(access as Parameters<typeof mustFinishSetup>[0], role),
    [
      [{ onboarded: false, plan: "standard" }, "owner"],
      [{ onboarded: false, plan: null }, "owner"],
      [{ onboarded: false, plan: "standard" }, "admin"],
      [{ onboarded: false, plan: "standard" }, "tech"],
      [{ onboarded: false, plan: "standard" }, null],
      [{ onboarded: true, plan: "standard" }, "owner"],
      [{ onboarded: false, plan: "demo" }, "owner"],
      [{ plan: "standard" }, "owner"],
      [{ onboarded: null, plan: "standard" }, "owner"],
      [null, "owner"],
    ],
  ),
  FINISH_SETUP_TITLE: rule(() => FINISH_SETUP_TITLE, [[]]),
  FINISH_SETUP_BODY: rule(() => FINISH_SETUP_BODY, [[]]),
  FINISH_SETUP_STILL: rule(() => FINISH_SETUP_STILL, [[]]),
  FINISH_SETUP_OFFLINE: rule(() => FINISH_SETUP_OFFLINE, [[]]),
  FINISH_SETUP_FAILED: rule(() => FINISH_SETUP_FAILED, [[]]),
};
