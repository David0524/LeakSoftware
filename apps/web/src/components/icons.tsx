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

/** Directions: the arrow (location.fill), as Today's card draws it. */
export const DirectionsIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M3 11l18-8-8 18-2-8z" />
  </Icon>
);

export const PinIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" />
    <circle cx="12" cy="10" r="2.2" />
  </Icon>
);

/** A car seen from the front: On My Way. */
export const CarIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 16V11.5L7 6.5a1.5 1.5 0 0 1 1.4-1h7.2a1.5 1.5 0 0 1 1.4 1l2 5V16" />
    <path d="M3.5 11.5h17v4.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
    <path d="M6 20v-3M18 20v-3M7.5 14h1.5M15 14h1.5" />
  </Icon>
);

/**
 * A small solid car for the drive chip (docs/design/2026-10-21-schedule-tile.md): filled, so it
 * reads at 12 pt. The Android app's ui/DriveChip.tsx draws the same path.
 */
export const CarFillIcon = ({ className = "size-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M7.3 4.5h9.4c.8 0 1.5.5 1.8 1.2L20.4 10c.4.3.6.8.6 1.3V17a1 1 0 0 1-1 1h-1v1.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18H8.5v1.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V18H4a1 1 0 0 1-1-1v-5.7c0-.5.2-1 .6-1.3l1.9-4.3c.3-.7 1-1.2 1.8-1.2zM7.6 6.6 6.2 9.8h11.6l-1.4-3.2zM5.5 12.5v2.2h3v-2.2zM15.5 12.5v2.2h3v-2.2z"
    />
  </svg>
);

/** A small solid house: the drive home on a schedule block's last line. */
export const HouseFillIcon = ({ className = "size-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d={HOUSE_FILL} />
  </svg>
);
export const HOUSE_FILL =
  "M11.3 3.3a1 1 0 0 1 1.4 0l8 7.2a.8.8 0 0 1-.5 1.4H19v7.6a1 1 0 0 1-1 1h-3.5v-5.5h-5v5.5H6a1 1 0 0 1-1-1v-7.6H3.8a.8.8 0 0 1-.5-1.4z";

/** A check mark: done. */
export const CheckIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const NoteIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M15 20v-5h5M8 9h8M8 13h5" />
  </Icon>
);

export const WarningIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4.5M12 17v.01" />
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

/** A key: how to get in (a pool's access notes). */
export const KeyIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8-8M16 7l2 2M14 9l2 2" />
  </Icon>
);

/** A padlock: a job locked to its day, its time, or both (owner, 2026-10-20). */
export const LockIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

/** A calendar with a small padlock: a job locked to its day. */
export const DayLockIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M13 20H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v6" />
    <path d="M4 9.5h15M8.5 3v4M14.5 3v4" />
    <rect x="14.5" y="17" width="7" height="5" rx="1.2" />
    <path d="M16 17v-1.5a2 2 0 0 1 4 0V17" />
  </Icon>
);

/** A clock with a small padlock: a job locked to its time. */
export const TimeLockIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12.5 20.5a8.5 8.5 0 1 1 8-11.5" />
    <path d="M12 7.5V12l2.5 1.5" />
    <rect x="14.5" y="17" width="7" height="5" rx="1.2" />
    <path d="M16 17v-1.5a2 2 0 0 1 4 0V17" />
  </Icon>
);

/** Two corner arrows pointing out: open a bigger view (Enlarge a day map). */
export const ExpandIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </Icon>
);

/** A cartridge filter: a tall canister with pleats (owner, 2026-10-19: filter cleanings). */
export const FilterIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="6" y="3" width="12" height="18" rx="3" />
    <path d="M10 7v10M14 7v10" />
  </Icon>
);

/** A new cartridge: the filter with an arrow going in (replacing the filter). */
export const NewFilterIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="9" y="6" width="10" height="15" rx="2.5" />
    <path d="M12.5 10v7M15.5 10v7M3 4h6M6 1v6" />
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
  kind: "filter" | "filter_replace" | "salt_cell" | "other";
  className?: string;
}) {
  return kind === "filter" ? (
    <FilterIcon className={className} />
  ) : kind === "filter_replace" ? (
    <NewFilterIcon className={className} />
  ) : kind === "salt_cell" ? (
    <SaltCellIcon className={className} />
  ) : (
    <RepeatIcon className={className} />
  );
}

/** Show a password (eye). */
export const EyeIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

/** Hide a password (eye.slash). */
export const EyeSlashIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M9.9 5.8A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.3A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" />
  </Icon>
);
