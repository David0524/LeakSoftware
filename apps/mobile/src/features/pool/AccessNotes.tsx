import { useState } from "react";
import { View } from "react-native";
import type { Property } from "@leakbook/core";
import { getServices } from "../../lib/services";
import { Button, Field, ListRow, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { DraftNote } from "../../ui/DraftNote";
import { ModalSheet, useUnsavedChanges } from "../../ui/ModalSheet";
import { useDraft } from "../../ui/useDraft";
import { space } from "../../ui/theme";

/**
 * The pool's access notes, right under its address on the job page (owner, 2026-10-20: "You
 * should be able to edit access notes on the job screen underneath the address"), as the
 * website's job page: the notes, or "Add Access Notes" in the tint when there are none. A tap
 * opens the Access Notes sheet; Save writes the pool's access_notes through the sync layer.
 */
export function AccessNotesRow({ property }: { property: Property }) {
  const [open, setOpen] = useState(false);
  // Each opening starts the field from what's saved.
  const [opening, setOpening] = useState(0);
  const show = () => {
    setOpening((n) => n + 1);
    setOpen(true);
  };
  const notes = property.access_notes?.trim() ?? "";
  return (
    <>
      {notes ? (
        <ListRow
          accessibilityLabel={`Access Notes: ${notes}`}
          accessibilityHint="Edits the access notes"
          onPress={show}
        >
          <T variant="secondary" muted>
            Access Notes
          </T>
          <T>{notes}</T>
        </ListRow>
      ) : (
        <ListRow title="Add Access Notes" tone="link" onPress={show} />
      )}
      <AccessNotesSheet
        open={open}
        opening={opening}
        property={property}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function AccessNotesSheet({
  open,
  opening,
  property,
  onClose,
}: {
  open: boolean;
  opening: number;
  property: Property;
  onClose: () => void;
}) {
  return (
    <ModalSheet visible={open} onClose={onClose} title="Access Notes">
      <AccessNotesForm key={opening} property={property} onDone={onClose} />
    </ModalSheet>
  );
}

function AccessNotesForm({ property, onDone }: { property: Property; onDone: () => void }) {
  const [text, setText] = useState(property.access_notes ?? "");
  // Typed text is kept as a draft until it's saved or discarded (owner, 2026-10-27).
  const draft = useDraft({
    form: "access-notes",
    id: property.id,
    fields: { text },
    restore: (c) => {
      if (c.text !== undefined) setText(c.text);
    },
  });
  useUnsavedChanges(text.trim() !== (property.access_notes?.trim() ?? ""), draft);

  function save() {
    const value = text.trim() ? text.trim() : null;
    if (value !== (property.access_notes?.trim() || null))
      getServices().sync.write("property", property.id, property.company_id, {
        access_notes: value,
      });
    haptics.success();
    draft.clear();
    onDone();
  }

  return (
    <View style={{ gap: space["4"] }}>
      <DraftNote draft={draft} />
      <Field
        label="Access Notes"
        value={text}
        onChangeText={setText}
        placeholder="Gate code, dog, where to park."
        multiline
        autoFocus
      />
      <Button title="Save" wide onPress={save} />
    </View>
  );
}
