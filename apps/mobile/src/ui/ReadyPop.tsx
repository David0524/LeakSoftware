import { useEffect, useState, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { useReduceMotion } from "./components";

/**
 * Mark Complete once it's the last thing (owner, 2026-10-22): a one-time scale-in with a small
 * overshoot when `on` turns true, as on the website; none with Reduce Motion.
 */
export function ReadyPop({
  on,
  children,
  style,
}: {
  on: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!on || reduceMotion) return;
    scale.setValue(0.94);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.03, duration: 300, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [on, reduceMotion, scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
