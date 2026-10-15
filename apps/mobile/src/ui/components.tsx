import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useId,
  useRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { JOB_STATUS_LABELS, type JobStatus } from "@leakbook/core";
import {
  color,
  face,
  font,
  header,
  ios,
  JOB_STATUS_COLOR,
  radius,
  space,
  tint,
  touch,
} from "./theme";
import { haptics } from "./haptics";
import { Icon, type IconName } from "./Icon";
import { SwipeToDelete } from "./SwipeRow";
import { chooseAction } from "./confirm";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type Variant = "largeTitle" | "title" | "heading" | "label" | "body" | "strong" | "small" | "muted";

export function T({
  variant = "body",
  style,
  children,
  numberOfLines,
}: {
  variant?: Variant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  // Text follows the phone's text size setting (Dynamic Type). Line heights are fixed numbers
  // in React Native, so they grow with the text, or large text would overlap (M11 review H4).
  const { fontScale } = useWindowDimensions();
  const base: TextStyle = text[variant];
  const scaled =
    fontScale !== 1 && base.lineHeight ? { lineHeight: base.lineHeight * fontScale } : null;
  return (
    <Text
      style={[base, scaled, style]}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
    >
      {children}
    </Text>
  );
}

/** Up to the largest accessibility sizes (about AX3); beyond that layouts can't hold. */
const MAX_TEXT_SCALE = 2.4;

const text = StyleSheet.create({
  // iOS large title size (34 pt), in the brand's title face. Sign-in and setup screens.
  largeTitle: {
    fontFamily: font.displayExtraBold,
    fontSize: 34,
    lineHeight: 40,
    color: color.text,
  },
  title: { fontFamily: font.displayExtraBold, fontSize: 28, lineHeight: 32, color: color.text },
  heading: { fontFamily: font.displayBold, fontSize: 20, lineHeight: 24, color: color.text },
  // Section and field labels. On iPhone, the system's grouped-list header (13 pt caps).
  label: ios
    ? {
        ...face.medium,
        fontSize: 13,
        lineHeight: 18,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        color: color.textMuted,
      }
    : {
        fontFamily: font.displaySemiBold,
        fontSize: 13,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: color.textMuted,
      },
  // Sizes follow iOS Dynamic Type defaults: Body 17/22, Subhead 15/20 (HIG typography.md).
  body: { ...face.regular, fontSize: 17, lineHeight: 22, color: color.text },
  strong: { ...face.semiBold, fontSize: 17, lineHeight: 22, color: color.text },
  small: { ...face.regular, fontSize: 15, lineHeight: 20, color: color.text },
  muted: { ...face.regular, fontSize: 15, lineHeight: 20, color: color.textMuted },
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  scrollEnabled = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Turn scrolling off for a moment, e.g. while a finger draws on a pad. */
  scrollEnabled?: boolean;
}) {
  // iPhone's navigation bar is translucent and floats over the page. A scrolling page is inset
  // below it by the system (contentInsetAdjustmentBehavior); a fixed one is padded here.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={scrollEnabled}
      // iOS: lets a large title collapse as the page scrolls, and keeps the end clear of the
      // home indicator.
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, ios && { paddingTop: headerHeight + space["4"] }]}>
      {children}
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({
  title,
  children,
  action,
  grouped = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** The section is a Group: on iPhone its header lines up with the rows' text. */
  grouped?: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={[styles.sectionHead, grouped && ios && { paddingHorizontal: space["4"] }]}>
        <T variant="label">{title}</T>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Notice({
  tone = "info",
  tinted = false,
  children,
}: {
  tone?: "info" | "warning" | "error";
  /**
   * A banner tinted in the tone's color instead of a white card with a colored edge, read out
   * as soon as it appears (sign-in errors).
   */
  tinted?: boolean;
  children: ReactNode;
}) {
  const c = tone === "error" ? color.fail : tone === "warning" ? color.warning : color.info;
  if (tinted)
    return (
      <View
        style={[styles.banner, { backgroundColor: tint(c, 0.12) }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <T variant="small">{children}</T>
      </View>
    );
  return (
    <View style={[styles.notice, { borderLeftColor: c }]}>
      <T variant="small">{children}</T>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  kind = "primary",
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "quiet" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const k = buttonKinds[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        k.box,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={k.text.color} />
      ) : (
        <Text style={[styles.buttonText, k.text]}>{title}</Text>
      )}
    </Pressable>
  );
}

// Pills styled like iOS buttons, as on the website (owner, 2026-10-14): primary is the filled
// one, secondary and danger are tinted (a light fill of the text color, no outline; Android's
// "tonal" button), quiet is plain text. Orange is only for the primary action.
const buttonKinds = {
  // Navy on safety orange: white on orange is too faint in sun (brand/BRAND.md).
  primary: { box: { backgroundColor: color.primary }, text: { color: color.onPrimary } },
  secondary: { box: { backgroundColor: tint(color.link, 0.12) }, text: { color: color.link } },
  quiet: { box: { backgroundColor: "transparent" }, text: { color: color.link } },
  danger: { box: { backgroundColor: tint(color.fail, 0.12) }, text: { color: color.fail } },
} as const;

export function Field({
  label,
  error,
  hint,
  ref,
  ...input
}: TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<TextInput>;
}) {
  return (
    <View style={styles.field}>
      <T variant="label">{label}</T>
      <TextInput
        ref={ref}
        placeholderTextColor={color.textMuted}
        {...input}
        accessibilityLabel={label}
        style={[
          styles.input,
          error ? { borderColor: color.fail } : null,
          input.multiline && styles.multiline,
        ]}
      />
      {error ? (
        <T variant="small" style={{ color: color.fail }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="muted">{hint}</T>
      ) : null}
    </View>
  );
}

export function Choice<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.field}>
      {label ? <T variant="label">{label}</T> : null}
      <View style={styles.choices}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              style={[styles.choice, on && styles.choiceOn]}
            >
              <Text style={[styles.choiceText, on && { color: color.onHeader }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * iOS-style segmented control: one row, equal-width segments, for switching between a few
 * closely related views or states (HIG segmented-controls.md). Use Choice for longer lists.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  grouped = false,
}: {
  label?: string;
  options: { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
  /** Among grouped form rows: on iPhone the label lines up with the rows' text. */
  grouped?: boolean;
}) {
  return (
    <View style={styles.field}>
      {label ? (
        <View style={grouped && ios ? styles.groupedHead : null}>
          <T variant="label">{label}</T>
        </View>
      ) : null}
      <View style={styles.segmented} accessibilityRole="tablist">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (on) return;
                haptics.selection();
                onChange(o.value);
              }}
              style={[styles.segment, on && styles.segmentOn]}
            >
              <Text
                style={[styles.segmentText, on && styles.segmentTextOn]}
                numberOfLines={2}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * An on/off setting with the platform's own switch (green on iPhone, the brand blue on
 * Android). The switch announces its label and state to VoiceOver and TalkBack.
 */
export function Toggle({
  label,
  value,
  onChange,
  inList = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  /** Inside a Group: padded like a list row and in body weight, as in iOS Settings. */
  inList?: boolean;
}) {
  return (
    <View style={[styles.toggle, inList && styles.rowPad]}>
      <T variant={inList ? "body" : "strong"} style={{ flex: 1 }}>
        {label}
      </T>
      <Switch
        value={value}
        onValueChange={(v) => {
          // iPhone's switch already taps as it flips; Android's doesn't, so add one there.
          if (!ios) haptics.selection();
          onChange(v);
        }}
        // iPhone keeps the system green; Android tints the track with the brand blue.
        trackColor={ios ? undefined : { true: color.water, false: color.neutral200 }}
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inset grouped lists (iOS Settings style): one rounded white block, hairlines between rows
// that start where the text does, chevrons on rows that open another screen (iPhone only;
// Android rows open on tap without one, and ripple when pressed).
// ---------------------------------------------------------------------------

export function Group({
  children,
  style,
  separatorInset = space["4"],
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Where the hairline starts; larger when rows lead with an icon or number. */
  separatorInset?: number;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? <View style={[styles.separator, { marginLeft: separatorInset }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  detail,
  leading,
  trailing,
  onPress,
  chevron,
  tone = "default",
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  onDelete,
  deleteLabel = "Delete",
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  /** Right-aligned value, as in iOS Settings ("Version 1.0"). */
  detail?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Defaults to on for rows that open something. iPhone only. */
  chevron?: boolean;
  /** A row that is itself an action: "link" (blue) or "destructive" (red), centered text. */
  tone?: "default" | "link" | "destructive";
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: "button" | "link";
  /**
   * Swipe left to delete, plus a "Delete" action for VoiceOver and TalkBack. Should ask first
   * (confirmDestructive). The screen the row opens keeps its own visible Delete button.
   */
  onDelete?: () => void;
  /** The swipe and accessibility action's name, as on the visible button ("Remove"). */
  deleteLabel?: string;
  /** Free-form content in place of title and subtitle. */
  children?: ReactNode;
}) {
  const action = tone !== "default";
  const showChevron = ios && Boolean(onPress) && (chevron ?? !action);
  const body = (
    <>
      {leading}
      <View style={styles.rowBody}>
        {children ?? (
          <>
            {title ? (
              <T
                variant="body"
                style={[
                  action && { textAlign: "center" },
                  tone === "link" && { color: color.link },
                  tone === "destructive" && { color: color.fail },
                ]}
              >
                {title}
              </T>
            ) : null}
            {typeof subtitle === "string" ? <T variant="muted">{subtitle}</T> : subtitle}
          </>
        )}
      </View>
      {typeof detail === "string" ? (
        <T variant="body" style={styles.rowDetail}>
          {detail}
        </T>
      ) : (
        detail
      )}
      {trailing}
      {showChevron ? (
        <Icon
          name="chevron"
          size={ios ? 14 : 17}
          weight="semibold"
          color={tint(color.textMuted, 0.6)}
        />
      ) : null}
    </>
  );
  const deleteAction = onDelete
    ? {
        accessibilityActions: [{ name: "delete", label: deleteLabel }],
        onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
          if (e.nativeEvent.actionName === "delete") onDelete();
        },
      }
    : null;
  const swipe = (row: ReactNode) =>
    onDelete ? (
      <SwipeToDelete label={deleteLabel} onDelete={onDelete}>
        {row}
      </SwipeToDelete>
    ) : (
      row
    );
  if (!onPress)
    return swipe(
      <View
        style={[styles.listRow, styles.rowPad, onDelete && styles.rowSolid]}
        accessible={Boolean(onDelete) || undefined}
        {...deleteAction}
      >
        {body}
      </View>,
    );
  return swipe(
    <Pressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      {...deleteAction}
      onPress={onPress}
      android_ripple={{ color: color.fill }}
      style={({ pressed }) => [
        styles.listRow,
        styles.rowPad,
        // A swipeable row slides over the red action, so it needs its own background.
        onDelete && styles.rowSolid,
        // iOS highlights the pressed row in gray; Android ripples.
        ios && pressed && { backgroundColor: color.neutral200 },
      ]}
    >
      {body}
    </Pressable>,
  );
}

// ---------------------------------------------------------------------------
// Grouped forms (iPhone): fields as rows of an inset grouped list, as in iOS Settings and
// Contacts. Android keeps its outlined fields (Field) and chips (Choice) unchanged.
// ---------------------------------------------------------------------------

/** Width of the leading labels in a FieldGroup, so the fields line up. */
const LabelWidth = createContext(112);

/**
 * A block of form fields. iPhone: one inset grouped block with hairlines between rows, under an
 * optional header (the label for rows that show none). Android: the fields stacked as before,
 * each with its own label, so `title` is not shown there.
 */
export function FieldGroup({
  title,
  footer,
  labelWidth = 112,
  children,
}: {
  /** iPhone only: the header above the block. */
  title?: string;
  /** A note under the block, on both platforms. */
  footer?: string;
  /** Width of the rows' leading labels (at the default text size). */
  labelWidth?: number;
  children: ReactNode;
}) {
  if (!ios)
    return (
      <View style={styles.fieldStack}>
        {children}
        {footer ? <T variant="muted">{footer}</T> : null}
      </View>
    );
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.groupedHead}>
          <T variant="label">{title}</T>
        </View>
      ) : null}
      <LabelWidth.Provider value={labelWidth}>
        <Group>{children}</Group>
      </LabelWidth.Provider>
      {footer ? (
        <View style={styles.groupedHead}>
          <T variant="muted">{footer}</T>
        </View>
      ) : null}
    </View>
  );
}

const NUMERIC_KEYBOARDS = new Set(["decimal-pad", "number-pad", "numeric", "phone-pad"]);

/**
 * A text field as a row of a FieldGroup (iPhone): the label leads at a fixed width and the
 * borderless field fills the rest. `layout`:
 * - "inline" (default): label, then the field.
 * - "stacked": the label in small type above the field, for long labels or placeholders.
 * - "full": no visible label; the field fills the row and the label is its placeholder (or
 *   the group's header names it). Multiline fields default to this.
 * At the largest text sizes inline rows stack, so labels never squeeze the field.
 * A hint or error shows inside the row at 15 pt. `next` moves to that field on Return (or the
 * Next button above a number pad). Android renders the ordinary Field.
 */
export function FieldRow({
  label,
  error,
  hint,
  layout,
  next,
  wrap = false,
  ref,
  ...input
}: TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  layout?: "inline" | "stacked" | "full";
  /** The field Return moves to. */
  next?: RefObject<TextInput | null>;
  /**
   * A one-value field whose text wraps instead of scrolling sideways (iPhone): Return still
   * ends the entry and never adds a line.
   */
  wrap?: boolean;
  ref?: Ref<TextInput>;
}) {
  const own = useRef<TextInput | null>(null);
  const setRef = useCallback(
    (node: TextInput | null) => {
      own.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const accessoryId = `field-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const labelWidth = useContext(LabelWidth);
  const { fontScale } = useWindowDimensions();

  const flow: TextInputProps = next
    ? {
        returnKeyType: "next",
        submitBehavior: "submit",
        onSubmitEditing: () => next.current?.focus(),
      }
    : {};

  if (!ios) return <Field ref={ref} label={label} error={error} hint={hint} {...flow} {...input} />;

  const multiline = Boolean(input.multiline);
  const mode = layout ?? (multiline ? "full" : "inline");
  // Large accessibility text sizes: a fixed-width label would squeeze the field to nothing.
  const shown = mode === "inline" && fontScale >= 1.35 ? "stacked" : mode;
  const numeric = NUMERIC_KEYBOARDS.has(String(input.keyboardType ?? ""));
  const scaledWidth = labelWidth * Math.min(fontScale, 1.35);

  const field = (
    <TextInput
      ref={setRef}
      placeholderTextColor={color.textMuted}
      clearButtonMode={multiline || wrap ? undefined : "while-editing"}
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
      inputAccessoryViewID={numeric ? accessoryId : undefined}
      {...flow}
      {...(wrap ? { multiline: true, submitBehavior: "blurAndSubmit" as const } : null)}
      {...input}
      placeholder={input.placeholder ?? (shown === "full" ? label : undefined)}
      accessibilityLabel={label}
      accessibilityHint={error ?? hint}
      style={[
        styles.rowInput,
        // Under a caption or alone: the field's own height, so long text can grow the row.
        shown !== "inline" && styles.rowInputBlock,
        shown === "stacked" && styles.rowInputStacked,
        multiline && styles.rowMultiline,
        wrap && shown !== "stacked" && styles.rowWrap,
      ]}
    />
  );

  return (
    // Tapping anywhere on the row, the label too, puts the cursor in the field.
    <Pressable
      onPress={() => own.current?.focus()}
      accessible={false}
      style={[
        styles.formRow,
        shown !== "inline" && styles.formRowStacked,
        (error || hint) && styles.formRowNote,
      ]}
    >
      {shown === "inline" ? (
        <View style={styles.formInline}>
          <Text
            style={[styles.rowLabel, { width: scaledWidth }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            importantForAccessibility="no"
            accessibilityElementsHidden
          >
            {label}
          </Text>
          {field}
        </View>
      ) : (
        <>
          {shown === "stacked" ? (
            <Text
              style={styles.rowCaption}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              {label}
            </Text>
          ) : null}
          {field}
        </>
      )}
      {error ? (
        <T variant="small" style={{ color: color.fail }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="muted">{hint}</T>
      ) : null}
      {numeric ? (
        // Number pads have no Return key: a bar above them moves on or closes the keyboard.
        <InputAccessoryView nativeID={accessoryId} backgroundColor={color.bg}>
          <View style={styles.accessory}>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={styles.headerButton}
              onPress={() => (next ? next.current?.focus() : Keyboard.dismiss())}
            >
              <Text style={[styles.headerButtonText, face.semiBold, { color: color.link }]}>
                {next ? "Next" : "Done"}
              </Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </Pressable>
  );
}

/**
 * Choose one of several values. iPhone: a row showing the current value with a chevron that
 * opens an action sheet of the choices. Android: the chips (Choice) as before.
 */
export function PickerRow<V extends string>({
  label,
  options,
  value,
  onChange,
  error,
  placeholder = "Choose",
}: {
  label: string;
  options: { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
  error?: string;
  /** Shown when nothing is chosen yet (iPhone). */
  placeholder?: string;
}) {
  if (!ios)
    return (
      <View style={styles.field}>
        <Choice label={label} options={options} value={value} onChange={onChange} />
        {error ? (
          <T variant="small" style={{ color: color.fail }}>
            {error}
          </T>
        ) : null}
      </View>
    );
  const current = options.find((o) => o.value === value)?.label;
  return (
    <ListRow
      title={label}
      detail={current ?? placeholder}
      subtitle={
        error ? (
          <T variant="small" style={{ color: color.fail }}>
            {error}
          </T>
        ) : undefined
      }
      accessibilityLabel={`${label}, ${current ?? placeholder}`}
      accessibilityHint={error}
      onPress={() =>
        chooseAction({
          title: label,
          actions: options.map((o) => ({
            label: o.value === value ? `${o.label} ✓` : o.label,
            onPress: () => {
              if (o.value === value) return;
              haptics.selection();
              onChange(o.value);
            },
          })),
        })
      }
    />
  );
}

/**
 * A row of a grouped list with an amount on the right: quote and invoice lines and totals.
 * `strong` for the total. Use inside a Group.
 */
export function AmountRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value?: string;
  strong?: boolean;
}) {
  const v = strong ? "strong" : "body";
  return (
    <View style={[styles.listRow, styles.rowPad]}>
      <T variant={v} style={{ flex: 1 }}>
        {label}
      </T>
      {value ? (
        <T variant={v} style={styles.amount}>
          {value}
        </T>
      ) : null}
    </View>
  );
}

/** A status label: a pill in the status color with white text (quote and invoice states). */
export function Pill({ label, color: bg }: { label: string; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={styles.chipText} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A titled part of a screen with an optional note, holding grouped rows and buttons. iPhone:
 * a grouped-list header and the note lined up with the rows' text, on the gray page. Android:
 * a card with a heading, as before.
 */
export function Block({
  title,
  note,
  action,
  children,
}: {
  title?: string;
  /** A short explanation under the title. */
  note?: string;
  /** A small action at the end of the header (a link). */
  action?: ReactNode;
  children?: ReactNode;
}) {
  const noteEl = note ? <T variant="muted">{note}</T> : null;
  if (!ios)
    return (
      <Card>
        {title || action ? (
          <Row style={{ justifyContent: "space-between" }}>
            {title ? <T variant="heading">{title}</T> : null}
            {action}
          </Row>
        ) : null}
        {noteEl}
        {children}
      </Card>
    );
  return (
    <View style={styles.section}>
      {title || action ? (
        <View style={[styles.sectionHead, styles.groupedHead]}>
          {title ? (
            <View style={{ flexShrink: 1 }}>
              <T variant="label">{title}</T>
            </View>
          ) : null}
          {action}
        </View>
      ) : null}
      {noteEl ? <View style={styles.groupedHead}>{noteEl}</View> : null}
      {children}
    </View>
  );
}

/**
 * A navigation bar button: text (Cancel, Save) or an icon (+, settings). Blue on iPhone's light
 * bar, white on Android's navy app bar.
 */
export function HeaderButton({
  title,
  icon,
  onPress,
  strong = false,
  disabled = false,
}: {
  /** Shown as text, or the accessibility label when there is an icon. */
  title: string;
  icon?: IconName;
  onPress: () => void;
  /** The confirming action (Save, Done) is bold, as on iOS. */
  strong?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerButton,
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 },
      ]}
    >
      {icon ? (
        <Icon name={icon} size={ios ? 22 : 24} color={header.tint} weight="medium" />
      ) : (
        <Text
          style={[styles.headerButtonText, strong && (ios ? face.semiBold : face.bold)]}
          maxFontSizeMultiplier={1.6}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function StatusChip({ status }: { status: JobStatus }) {
  return (
    <View style={[styles.chip, { backgroundColor: JOB_STATUS_COLOR[status] }]}>
      <Text style={styles.chipText}>{JOB_STATUS_LABELS[status]}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  screenContent: { padding: space["4"], gap: space["4"], paddingBottom: space["7"] },
  // Soft raised cards, not outlined boxes (owner, 2026-10-13: "still feels super boxy").
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: space["4"],
    gap: space["2"],
    shadowColor: "#12263A",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  section: { gap: space["2"] },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  banner: { borderRadius: 12, paddingHorizontal: space["4"], paddingVertical: space["3"] },
  notice: {
    backgroundColor: color.surface,
    borderLeftWidth: 4,
    borderRadius: radius.xl,
    padding: space["3"],
  },
  button: {
    minHeight: touch + 4,
    borderRadius: radius.pill,
    paddingHorizontal: space["5"],
    alignItems: "center",
    justifyContent: "center",
  },
  // iPhone: system font, 17 pt semibold, like iOS buttons. Android: the brand's Barlow.
  buttonText: ios
    ? { ...face.semiBold, fontSize: 17 }
    : { fontFamily: font.displayExtraBold, fontSize: 18, letterSpacing: 0.4 },
  field: { gap: 6 },
  input: {
    minHeight: touch + 4,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.controlBorder,
    borderRadius: 12,
    paddingHorizontal: space["3"],
    ...face.regular,
    fontSize: 17,
    color: color.text,
  },
  multiline: { minHeight: 96, paddingTop: space["3"], textAlignVertical: "top" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  choice: {
    minHeight: touch,
    paddingHorizontal: space["4"],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.controlBorder,
    backgroundColor: color.surface,
    justifyContent: "center",
  },
  choiceOn: { backgroundColor: color.navy, borderColor: color.navy },
  // As on iOS and the website: a gray track with the chosen segment on a raised white thumb.
  segmented: {
    flexDirection: "row",
    backgroundColor: color.fill,
    borderRadius: radius.pill,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: touch - 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space["2"],
  },
  segmentOn: {
    backgroundColor: color.thumb,
    shadowColor: color.navy,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  segmentText: { ...face.medium, fontSize: 15, color: color.text },
  segmentTextOn: { ...face.semiBold },
  choiceText: { ...face.semiBold, fontSize: 15, color: color.text },
  toggle: {
    minHeight: touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space["3"],
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  chipText: { ...face.semiBold, fontSize: 13, color: color.onStatus },
  row: { flexDirection: "row", alignItems: "center", gap: space["3"] },
  headerButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerButtonText: { ...(ios ? face.regular : face.medium), fontSize: 17, color: header.tint },
  group: { backgroundColor: color.surface, borderRadius: 12, overflow: "hidden" },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: color.separator },
  listRow: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: space["3"] },
  rowPad: { paddingHorizontal: space["4"], paddingVertical: 10 },
  rowSolid: { backgroundColor: color.surface },
  rowBody: { flex: 1, gap: 2 },
  rowDetail: { color: color.textMuted, textAlign: "right", flexShrink: 1 },
  amount: { textAlign: "right", fontVariant: ["tabular-nums"] },
  // A header or note over a grouped block, lined up with the rows' text.
  groupedHead: { paddingHorizontal: space["4"] },
  fieldStack: { gap: space["4"] },
  formRow: { paddingHorizontal: space["4"], minHeight: touch, justifyContent: "center" },
  formRowStacked: { paddingTop: 10, paddingBottom: 6, gap: 2 },
  formRowNote: { paddingBottom: 10 },
  formInline: { flexDirection: "row", alignItems: "center", gap: space["3"] },
  rowLabel: { ...face.regular, fontSize: 17, color: color.text },
  rowCaption: { ...face.regular, fontSize: 15, color: color.textMuted },
  rowInput: {
    flex: 1,
    minHeight: touch,
    paddingVertical: 0,
    ...face.regular,
    fontSize: 17,
    color: color.text,
  },
  rowInputBlock: { flex: 0, alignSelf: "stretch" },
  rowInputStacked: { minHeight: 34 },
  rowMultiline: { minHeight: 96, paddingTop: 11, paddingBottom: 11, textAlignVertical: "top" },
  rowWrap: { paddingTop: 11, paddingBottom: 11 },
  accessory: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: space["3"],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
});
