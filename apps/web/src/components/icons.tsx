import type { ReactNode } from "react";

// Line icons in one style (1.8 stroke, round caps) to sit with 17 pt text.

function Icon({ children, className = "size-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PhoneIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />
  </Icon>
);

export const MessageIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />
  </Icon>
);

export const MailIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
);

export const CameraIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

export const VoicemailIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="6.5" cy="12" r="3.5" />
    <circle cx="17.5" cy="12" r="3.5" />
    <path d="M6.5 15.5h11" />
  </Icon>
);

/** A cartridge filter: a tall canister with pleats (owner, 2026-10-19: filter cleanings). */
export const FilterIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="6" y="3" width="12" height="18" rx="3" />
    <path d="M10 7v10M14 7v10" />
  </Icon>
);

/** A salt cell: a tube with plates inside and a spark (salt cell cleanings). */
export const SaltCellIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="2.5" y="8" width="19" height="8" rx="4" />
    <path d="m13 9.5-2.5 3h3L11 15" />
  </Icon>
);

/** Two arrows in a circle: a cleaning on a schedule that isn't the filter or salt cell. */
export const RepeatIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5" />
    <path d="M5 3v4h4M19 21v-4h-4" />
  </Icon>
);

/** The icon for a scheduled cleaning: filter, salt cell, or any other. */
export function CleaningIcon({
  kind,
  className,
}: {
  kind: "filter" | "salt_cell" | "other";
  className?: string;
}) {
  return kind === "filter" ? (
    <FilterIcon className={className} />
  ) : kind === "salt_cell" ? (
    <SaltCellIcon className={className} />
  ) : (
    <RepeatIcon className={className} />
  );
}
