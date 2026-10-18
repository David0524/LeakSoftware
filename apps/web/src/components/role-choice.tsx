"use client";

import { useState } from "react";
import { ROLE_LABELS, type Role } from "@leakbook/core";
import { Segmented } from "./segmented";

const ABOUT: Record<Role, string> = {
  owner: "Everything, including Sundeck Pro billing, payments setup, and who has which role.",
  admin: "Office staff: schedule, customers, jobs, quotes, invoices, and settings.",
  tech: "Runs jobs on the phone.",
};

/**
 * Settings › Team: the role as a segmented control (Owner | Admin | Tech), with what it allows
 * under it. Only owners get the choice; others see the role and post it unchanged.
 */
export function RoleChoice({ roles, initial, id }: { roles: Role[]; initial: Role; id: string }) {
  const [role, setRole] = useState<Role>(initial);
  if (roles.length < 2)
    return (
      <div className="space-y-1">
        <input type="hidden" name="role" value={initial} />
        <p className="font-medium">Role: {ROLE_LABELS[initial]}</p>
        <p className="text-[0.9375rem] text-text-muted">{ABOUT[initial]}</p>
      </div>
    );
  return (
    <div className="space-y-1">
      <Segmented
        label="Role"
        name="role"
        value={role}
        onChange={setRole}
        options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
      />
      <p id={`${id}-about`} className="text-[0.9375rem] text-text-muted">
        {ABOUT[role]}
      </p>
    </div>
  );
}
