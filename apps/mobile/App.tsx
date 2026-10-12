import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { fieldTheme } from "@leakbook/tokens";

// Placeholder shell. Real navigation, auth, and the local database arrive in milestone M3.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LeakBook</Text>
      <Text style={styles.subtitle}>Field app scaffold</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: fieldTheme.header,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: { color: fieldTheme.onHeader, fontSize: 32, fontWeight: "800" },
  subtitle: { color: fieldTheme.onHeader, opacity: 0.8, fontSize: 16 },
});
