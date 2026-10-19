import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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
  type LayoutRectangle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { Stack } from "expo-router";
import { useRoute, useScrollToTop } from "expo-router/react-navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JOB_STATUS_LABELS, type JobStatus } from "@leakbook/core";
import {
  cardShadow,
  color,
  drawnChrome,
  face,
  gutter,
  ios,
  jobStatusColor,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tabular,
  thumbShadow,
  tint,
  type,
} from "./theme";
import { BAR_HEIGHT, barState, setLargeTitle } from "./Bar";
import { haptics } from "./haptics";
import { Icon, type IconName } from "./Icon";
import { WebIcon, type WebIconName } from "./WebIcon";
import { SwipeLeading, SwipeToDelete } from "./SwipeRow";
import { chooseAction } from "./confirm";

// The app's building blocks, drawn like the phone website on iPhone and Android (spec 3).
// Colors are read while rendering (never baked into a stylesheet), so they follow Appearance.

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type Variant =
  | "largeTitle"
  | "sectionHeading"
  | "cardTitle"
  | "subHeading"
  | "sectionLabel"
  | "navTitle"
  | "body"
  | "bodyEmphasis"
  | "bodyMedium"
  | "secondary"
  | "footnote"
  // Older names, kept so screens not restyled yet still read right.
  | "title"
  | "heading"
  | "label"
  | "strong"
  | "small"
  | "muted";

const VARIANTS: Record<Variant, { style: TextStyle; muted?: boolean }> = {
  largeTitle: { style: type.largeTitle },
  sectionHeading: { style: type.sectionHeading },
  cardTitle: { style: type.cardTitle },
  subHeading: { style: type.subHeading },
  sectionLabel: { style: type.sectionLabel, muted: true },
  navTitle: { style: type.navTitle },
  body: { style: type.body },
  bodyEmphasis: { style: type.bodyEmphasis },
  bodyMedium: { style: type.bodyMedium },
  secondary: { style: type.secondary },
  footnote: { style: type.footnote },
  title: { style: type.sectionHeading },
  heading: { style: type.cardTitle },
  label: { style: type.sectionLabel, muted: true },
  strong: { style: type.bodyEmphasis },
  small: { style: type.secondary },
  muted: { style: type.secondary, muted: true },
};

