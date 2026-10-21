import type { ReactNode } from "react";
import type { RowAction, RowActions } from "../lib/rowActions";
import { swipeList } from "../lib/rowActions";
import { haptics } from "./haptics";
import type { RowMenu } from "./editMenu";
import { useMenu } from "./Select";
import type { SwipeAction } from "./SwipeRow";
import { color } from "./theme";

// Touch-and-hold menus and swipe actions on list rows (docs/design/2026-10-20-gestures.md
// section 12). Which actions a row gets is decided in lib/rowActions; this turns them into the
// app's own action sheet (titled with the row's name, opened with a light tap), the row's swipe
// buttons, and the same choices for TalkBack and VoiceOver.

/** A swipe button's fill by action: green for done or paid, red for delete, blue otherwise. */
const TINTS: Record<string, string> = {
  complete: color.pass,
  record: color.pass,
  directions: color.water,
  lock: color.warning,
  delete: color.fail,
};

function tintFor(a: RowAction): string {
  if (a.destructive) return color.fail;
  if (a.id.startsWith("answer:")) return color.pass;
  return TINTS[a.id] ?? color.link;
}

/** The touch-and-hold menu: `open(title, actions, run)`; render `element` once in the screen. */
export function useRowMenu(): RowMenu & { element: ReactNode } {
  const menu = useMenu();
  return {
    element: menu.element,
    open(title, actions, run) {
      if (!actions.length) return;
      haptics.light();
      menu.open({
        title,
        items: actions.map((a) => ({
          label: a.label,
          destructive: a.destructive,
          checked: a.checked,
          onPress: () => run(a.id),
        })),
      });
    },
  };
}

/** Everything a row needs for its gestures: swipe buttons, accessibility actions, the menu. */
export type { RowMenu } from "./editMenu";
export { editRowMenu } from "./editMenu";

export interface RowGestures {
  leading: SwipeAction | null;
  trailing: SwipeAction[];
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => void;
  onLongPress?: () => void;
}

/**
 * A row's gestures from its actions. Swipe actions are also custom accessibility actions, and
 * the menu is too ("Show Actions"), since TalkBack and VoiceOver can't touch and hold a row.
 */
export function rowGestures<Id extends string>(
  actions: RowActions<Id>,
  run: (id: Id) => void,
  openMenu?: () => void,
): RowGestures {
  const swipe = (a: RowAction<Id>): SwipeAction => ({
    label: a.short ?? a.label,
    tint: tintFor(a),
    onPress: () => run(a.id),
  });
  const spoken = swipeList(actions).map((a) => ({ name: a.id as string, label: a.label }));
  const menu = openMenu && actions.menu.length > 0;
  return {
    leading: actions.leading ? swipe(actions.leading) : null,
    trailing: actions.trailing.map(swipe),
    accessibilityActions: [...spoken, ...(menu ? [{ name: "menu", label: "Show Actions" }] : [])],
    onAccessibilityAction: (e) => {
      const name = e.nativeEvent.actionName;
      if (name === "menu") openMenu?.();
      else if (spoken.some((a) => a.name === name)) run(name as Id);
    },
    onLongPress: menu ? openMenu : undefined,
  };
}
