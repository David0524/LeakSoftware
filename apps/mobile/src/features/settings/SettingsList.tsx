import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { isManagerRole } from "@leakbook/core";
import { useCompany, useSession } from "../../state/session";
import { Button, HeaderButton, Notice, Screen } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { ModalSheet, SheetDivider } from "../../ui/ModalSheet";
import { space } from "../../ui/theme";

// Settings pages that hold a list of rows (spec 5.12; the website's settings-list.tsx): each
// row opens its edit form in a sheet, "+" in the bar opens the same form to add one, and the
// page says what the last sheet did ("Saved.", "Removed.").

/** Techs who reach Settings see who to ask instead (the website's notice). */
export function ManagersOnly({ title, children }: { title: string; children: ReactNode }) {
  const company = useCompany();
  const { membership } = useSession();
  if (isManagerRole(membership?.role)) return <>{children}</>;
  return (
    <Screen title={title}>
      <Notice tone="warning">
        {`Settings are for owners and admins. Ask one at ${company.name} if something needs to change.`}
      </Notice>
    </Screen>
  );
}

export function useEditSheet<T>() {
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return {
    editing,
    notice,
    open(row: T | "new") {
      setNotice(null);
      setEditing(row);
    },
    close: () => setEditing(null),
    done(message: string) {
      setEditing(null);
      setNotice(message);
    },
  };
}

export function SettingsList({
  title,
  subtitle,
  addLabel,
  onAdd,
  notice,
  children,
}: {
  title: string;
  subtitle?: string;
  /** The "+" button's name (also the add sheet's title). */
  addLabel?: string;
  onAdd?: () => void;
  notice?: string | null;
  children: ReactNode;
}) {
  return (
    <Screen
      title={title}
      subtitle={subtitle}
      headerRight={
        addLabel && onAdd
          ? () => <HeaderButton title={addLabel} icon="add" onPress={onAdd} />
          : undefined
      }
    >
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {children}
    </Screen>
  );
}

/** A sheet holding one row's form. */
export function EditSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ModalSheet visible={open} onClose={onClose} title={title}>
      {open ? children : null}
    </ModalSheet>
  );
}

/** A form's Save button, then (editing) a line and the Remove button, which asks first. */
export function FormActions({
  submit,
  onSubmit,
  remove,
}: {
  submit: string;
  onSubmit: () => void;
  remove?: { label: string; confirm: string; onConfirm: () => void };
}) {
  return (
    <View style={{ gap: space["3"] }}>
      <Button title={submit} wide onPress={onSubmit} />
      {remove ? (
        <>
          <SheetDivider />
          <Button
            title={remove.label}
            kind="danger"
            wide
            onPress={() =>
              confirmDestructive({
                title: remove.confirm,
                confirm: remove.label,
                onConfirm: remove.onConfirm,
              })
            }
          />
        </>
      ) : null}
    </View>
  );
}

/** "Only the shop owner can do this." for admins, as on the website. */
export function OwnerOnly() {
  return <Notice>Only the shop owner can do this.</Notice>;
}
