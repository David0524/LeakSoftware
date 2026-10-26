import { editRowActions, type RowAction } from "../lib/rowActions";

// Kept apart from RowMenu.tsx (which draws the menu) so ListRow can use it without importing
// the menu's sheet, which imports ListRow's own module.

/** A screen's touch-and-hold menu (ui/RowMenu useRowMenu). */
export interface RowMenu {
  open: <Id extends string>(title: string, actions: RowAction<Id>[], run: (id: Id) => void) => void;
}

/**
 * Touch and hold on a settings row, a test or a finding: Edit (the row's tap) and its delete,
 * which asks first as the row's swipe and its sheet's button do, unless it happens at once with
 * Undo (`deleteAsks: false`). Returns the row's onLongPress.
 */
export function editRowMenu(
  menu: RowMenu,
  title: string,
  row: { onEdit: () => void; onDelete?: () => void; deleteLabel?: string; deleteAsks?: boolean },
): () => void {
  const actions = editRowActions({
    deleteLabel: row.onDelete ? (row.deleteLabel ?? "Delete") : null,
    asks: row.deleteAsks,
  });
  return () =>
    menu.open(title, actions.menu, (id) => (id === "edit" ? row.onEdit() : row.onDelete?.()));
}
