import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { Weather, WeatherKind } from "@leakbook/core";
import { color, face, MAX_TEXT_SCALE, type } from "../../ui/theme";

// The weather beside Today's date (spec 5.1): the website's icons (components/weather-badge.tsx),
// the temperature now, the conditions, and today's high.

const CLOUD_HIGH = "M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z";
const SMALL_CLOUD = "M9 20h8a3.2 3.2 0 0 0 .5-6.4A4.8 4.8 0 0 0 8.3 13 3.5 3.5 0 0 0 9 20z";

function Icon({ kind, day }: { kind: WeatherKind; day: boolean }) {
  switch (kind) {
    case "clear":
      return day ? (
        <>
          <Circle cx={12} cy={12} r={4} />
          <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : (
        <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
      );
    case "partly":
      return day ? (
        <>
          <Circle cx={9} cy={9} r={3.2} />
          <Path d="M9 2.5v1.5M3.5 9H2M4.4 4.4l1 1M13.6 4.4l-1 1" />
          <Path d={SMALL_CLOUD} />
        </>
      ) : (
        <>
          <Path d="M14 8.5A5.5 5.5 0 1 1 7 2.5a4.5 4.5 0 0 0 7 6z" />
          <Path d={SMALL_CLOUD} />
        </>
      );
    case "cloudy":
      return <Path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />;
    case "rain":
      return (
        <>
          <Path d={CLOUD_HIGH} />
          <Path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
        </>
      );
    case "storm":
      return (
        <>
          <Path d={CLOUD_HIGH} />
          <Path d="M13 15l-2.5 4h3L11 23" />
        </>
      );
    case "snow":
      return (
        <>
          <Path d={CLOUD_HIGH} />
          <Path d="M8 19h.01M12 19h.01M16 19h.01M10 22h.01M14 22h.01" strokeWidth={2.5} />
        </>
      );
    case "fog":
      return <Path d="M4 9h16M3 13h18M5 17h14" />;
    case "wind":
      return <Path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" />;
    case "dust":
      return <Path d="M4 8h12M2 12h18M6 16h12M18 8h.01M22 16h.01" />;
  }
}

export function WeatherBadge({ weather: w }: { weather: Weather }) {
  const label = `${w.tempF}°F, ${w.conditions}${w.highF != null ? `, high ${w.highF}°` : ""}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Weather: ${label}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}
    >
      <Svg
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color.text}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Icon kind={w.kind} day={w.isDaytime} />
      </Svg>
      <Text
        style={[type.body, { color: color.text, flexShrink: 1 }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        numberOfLines={1}
      >
        {/* One line: the icon says the conditions; TalkBack hears them (owner, 2026-10-21). */}
        <Text style={face.semiBold}>{w.tempF}°</Text>
        {w.highF != null ? (
          <Text style={{ color: color.textMuted }}> · High {w.highF}°</Text>
        ) : null}
      </Text>
    </View>
  );
}