export function T({
  variant = "body",
  muted,
  style,
  children,
  numberOfLines,
}: {
  variant?: Variant;
  /** Secondary text color (textMuted). */
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  // Text follows the phone's text size setting. Line heights are fixed numbers in React
  // Native, so they grow with the text, or large text would overlap (M11 review H4).
  const { fontScale } = useWindowDimensions();
  const v = VARIANTS[variant];
  const scaled =
    fontScale !== 1 && v.style.lineHeight ? { lineHeight: v.style.lineHeight * fontScale } : null;
  return (
    <Text
      style={[v.style, { color: (muted ?? v.muted) ? color.textMuted : color.text }, scaled, style]}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
      accessibilityRole={variant === "largeTitle" ? "header" : undefined}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Screens: the large title, subtitle and header actions, then the content (spec 3.1)
// ---------------------------------------------------------------------------

/** Bottom room for the floating tab bar; set by the tabs layout for every screen inside it. */
export const TabBarSpace = createContext(0);

export interface ScreenChrome {
  /** The large title, also the small title in the bar and the next screen's Back label. */
  title?: string;
  /** Under the title: text or inline content (a date, a status chip). */
  subtitle?: ReactNode;
  /** Under the subtitle: a row of buttons (Start Job, Open Route in Google Maps). */
  headerActions?: ReactNode;
  /** The bar's right slot: the screen's main action ("+"). */
  headerRight?: () => ReactNode;
}

/**
 * What a scrolling screen needs for the large title: the header element to put first in its
 * content, and props for its scroll view (ScrollView, FlatList, SectionList). Screen uses it;
 * list screens call it themselves.
 */
export function useScreenChrome({ title, subtitle, headerActions, headerRight }: ScreenChrome) {
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const tabSpace = useContext(TabBarSpace);
  const ref = useRef<ScrollView>(null);
  useScrollToTop(ref);
  const bar = barState(route.key);
  const large = Boolean(title);
  useEffect(() => {
    if (drawnChrome) setLargeTitle(route.key, large);
  }, [route.key, large]);

  const options = {
    ...(title !== undefined ? { title } : null),
    ...(headerRight ? { headerRight } : null),
    // Drawn bar: transparent over the page while a large title is in it.
    ...(drawnChrome && large ? { headerTransparent: true } : null),
  };
  const hasOptions = Object.keys(options).length > 0;

  const header = (
    <>
      {hasOptions ? <Stack.Screen options={options} /> : null}
      {(drawnChrome && large) || subtitle || headerActions ? (
        <View style={styles.titleBlock}>
          {drawnChrome && large ? <T variant="largeTitle">{title}</T> : null}
          {subtitle ? typeof subtitle === "string" ? <T muted>{subtitle}</T> : subtitle : null}
          {headerActions ? <View style={styles.headerActions}>{headerActions}</View> : null}
        </View>
      ) : null}
    </>
  );

  const onScroll = drawnChrome
    ? Animated.event([{ nativeEvent: { contentOffset: { y: bar.y } } }], {
        useNativeDriver: false,
      })
    : undefined;

  const contentContainerStyle: ViewStyle = {
    paddingHorizontal: gutter,
    paddingTop: drawnChrome && large ? insets.top + BAR_HEIGHT : space["4"],
    paddingBottom: Math.max(space["7"], tabSpace),
  };

  return {
    header,
    ref,
    scrollProps: {
      onScroll: onScroll as ((e: NativeSyntheticEvent<NativeScrollEvent>) => void) | undefined,
      scrollEventThrottle: 16,
      // iOS: lets the large title collapse as the page scrolls.
      contentInsetAdjustmentBehavior: "automatic" as const,
      keyboardShouldPersistTaps: "handled" as const,
    },
    contentContainerStyle,
  };
}

export function Screen({
  children,
  scroll = true,
  scrollEnabled = true,
  refreshControl,
  ...chrome
}: ScreenChrome & {
  children: ReactNode;
  scroll?: boolean;
  /** Turn scrolling off for a moment, e.g. while a finger draws on a pad. */
  scrollEnabled?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome(chrome);
  const headerHeight = useHeaderHeightSafe();
  const body = scroll ? (
    <Animated.ScrollView
      ref={ref}
      {...scrollProps}
      contentContainerStyle={[contentContainerStyle, styles.stack]}
      scrollEnabled={scrollEnabled}
      refreshControl={refreshControl}
    >
      {header}
      {children}
    </Animated.ScrollView>
  ) : (
    <View
      style={[
        contentContainerStyle,
        styles.stack,
        { flex: 1 },
        ios && { paddingTop: headerHeight + space["4"] },
      ]}
    >
      {header}
      {children}
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: color.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

/** The navigation bar's height on iPhone, where it floats over a page that doesn't scroll. */
function useHeaderHeightSafe(): number {
  const insets = useSafeAreaInsets();
  return ios ? insets.top + BAR_HEIGHT : 0;
}

// ---------------------------------------------------------------------------
// Blocks: cards, grouped lists, section labels, notices, empty states
// ---------------------------------------------------------------------------

/** A soft card (spec 3.3): surface, radius 20, the soft shadow, 20 padding. */
export function Card({
  children,
  style,
  padding = 20,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
}) {
  return (
    <View style={[styles.card, { backgroundColor: color.surface, padding }, cardShadow(), style]}>
      {children}
    </View>
  );
}

/**
 * A titled block: the section label over its content (a Group), with an optional footer
 * (spec 3.4, 3.5). The label lines up with the block's left edge; the footer is inset 16.
 */
export function Section({
  title,
  children,
  action,
  footer,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  /** @deprecated Labels line up with the block on every platform now. */
  grouped?: boolean;
}) {
  return (
    <View style={styles.section}>
      {title || action ? (
        <View style={styles.sectionHead}>
          {title ? <T variant="sectionLabel">{title}</T> : <View />}
          {action}
        </View>
      ) : null}
      {children}
      {footer ? (
        <View style={styles.footer}>
          {typeof footer === "string" ? (
            <T variant="footnote" muted>
              {footer}
            </T>
          ) : (
            footer
          )}
        </View>
      ) : null}
    </View>
  );
}

type Tone = "info" | "warning" | "error" | "success";

function toneColor(tone: Tone): string {
  return tone === "error"
    ? color.fail
    : tone === "warning"
      ? color.warning
      : tone === "success"
        ? color.pass
        : color.info;
}

/**
 * A notice (spec 3.12): a tinted block with a bar in the tone's color down its left. Errors
 * are announced at once; the others politely.
 */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: Tone;
  /** @deprecated Every notice is tinted now. */
  tinted?: boolean;
  children: ReactNode;
}) {
  const c = toneColor(tone);
  return (
    <View
      style={[styles.notice, { backgroundColor: tint(c, 0.1) }]}
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}
    >
      <View style={[styles.noticeBar, { backgroundColor: c }]} />
      {typeof children === "string" ? <T>{children}</T> : children}
    </View>
  );
}

/** An empty state (spec 3.13): a soft block with centered muted text. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={[styles.empty, { backgroundColor: color.emptyFill }]}>
      {typeof children === "string" ? (
        <T muted style={{ textAlign: "center" }}>
          {children}
        </T>
      ) : (
        children
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons and pills (spec 3.7, 3.8, 3.10)
// ---------------------------------------------------------------------------

type ButtonKind = "primary" | "secondary" | "quiet" | "danger";

function buttonColors(kind: ButtonKind, pressed: boolean) {
  switch (kind) {
    case "primary":
      return { bg: color.primary, fg: color.onPrimary, dim: pressed };
    case "secondary":
      return { bg: pressed ? color.tintedPressed : color.tinted, fg: color.link, dim: false };
    case "danger":
      return { bg: pressed ? color.dangerPressed : color.dangerTint, fg: color.fail, dim: false };
    case "quiet":
      return { bg: pressed ? color.iconTint : "transparent", fg: color.link, dim: false };
  }
}

/**
 * A capsule button (spec 3.7), at least 44 tall, sized to its label at the left unless
 * `wide`. Title Case, saying what happens.
 */
export function Button({
  title,
  onPress,
  kind = "primary",
  loading = false,
  disabled = false,
  wide = false,
  small = false,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  loading?: boolean;
  disabled?: boolean;
  /** Full width (sheets' main and delete rows, sign-in). */
  wide?: boolean;
  /** Quiet buttons in a version list: 12 side padding, 15 pt. */
  small?: boolean;
  icon?: WebIconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => {
        const c = buttonColors(kind, pressed);
        return [
          styles.button,
          { backgroundColor: c.bg, alignSelf: wide ? "stretch" : "flex-start" },
          small && styles.buttonSmall,
          c.dim && { opacity: 0.9 },
          disabled && { opacity: 0.5 },
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const c = buttonColors(kind, pressed);
        return (
          <>
            {loading ? <ActivityIndicator size="small" color={c.fg} /> : null}
            {icon && !loading ? <WebIcon name={icon} size={20} color={c.fg} /> : null}
            <Text
              style={[small ? styles.buttonTextSmall : styles.buttonText, { color: c.fg }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {title}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

/**
 * A round contact button (spec 3.10): a 44 circle in the link tint with the website's icon.
 * Always named for screen readers ("Call Riley Rivera, (480) 555-0188").
 */
export function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: WebIconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: color.ripple, borderless: true }}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: pressed ? color.tintedPressed : color.iconTint },
      ]}
    >
      <WebIcon name={icon} size={20} color={color.link} />
    </Pressable>
  );
}

/**
 * Filters and choosers (spec 3.8): a sideways row of 44 pt capsules running edge to edge,
 * the first 16 in. Selected: primary with white text.
 */
export function FilterPills<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  /** For screen readers ("Status", "Whose day"). */
  label: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.pillScroller}
      contentContainerStyle={styles.pillRow}
      accessibilityLabel={label}
    >
      {options.map((o) => (
        <PillButton
          key={o.value}
          label={o.label}
          selected={o.value === value}
          onPress={() => {
            if (o.value === value) return;
            haptics.selection();
            onChange(o.value);
          }}
        />
      ))}
    </ScrollView>
  );
}

function PillButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: selected ? color.primary : color.fill },
        pressed && !selected && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[type.bodyMedium, { color: selected ? color.onPrimary : color.text }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Fields (spec 3.14)
// ---------------------------------------------------------------------------

/** An outlined field: the label above, the box, a hint or error under it. */
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
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <T variant="bodyMedium">{label}</T>
      <TextInput
        ref={ref}
        placeholderTextColor={color.placeholder}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        style={[
          styles.input,
          {
            backgroundColor: color.surface,
            borderColor: error ? color.fail : color.controlBorder,
            color: color.text,
          },
          focused && focusRing(),
          input.multiline && styles.multiline,
        ]}
      />
      {error ? (
        <T variant="secondary" style={{ color: color.fail }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="secondary" muted>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/** The 3 pt focus ring outside a field, 1 pt clear of it. */
function focusRing(): ViewStyle {
  return { boxShadow: `0px 0px 0px 1px ${color.surface}, 0px 0px 0px 4px ${color.focus}` };
}

/**
 * A search field (Jobs, Customers): outlined, a magnifying glass at the left and a clear
 * button while it has text. It filters as you type; there is no Search button.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  label = "Search",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  label?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.search,
        { backgroundColor: color.surface, borderColor: color.controlBorder },
        focused && focusRing(),
      ]}
    >
      <WebIcon name="search" size={20} color={color.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.placeholder}
        accessibilityLabel={label}
        returnKeyType="search"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        style={[styles.searchInput, { color: color.text }]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear Search"
          onPress={() => onChangeText("")}
          style={styles.clear}
        >
          <WebIcon name="close" size={16} color={color.textMuted} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Choose one of a few values: a wrapping row of pills (selected: primary). */
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
      {label ? <T variant="bodyMedium">{label}</T> : null}
      <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              android_ripple={{ color: color.ripple }}
              style={[styles.pill, { backgroundColor: on ? color.primary : color.fill }]}
            >
              <Text
                style={[type.bodyMedium, { color: on ? color.onPrimary : color.text }]}
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

// ---------------------------------------------------------------------------
// Segmented controls (spec 3.9): our own, 44 pt, the same on iPhone and Android
// ---------------------------------------------------------------------------

function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setOn);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setOn);
    return () => sub.remove();
  }, []);
  return on;
}

