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
  useSyncExternalStore,
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
import type { NativeStackNavigationOptions } from "expo-router/native-stack";
import { useNavigationState, useRoute, useScrollToTop } from "expo-router/react-navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JOB_STATUS_LABELS, SAMPLE_PILL, type JobStatus } from "@leakbook/core";
import { tokens as sampleTokens } from "@leakbook/tokens";
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
import {
  BAR_HEIGHT,
  barState,
  setBarLogo,
  setBarRight,
  setLargeTitle,
  smallTitleOpacity,
  TITLE_HANDOFF,
  useBar,
} from "./Bar";
import { liquidGlass } from "./navigation";
import { BarLogo } from "./SundeckLogo";
import { haptics } from "./haptics";
import { Icon, type IconName } from "./Icon";
import { WebIcon, type WebIconName } from "./WebIcon";
import { SwipeActions, SwipeLeading, SwipeToDelete } from "./SwipeRow";
import { editRowMenu, type RowMenu } from "./editMenu";
import type { RowGestures } from "./RowMenu";
import { useNoSwipe } from "./SwipeNav";
import { TechDot } from "./TechDot";
import { FormKeyboardBar, KEYBOARD_BAR_HEIGHT, KeyboardAvoider, useKeyboardOpen } from "./keyboard";
import { chooseAction } from "./confirm";
import { phoneEdit } from "../lib/phoneTyping";

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

/** A scroll view's offset and sizes, in points. */
export interface ScrollMetrics {
  y: number;
  contentHeight: number;
  viewHeight: number;
}

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
  /** Extra room at the top for something pinned under the bar (the sync bar). */
  topInset?: number;
}

/**
 * What a scrolling screen needs for the large title: the header element to put first in its
 * content, and props for its scroll view (ScrollView, FlatList, SectionList). Screen uses it;
 * list screens call it themselves.
 */