/**
 * A segmented control: a gray track with the chosen segment on a raised thumb that slides to
 * it. For two to five related views or states (house rule); use Choice for longer lists.
 * `fill` (default) spreads the segments over the row; otherwise each is sized to its label
 * (at least `minSegmentWidth`). The "switcher" variant is the job page's section switcher:
 * equal columns, 13 pt labels, and a to-do badge on a segment.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  fill = true,
  minSegmentWidth,
  variant = "default",
  accessibilityLabel,
}: {
  label?: string;
  options: { value: V; label: string; badge?: number }[];
  value: V | null;
  onChange: (v: V) => void;
  fill?: boolean;
  minSegmentWidth?: number;
  variant?: "default" | "switcher";
  accessibilityLabel?: string;
  /** @deprecated Labels sit above the control on every platform now. */
  grouped?: boolean;
}) {
  const switcher = variant === "switcher";
  const reduceMotion = useReduceMotion();
  const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>({});
  const [x] = useState(() => new Animated.Value(0));
  const [w] = useState(() => new Animated.Value(0));
  const placed = useRef(false);
  const chosen = value != null ? layouts[value] : undefined;

  useEffect(() => {
    if (!chosen) return;
    if (!placed.current || reduceMotion) {
      x.setValue(chosen.x);
      w.setValue(chosen.width);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.timing(x, { toValue: chosen.x, duration: 200, useNativeDriver: false }),
      Animated.timing(w, { toValue: chosen.width, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [chosen, reduceMotion, x, w]);

  const control = (
    <View
      style={[
        styles.track,
        { backgroundColor: color.fill },
        (fill || switcher) && { alignSelf: "stretch" },
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {chosen ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { backgroundColor: color.thumb, left: x, width: w, top: 2, bottom: 2 },
            thumbShadow(),
          ]}
        />
      ) : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.badge ? `${o.label}, ${o.badge} to do` : o.label}
            onLayout={(e) => {
              const l = e.nativeEvent.layout;
              setLayouts((prev) => {
                const p = prev[o.value];
                if (p && p.x === l.x && p.width === l.width) return prev;
                return { ...prev, [o.value]: l };
              });
            }}
            onPress={() => {
              if (on) return;
              haptics.selection();
              onChange(o.value);
            }}
            style={[
              switcher ? styles.switchSegment : styles.segment,
              (fill || switcher) && { flex: 1 },
              minSegmentWidth ? { minWidth: minSegmentWidth } : null,
              // Until the thumb has measured, the chosen segment draws its own.
              on && !chosen && [{ backgroundColor: color.thumb }, thumbShadow()],
            ]}
          >
            <Text
              style={[
                switcher ? (on ? styles.switchTextOn : styles.switchText) : type.segment,
                !switcher && on && face.semiBold,
                { color: color.text },
              ]}
              numberOfLines={switcher ? 1 : 2}
              adjustsFontSizeToFit={switcher}
              maxFontSizeMultiplier={switcher ? 1.4 : MAX_TEXT_SCALE}
            >
              {o.label}
            </Text>
            {o.badge ? (
              <View style={[styles.segmentBadge, { backgroundColor: color.warning }]}>
                <Text
                  style={[styles.segmentBadgeText, { color: color.onStatus }]}
                  maxFontSizeMultiplier={1.4}
                >
                  {o.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
  if (!label) return control;
  return (
    <View style={styles.field}>
      <T variant="bodyMedium">{label}</T>
      {control}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Switches and checks
// ---------------------------------------------------------------------------

/**
 * The iOS-shaped switch (spec 3.14): the system one on iPhone; on Android and in the browser a
 * drawn one, 51 x 31, gray off and green on, a white knob with a soft shadow.
 */
export function SwitchControl({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
}) {
  const [pos] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    if (ios) return;
    Animated.timing(pos, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, pos]);
  if (ios)
    return (
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
      />
    );
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        haptics.selection();
        onValueChange(!value);
      }}
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.switchTrack,
          {
            backgroundColor: pos.interpolate({
              inputRange: [0, 1],
              outputRange: [color.fill, color.pass],
            }),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.switchKnob,
            { backgroundColor: color.paper },
            thumbShadow(),
            {
              transform: [
                { translateX: pos.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
              ],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

/** An on/off setting: the label at the left, the switch at the right, 44 tall. */
export function Toggle({
  label,
  value,
  onChange,
  inList = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  /** Inside a Group: padded like a list row. */
  inList?: boolean;
}) {
  return (
    <View style={[styles.toggle, inList && styles.rowPad]}>
      <T style={{ flex: 1 }}>{label}</T>
      <SwitchControl value={value} onValueChange={onChange} label={label} />
    </View>
  );
}

/** A round check (maintenance checklist items, Getting Started): a ring, or green with a tick. */
export function Check({ done }: { done: boolean }) {
  return (
    <View
      style={[
        styles.check,
        done
          ? { backgroundColor: color.pass, borderColor: color.pass }
          : { borderColor: color.controlBorder },
      ]}
    >
      {done ? <Icon name="checkmark" size={14} color={color.onPrimary} weight="bold" /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inset grouped lists (spec 3.4): one rounded block, hairlines between rows that start where
// the text does, chevrons on rows that open another screen.
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
    <View style={[styles.group, { backgroundColor: color.surface }, style]}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? (
            <View
              style={[
                styles.separator,
                { marginLeft: separatorInset, backgroundColor: color.separator },
              ]}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** The row chevron: "›" in the muted color at 70%. */
export function Chevron() {
  const c = tint(color.textMuted, 0.7);
  return ios ? (
    <Icon name="chevron" size={14} weight="semibold" color={c} />
  ) : (
    <WebIcon name="chevronRight" size={18} color={c} strokeWidth={2} />
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
  leadingAction,
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  /** Right-aligned value ("Tech · Tony Tech"). */
  detail?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Defaults to on for rows that open something. */
  chevron?: boolean;
  /** A row that is itself an action: "link" (blue) or "destructive" (red, centered). */
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
  /**
   * Swipe right for a blue action (Unread in Messages), plus the same accessibility action.
   * Not for rows that also delete.
   */
  leadingAction?: { label: string; onPress: () => void };
  /** Free-form content in place of title and subtitle. */
  children?: ReactNode;
}) {
  const action = tone !== "default";
  const showChevron = Boolean(onPress) && (chevron ?? !action);
  const body = (
    <>
      {leading}
      <View style={styles.rowBody}>
        {children ?? (
          <>
            {title ? (
              <T
                style={[
                  tone === "link" && { color: color.link },
                  tone === "destructive" && { color: color.fail, textAlign: "center" },
                ]}
              >
                {title}
              </T>
            ) : null}
            {typeof subtitle === "string" ? (
              <T variant="secondary" muted>
                {subtitle}
              </T>
            ) : (
              subtitle
            )}
          </>
        )}
      </View>
      {typeof detail === "string" ? (
        <T muted style={styles.rowDetail}>
          {detail}
        </T>
      ) : (
        detail
      )}
      {trailing}
      {showChevron ? <Chevron /> : null}
    </>
  );
  const a11yAction = onDelete
    ? {
        accessibilityActions: [{ name: "delete", label: deleteLabel }],
        onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
          if (e.nativeEvent.actionName === "delete") onDelete();
        },
      }
    : leadingAction
      ? {
          accessibilityActions: [{ name: "leading", label: leadingAction.label }],
          onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
            if (e.nativeEvent.actionName === "leading") leadingAction.onPress();
          },
        }
      : null;
  const swipeable = Boolean(onDelete || leadingAction);
  const swipe = (row: ReactNode) =>
    onDelete ? (
      <SwipeToDelete label={deleteLabel} onDelete={onDelete}>
        {row}
      </SwipeToDelete>
    ) : leadingAction ? (
      <SwipeLeading label={leadingAction.label} onPress={leadingAction.onPress}>
        {row}
      </SwipeLeading>
    ) : (
      row
    );
  if (!onPress)
    return swipe(
      <View
        style={[
          styles.listRow,
          styles.rowPad,
          // A swipeable row slides over its action, so it needs its own background.
          swipeable && { backgroundColor: color.surface },
        ]}
        accessible={swipeable || undefined}
        {...a11yAction}
      >
        {body}
      </View>,
    );
  return swipe(
    <Pressable
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      {...a11yAction}
      onPress={onPress}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => [
        styles.listRow,
        styles.rowPad,
        swipeable && { backgroundColor: color.surface },
        // A tapped row: the text color at 6%; Android ripples instead.
        pressed && Platform.OS !== "android" && { backgroundColor: color.rowPressed },
      ]}
    >
      {body}
    </Pressable>,
  );
}

// ---------------------------------------------------------------------------
// Grouped forms (spec 3.14 "Grouped fields"): fields as rows of an inset grouped list, the
// label at a fixed width on the left and the field filling the rest, on every platform.
// ---------------------------------------------------------------------------

/** Width of the leading labels in a FieldGroup, so the fields line up. */
const LabelWidth = createContext(112);

export function FieldGroup({
  title,
  footer,
  labelWidth = 112,
  children,
}: {
  /** The section label above the block. */
  title?: string;
  /** A note under the block. */
  footer?: string;
  /** Width of the rows' leading labels (at the default text size). */
  labelWidth?: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      {title ? <T variant="sectionLabel">{title}</T> : null}
      <LabelWidth.Provider value={labelWidth}>
        <Group>{children}</Group>
      </LabelWidth.Provider>
      {footer ? (
        <View style={styles.footer}>
          <T variant="footnote" muted>
            {footer}
          </T>
        </View>
      ) : null}
    </View>
  );
}

const NUMERIC_KEYBOARDS = new Set(["decimal-pad", "number-pad", "numeric", "phone-pad"]);

/**
 * A text field as a row of a FieldGroup: the label leads at a fixed width and the borderless
 * field fills the rest. `layout`:
 * - "inline" (default): label, then the field.
 * - "stacked": the label in small type above the field, for long labels or placeholders.
 * - "full": no visible label; the field fills the row and the label is its placeholder (or
 *   the group's header names it). Multiline fields default to this.
 * At the largest text sizes inline rows stack, so labels never squeeze the field.
 * `next` moves to that field on Return (or the Next button above an iPhone number pad).
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
  /** A one-value field whose text wraps instead of scrolling sideways. */
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

  const multiline = Boolean(input.multiline);
  const mode = layout ?? (multiline ? "full" : "inline");
  const shown = mode === "inline" && fontScale >= 1.35 ? "stacked" : mode;
  const numeric = ios && NUMERIC_KEYBOARDS.has(String(input.keyboardType ?? ""));
  const scaledWidth = labelWidth * Math.min(fontScale, 1.35);

  const field = (
    <TextInput
      ref={setRef}
      placeholderTextColor={color.placeholder}
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
        { color: color.text },
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
            style={[type.body, { color: color.text, width: scaledWidth }]}
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
              style={[type.secondary, { color: color.textMuted }]}
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
        <T variant="secondary" style={{ color: color.fail }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="secondary" muted>
          {hint}
        </T>
      ) : null}
      {numeric ? (
        // Number pads have no Return key: a bar above them moves on or closes the keyboard.
        <InputAccessoryView nativeID={accessoryId} backgroundColor={color.bg}>
          <View style={[styles.accessory, { borderTopColor: color.separator }]}>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={styles.headerButton}
              onPress={() => (next ? next.current?.focus() : Keyboard.dismiss())}
            >
              <Text style={[type.body, face.semiBold, { color: color.link }]}>
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
 * opens an action sheet of the choices. Android: the pills (Choice) until the drawn dropdown
 * menu lands with the forms' restyle.
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
      <View style={[styles.field, styles.rowPad]}>
        <Choice label={label} options={options} value={value} onChange={onChange} />
        {error ? (
          <T variant="secondary" style={{ color: color.fail }}>
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
          <T variant="secondary" style={{ color: color.fail }}>
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

/** A row with an amount on the right: quote and invoice lines and totals. Use in a Group. */
export function AmountRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value?: string;
  strong?: boolean;
}) {
  const v = strong ? "bodyEmphasis" : "body";
  return (
    <View style={[styles.listRow, styles.rowPad]}>
      <T variant={v} style={{ flex: 1 }}>
        {label}
      </T>
      {value ? (
        <T variant={v} style={[styles.amount, tabular]}>
          {value}
        </T>
      ) : null}
    </View>
  );
}

/** A status label: a solid capsule in the status color (spec 3.6). */
export function Pill({
  label,
  color: bg,
  style,
}: {
  label: string;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      <Text
        style={[styles.chipText, { color: color.onStatus }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {label}
      </Text>
    </View>
  );
}

/** A job's status chip: the word on its status color (spec 3.6). */
export function StatusChip({ status, style }: { status: JobStatus; style?: StyleProp<ViewStyle> }) {
  return <Pill label={JOB_STATUS_LABELS[status]} color={jobStatusColor(status)} style={style} />;
}

/**
 * A titled part of a screen with an optional note, holding grouped rows and buttons: the
 * section label, the note, then the content.
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
  return (
    <View style={styles.section}>
      {title || action ? (
        <View style={styles.sectionHead}>
          {title ? (
            <View style={{ flexShrink: 1 }}>
              <T variant="sectionLabel">{title}</T>
            </View>
          ) : null}
          {action}
        </View>
      ) : null}
      {note ? (
        <T variant="secondary" muted>
          {note}
        </T>
      ) : null}
      {children}
    </View>
  );
}

/**
 * A navigation bar button: text (Cancel, Save) or an icon. "+" (add) and compose are the
 * website's round 44 pt buttons.
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
  icon?: IconName | "compose";
  onPress: () => void;
  /** The confirming action (Save, Done) is semibold, as on iOS. */
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
      hitSlop={4}
      style={({ pressed }) => [
        styles.headerButton,
        icon && styles.headerIcon,
        pressed && icon && { backgroundColor: color.iconTint },
        pressed && !icon && { opacity: 0.5 },
        disabled && { opacity: 0.4 },
      ]}
    >
      {icon === "add" || icon === "compose" ? (
        <WebIcon
          name={icon === "add" ? "plus" : "compose"}
          size={24}
          color={color.link}
          strokeWidth={2.2}
        />
      ) : icon ? (
        <Icon name={icon} size={22} color={color.link} weight="medium" />
      ) : (
        <Text
          style={[type.body, strong && face.semiBold, { color: color.link }]}
          maxFontSizeMultiplier={1.6}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Blocks on a screen are 24 apart (spec 2.4).
  stack: { gap: space["5"] },
  titleBlock: { gap: space["1"], marginBottom: -space["2"] },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space["3"],
    marginTop: space["3"],
  },
  card: { borderRadius: shape.card, gap: space["2"] },
  section: { gap: space["2"] },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space["2"],
  },
  footer: { paddingHorizontal: space["4"] },
  notice: {
    borderRadius: shape.block,
    paddingTop: space["3"],
    paddingBottom: space["3"],
    paddingRight: space["4"],
    paddingLeft: space["5"],
    gap: space["1"],
  },
  noticeBar: {
    position: "absolute",
    left: 10,
    top: space["3"],
    bottom: space["3"],
    width: 4,
    borderRadius: 2,
  },
  empty: { borderRadius: shape.block, padding: space["5"], alignItems: "center" },
  button: {
    minHeight: minTap,
    borderRadius: shape.pill,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space["2"],
    overflow: "hidden",
  },
  buttonSmall: { paddingHorizontal: space["3"] },
  buttonText: { ...face.semiBold, fontSize: 17, lineHeight: 22 },
  buttonTextSmall: { ...face.semiBold, fontSize: 15, lineHeight: 20 },
  round: {
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pillScroller: { marginHorizontal: -gutter, flexGrow: 0 },
  pillRow: { paddingHorizontal: gutter, gap: space["2"] },
  pill: {
    minHeight: minTap,
    paddingHorizontal: space["4"],
    borderRadius: shape.pill,
    justifyContent: "center",
    overflow: "hidden",
  },
  field: { gap: space["1"] },
  input: {
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    paddingVertical: space["2"],
    ...face.regular,
    fontSize: 17,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  search: {
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingLeft: space["3"],
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
  },
  searchInput: { flex: 1, minHeight: minTap, ...face.regular, fontSize: 17, paddingVertical: 0 },
  clear: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  track: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderRadius: shape.segmentTrack,
    padding: 2,
    gap: 2,
  },
  thumb: { position: "absolute", borderRadius: shape.segmentTrack - 2 },
  segment: {
    minHeight: 40,
    borderRadius: shape.segmentTrack - 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space["4"],
  },
  switchSegment: {
    minHeight: minTap,
    borderRadius: shape.segmentTrack - 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space["1"],
  },
  switchText: { ...face.medium, fontSize: 13, lineHeight: 18 },
  switchTextOn: { ...face.semiBold, fontSize: 13, lineHeight: 18 },
  segmentBadge: {
    position: "absolute",
    top: -4,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBadgeText: {
    ...face.semiBold,
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ["tabular-nums"],
  },
  toggle: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space["3"],
  },
  switchTrack: { width: 51, height: 31, borderRadius: 15.5, padding: 2 },
  switchKnob: { width: 27, height: 27, borderRadius: 13.5 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: shape.pill,
    alignSelf: "flex-start",
  },
  chipText: { ...face.semiBold, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: space["3"] },
  headerButton: {
    minHeight: minTap,
    minWidth: minTap,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerIcon: { width: minTap, borderRadius: minTap / 2, paddingHorizontal: 0 },
  group: { borderRadius: shape.grouped, overflow: "hidden" },
  separator: { height: StyleSheet.hairlineWidth },
  listRow: { minHeight: minTap, flexDirection: "row", alignItems: "center", gap: space["3"] },
  rowPad: { paddingHorizontal: space["4"], paddingVertical: 10 },
  rowBody: { flex: 1, gap: 2 },
  rowDetail: { textAlign: "right", flexShrink: 1 },
  amount: { textAlign: "right" },
  formRow: { paddingHorizontal: space["4"], minHeight: minTap, justifyContent: "center" },
  formRowStacked: { paddingTop: 10, paddingBottom: 6, gap: 2 },
  formRowNote: { paddingBottom: 10 },
  formInline: { flexDirection: "row", alignItems: "center", gap: space["3"] },
  rowInput: {
    flex: 1,
    minHeight: minTap,
    paddingVertical: 0,
    ...face.regular,
    fontSize: 17,
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
  },
});