export function useScreenChrome({
  title,
  subtitle,
  headerActions,
  headerRight,
  topInset = 0,
}: ScreenChrome) {
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const tabSpace = useContext(TabBarSpace);
  const ref = useRef<ScrollView>(null);
  useScrollToTop(ref);
  const bar = useBar(route.key);
  const large = Boolean(title);
  // No Back (a tab's root, the first screen in its stack): the logo has the bar's row, level
  // with the "+", and stays there as the pin mark once the page scrolls; the large title has
  // its own full-width row under the bar (owner, 2026-10-21).
  const first = useNavigationState((state) => state?.routes[0]?.key === route.key);
  const root = large && first && tabSpace > 0;
  // The page draws the large title: always with the drawn bar (Android), and on iPhone for a
  // tab's root, whose title the native bar can't put beside its buttons.
  const ownTitle = large && (drawnChrome || root);
  useEffect(() => {
    setLargeTitle(route.key, ownTitle);
  }, [route.key, ownTitle]);
  useEffect(() => {
    setBarLogo(route.key, root);
  }, [route.key, root]);

  // iPhone, a tab's root: the native bar keeps its logo and buttons but shows no large title
  // (the page draws it under the bar); its small title fades in as on Android.
  const nativeOwn = ios && root;
  const options: NativeStackNavigationOptions = {
    ...(title !== undefined ? { title } : null),
    ...(headerRight
      ? {
          headerRight: nativeOwn
            ? () => (
                <View
                  style={styles.barRight}
                  onLayout={(e) => setBarRight(route.key, e.nativeEvent.layout.width)}
                >
                  {headerRight()}
                </View>
              )
            : headerRight,
        }
      : null),
    // Drawn bar: transparent over the page while a large title is in it.
    ...(drawnChrome && large ? { headerTransparent: true } : null),
    ...(nativeOwn
      ? {
          headerLargeTitleEnabled: false,
          headerLeft: () => <BarLogo y={bar.y} />,
          headerTitle: ({ children }: { children: string }) => (
            <Animated.Text
              style={[type.navTitle, { color: color.text, opacity: smallTitleOpacity(bar) }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.6}
            >
              {children}
            </Animated.Text>
          ),
          headerBlurEffect: liquidGlass ? undefined : "systemChromeMaterial",
          scrollEdgeEffects: { top: "automatic" },
        }
      : null),
  };
  const hasOptions = Object.keys(options).length > 0;

  const header = (
    <>
      {hasOptions ? <Stack.Screen options={options} /> : null}
      {ownTitle || subtitle || headerActions ? (
        <View style={styles.titleBlock}>
          {ownTitle ? <LargeTitle title={title!} /> : null}
          {subtitle ? typeof subtitle === "string" ? <T muted>{subtitle}</T> : subtitle : null}
          {headerActions ? <View style={styles.headerActions}>{headerActions}</View> : null}
        </View>
      ) : null}
    </>
  );

  const onScroll =
    drawnChrome || nativeOwn
      ? Animated.event([{ nativeEvent: { contentOffset: { y: bar.y } } }], {
          useNativeDriver: false,
        })
      : undefined;

  const contentContainerStyle: ViewStyle = {
    paddingHorizontal: gutter,
    paddingTop: (ownTitle ? insets.top + BAR_HEIGHT : space["4"]) + topInset,
    paddingBottom: Math.max(space["7"], tabSpace),
  };

  return {
    header,
    ref,
    scrollProps: {
      onScroll: onScroll as ((e: NativeSyntheticEvent<NativeScrollEvent>) => void) | undefined,
      scrollEventThrottle: 16,
      // iOS: lets the large title collapse as the page scrolls. A tab's root draws its own
      // title under the bar, so the page starts at the top of the screen.
      contentInsetAdjustmentBehavior: nativeOwn ? ("never" as const) : ("automatic" as const),
      keyboardShouldPersistTaps: "handled" as const,
    },
    contentContainerStyle,
  };
}

/** The large title drawn in the page (spec 3.1), on its own full-width row under the bar. */
function LargeTitle({ title }: { title: string }) {
  return <T variant="largeTitle">{title}</T>;
}

export function Screen({
  children,
  scroll = true,
  scrollEnabled = true,
  refreshControl,
  footer,
  overlay,
  keyboardBar = false,
  scrollRef,
  onScrollMetrics,
  ...chrome
}: ScreenChrome & {
  /** iPhone's Previous, Next and Done bar over the keyboard (the Test and Finding sheets). */
  keyboardBar?: boolean;
  children: ReactNode;
  /** Drawn over the page, positioned by itself (the pinned sync bar). */
  overlay?: ReactNode;
  /**
   * A bar pinned under the page, above the keyboard when it is open (a sheet's Save, owner
   * 2026-10-20). The page scrolls above it.
   */
  footer?: ReactNode;
  scroll?: boolean;
  /** Turn scrolling off for a moment, e.g. while a finger draws on a pad. */
  scrollEnabled?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** The page's scroll view, for scrolling it from code (a held schedule stop near an edge). */
  scrollRef?: { current: ScrollView | null };
  /** The scroll offset and sizes as they change (the schedule's drag and drop). */
  onScrollMetrics?: (m: Partial<ScrollMetrics>) => void;
}) {
  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome(chrome);
  const headerHeight = useHeaderHeightSafe();
  // Once the large title has gone under the bar, the page keeps room to stay scrolled past it,
  // so folding something away (Schedule's map) never snaps the page to the top and flips the
  // title back to large (owner, 2026-10-20).
  const routeKey = useRoute().key;
  const holdTitle = drawnChrome && scroll && Boolean(chrome.title);
  const [collapsed, setCollapsed] = useState(false);
  const [viewHeight, setViewHeight] = useState(0);
  useEffect(() => {
    if (!holdTitle) return;
    const y = barState(routeKey).y;
    const id = y.addListener(({ value }) => setCollapsed(value >= TITLE_HANDOFF[1]));
    return () => y.removeListener(id);
  }, [holdTitle, routeKey]);
  const hold =
    holdTitle && collapsed && viewHeight > 0 ? { minHeight: viewHeight + TITLE_HANDOFF[1] } : null;
  useEffect(() => {
    if (scrollRef) scrollRef.current = ref.current;
  });
  const chromeScroll = scrollProps.onScroll;
  const body = scroll ? (
    <Animated.ScrollView
      ref={ref}
      {...scrollProps}
      {...(onScrollMetrics
        ? {
            onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
              if (typeof chromeScroll === "function") chromeScroll(e);
              onScrollMetrics({
                y: e.nativeEvent.contentOffset.y,
                contentHeight: e.nativeEvent.contentSize.height,
                viewHeight: e.nativeEvent.layoutMeasurement.height,
              });
            },
            onContentSizeChange: (_w: number, h: number) => onScrollMetrics({ contentHeight: h }),
          }
        : null)}
      onLayout={(e: { nativeEvent: { layout: LayoutRectangle } }) => {
        setViewHeight(e.nativeEvent.layout.height);
        onScrollMetrics?.({ viewHeight: e.nativeEvent.layout.height });
      }}
      contentContainerStyle={[contentContainerStyle, styles.stack, hold]}
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
    // Fields stay above the keyboard, edge to edge on Android too (owner, 2026-10-20).
    <KeyboardAvoider style={[styles.screen, { backgroundColor: color.bg }]}>
      {body}
      {overlay}
      {footer ? <ScreenFooter keyboardBar={keyboardBar}>{footer}</ScreenFooter> : null}
      {keyboardBar ? <FormKeyboardBar /> : null}
    </KeyboardAvoider>
  );
}

/** The bar under a page: the page's gray, a hairline above, clear of the home indicator. */
function ScreenFooter({ children, keyboardBar }: { children: ReactNode; keyboardBar: boolean }) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardOpen();
  // In a tab, the bar sits above the floating tab bar (56 items, border, 8 above it).
  const inTabs = useContext(TabBarSpace) > 0;
  const bottom = Math.max(insets.bottom, space["3"]);
  return (
    <View
      style={[
        styles.screenFooter,
        {
          backgroundColor: color.bg,
          borderTopColor: color.separator,
          // Over the keyboard: just above it (and above the iPhone keyboard bar).
          paddingBottom: keyboard ? space["2"] : inTabs ? space["2"] : bottom,
          marginBottom:
            keyboard && ios && keyboardBar
              ? KEYBOARD_BAR_HEIGHT
              : !keyboard && inTabs
                ? Math.max(12, insets.bottom) + 66
                : 0,
        },
      ]}
    >
      {children}
    </View>
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

/**
 * `onWater` and `onWaterTinted` sit on Today's water-blue card (owner, 2026-10-20): the main
 * button white with water-blue text, the others white at 18% with white text.
 */
type ButtonKind = "primary" | "secondary" | "quiet" | "danger" | "onWater" | "onWaterTinted";

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
    case "onWater":
      return { bg: color.paper, fg: color.water, dim: false };
    case "onWaterTinted":
      return { bg: tint(color.paper, 0.18), fg: color.paper, dim: false };
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
  accessibilityLabel,
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
  /** When the label alone doesn't say what it acts on ("Remove Skimmer 2"). */
  accessibilityLabel?: string;
}) {
  // Today's card buttons are 50 pt capsules that fill their share of the row and press in
  // (0.96 and 85%; no scale with Reduce Motion), as docs/design/2026-10-20-today-card.md.
  const card = kind === "onWater" || kind === "onWaterTinted";
  const reduceMotion = useReduceMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={card ? undefined : { color: color.ripple }}
      style={({ pressed }) => {
        const c = buttonColors(kind, pressed);
        return [
          styles.button,
          { backgroundColor: c.bg, alignSelf: wide || card ? "stretch" : "flex-start" },
          small && styles.buttonSmall,
          c.dim && { opacity: 0.9 },
          card && styles.buttonCard,
          card && pressed && { opacity: 0.85 },
          card && pressed && !reduceMotion && { transform: [{ scale: 0.96 }] },
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
  onWater = false,
}: {
  icon: WebIconName;
  label: string;
  onPress: () => void;
  /** On Today's water-blue card: white at 18% with a white icon. */
  onWater?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: color.ripple, borderless: true }}
      style={({ pressed }) => [
        styles.round,
        {
          backgroundColor: onWater
            ? tint(color.paper, pressed ? 0.28 : 0.18)
            : pressed
              ? color.tintedPressed
              : color.iconTint,
        },
      ]}
    >
      <WebIcon name={icon} size={20} color={onWater ? color.paper : color.link} />
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
  /** `dot`: a tech's color key, drawn as their dot before the name (team and week spec 3). */
  options: { value: V; label: string; dot?: string | null }[];
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
          dot={o.dot}
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
  dot,
  selected,
  onPress,
}: {
  label: string;
  dot?: string | null;
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
        dot !== undefined && styles.pillDot,
        { backgroundColor: selected ? color.primary : color.fill },
        pressed && !selected && { opacity: 0.7 },
      ]}
    >
      {dot !== undefined ? (
        <TechDot tech={dot} ring={selected ? color.onPrimary : undefined} />
      ) : null}
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
  // Typing and selecting text never change the job section (owner, 2026-10-20).
  const noSwipe = useNoSwipe();
  const phone = usePhoneTyping(input);
  return (
    <View style={styles.field}>
      <T variant="bodyMedium">{label}</T>
      <TextInput
        {...noSwipe}
        ref={ref}
        placeholderTextColor={color.placeholder}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        {...input}
        {...phone}
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

// Reduce Motion, read once for the whole app and shared by every control that moves.
let reduceMotionOn = false;
const reduceMotionListeners = new Set<() => void>();
let reduceMotionWatched = false;
function watchReduceMotion(listener: () => void) {
  reduceMotionListeners.add(listener);
  if (!reduceMotionWatched) {
    reduceMotionWatched = true;
    const set = (on: boolean) => {
      reduceMotionOn = on;
      reduceMotionListeners.forEach((l) => l());
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(set);
    AccessibilityInfo.addEventListener("reduceMotionChanged", set);
  }
  return () => {
    reduceMotionListeners.delete(listener);
  };
}

/** Whether the phone asks for less motion (Reduce Motion, or Android's Remove animations). */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(watchReduceMotion, () => reduceMotionOn);
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
  onReselect,
  compact = false,
}: {
  label?: string;
  options: { value: V; label: string; badge?: number }[];
  value: V | null;
  onChange: (v: V) => void;
  /** Tapping the chosen segment again (a checklist answer clears back to To do). */
  onReselect?: () => void;
  /** Tighter sides, for four answers across a phone's row. */
  compact?: boolean;
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
  // Hold the chosen segment and drag it along the track, as iOS 26's segmented controls do
  // (owner, 2026-10-19: "hold the slider/selector like a bubble and drag it around"): the
  // choice follows the finger and the segment lifts while held (the website's Segmented).
  const [held, setHeld] = useState(false);
  const holding = useRef(false);
  const dragging = useRef(false);
  const track = useRef<View>(null);
  const trackX = useRef(0);
  const measureTrack = () =>
    track.current?.measure((_x, _y, _w, _h, pageX) => {
      if (Number.isFinite(pageX)) trackX.current = pageX;
    });
  const segmentAt = (pageX: number): V | null => {
    const at = pageX - trackX.current;
    const hit = options.find((o) => {
      const l = layouts[o.value];
      return l && at >= l.x && at <= l.x + l.width;
    });
    return hit ? hit.value : null;
  };

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

  // Dragging the chosen segment never changes the job section (owner, 2026-10-20).
  const noSwipe = useNoSwipe();
  const control = (
    <View
      {...noSwipe}
      ref={track}
      onLayout={measureTrack}
      // A held chosen segment takes over the touch once it moves; then it follows the finger.
      onMoveShouldSetResponderCapture={() => holding.current}
      onResponderGrant={() => {
        dragging.current = true;
        measureTrack();
      }}
      onResponderMove={(e) => {
        const next = segmentAt(e.nativeEvent.pageX);
        if (next !== null && next !== value) {
          haptics.selection();
          onChange(next);
        }
      }}
      onResponderRelease={() => {
        dragging.current = holding.current = false;
        setHeld(false);
      }}
      onResponderTerminate={() => {
        dragging.current = holding.current = false;
        setHeld(false);
      }}
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
            held && !reduceMotion && { transform: [{ scale: 1.06 }] },
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
            onPressIn={() => {
              if (!on) return;
              holding.current = true;
              setHeld(true);
              measureTrack();
            }}
            onPressOut={() => {
              // Released without dragging (a drag hands the touch to the track instead, which
              // ends the press too: then the track lets go).
              setTimeout(() => {
                if (dragging.current || !holding.current) return;
                holding.current = false;
                setHeld(false);
              }, 0);
            }}
            onPress={() => {
              if (on) {
                if (!onReselect) return;
                haptics.selection();
                return onReselect();
              }
              haptics.selection();
              onChange(o.value);
            }}
            style={[
              switcher ? styles.switchSegment : styles.segment,
              compact && styles.segmentCompact,
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
              // One word never breaks across lines ("Freefor / m"): it shrinks to fit instead.
              numberOfLines={switcher || !o.label.includes(" ") ? 1 : 2}
              adjustsFontSizeToFit={switcher || !o.label.includes(" ")}
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
  disabled = false,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
  /** Shown but can't be changed (Team: your own switch). */
  disabled?: boolean;
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
        disabled={disabled}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
      />
    );
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
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
  onLongPress: holdProp,
  gestures,
  editMenu,
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
  /** Touch and hold: the row's menu (gestures spec section 12), with a light tap. */
  onLongPress?: () => void;
  /**
   * Swipe actions both ways, their accessibility actions and the menu (ui/RowMenu
   * rowGestures), in place of onDelete and leadingAction.
   */
  gestures?: RowGestures;
  /**
   * Touch and hold for Edit (the row's tap) and its delete (onDelete, which asks first), titled
   * with the row's name: settings lists and findings (gestures spec section 12).
   */
  editMenu?: { menu: RowMenu; title: string };
  /** Free-form content in place of title and subtitle. */
  children?: ReactNode;
}) {
  const onLongPress =
    holdProp ??
    (editMenu && onPress
      ? editRowMenu(editMenu.menu, editMenu.title, { onEdit: onPress, onDelete, deleteLabel })
      : undefined);
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
  const menuAction = onLongPress ? [{ name: "menu", label: "Show Actions" }] : [];
  const a11yAction = gestures
    ? {
        accessibilityActions: gestures.accessibilityActions,
        onAccessibilityAction: gestures.onAccessibilityAction,
      }
    : onDelete
      ? {
          accessibilityActions: [{ name: "delete", label: deleteLabel }, ...menuAction],
          onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
            if (e.nativeEvent.actionName === "delete") onDelete();
            if (e.nativeEvent.actionName === "menu") onLongPress?.();
          },
        }
      : leadingAction
        ? {
            accessibilityActions: [{ name: "leading", label: leadingAction.label }, ...menuAction],
            onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
              if (e.nativeEvent.actionName === "leading") leadingAction.onPress();
              if (e.nativeEvent.actionName === "menu") onLongPress?.();
            },
          }
        : onLongPress
          ? {
              accessibilityActions: menuAction,
              onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
                if (e.nativeEvent.actionName === "menu") onLongPress();
              },
            }
          : null;
  const longPress = gestures ? gestures.onLongPress : onLongPress;
  const swipeable = Boolean(
    onDelete || leadingAction || gestures?.leading || gestures?.trailing.length,
  );
  const swipe = (row: ReactNode) =>
    gestures && (gestures.leading || gestures.trailing.length) ? (
      <SwipeActions leading={gestures.leading} trailing={gestures.trailing}>
        {row}
      </SwipeActions>
    ) : onDelete ? (
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
  if (!onPress && !longPress)
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
      onLongPress={longPress}
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

/**
 * Phone fields (keyboardType "phone-pad") format as they're typed, "(602) 555-0142" (owner,
 * 2026-10-20; lib/phoneTyping.ts). The caret is put after the digit it was after for one
 * render, then left to the person again.
 */
function usePhoneTyping(input: TextInputProps): Partial<TextInputProps> {
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>();
  useEffect(() => {
    if (!selection) return;
    const timer = setTimeout(() => setSelection(undefined), 0);
    return () => clearTimeout(timer);
  }, [selection]);
  if (input.keyboardType !== "phone-pad" || !input.onChangeText) return {};
  const onChangeText = input.onChangeText;
  return {
    selection: selection ?? input.selection,
    onChangeText: (raw: string) => {
      const next = phoneEdit(String(input.value ?? ""), raw);
      if (next.text !== raw) setSelection({ start: next.caret, end: next.caret });
      onChangeText(next.text);
    },
  };
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

  const noSwipe = useNoSwipe();
  const phone = usePhoneTyping(input);
  const field = (
    <TextInput
      {...noSwipe}
      ref={setRef}
      placeholderTextColor={color.placeholder}
      clearButtonMode={multiline || wrap ? undefined : "while-editing"}
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
      inputAccessoryViewID={numeric ? accessoryId : undefined}
      {...flow}
      {...(wrap ? { multiline: true, submitBehavior: "blurAndSubmit" as const } : null)}
      {...input}
      {...phone}
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
  barRight: { flexDirection: "row", alignItems: "center" },
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
  buttonCard: { minHeight: 50, paddingHorizontal: space["4"] },
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
  pillDot: { flexDirection: "row", alignItems: "center", gap: space["2"] },
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
    // A held drag in the browser build doesn't select the labels.
    userSelect: "none",
  },
  thumb: { position: "absolute", borderRadius: shape.segmentTrack - 2 },
  segment: {
    minHeight: 40,
    borderRadius: shape.segmentTrack - 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space["4"],
  },
  screenFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: gutter,
    paddingTop: space["2"],
  },
  segmentCompact: { paddingHorizontal: space["1"] },
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

/**
 * The sample job's pill (owner, 2026-10-22: "clearly marked 'Sample' everywhere it shows"), on
 * its Today row, Jobs row, Schedule card and page, as the website.
 */
/** The Sample pill's fill: the status warning color, as the website's pill. */
const sampleColor = sampleTokens.color.status.warning;

export function SamplePill({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Pill label={SAMPLE_PILL} color={sampleColor} style={style} />;
}
