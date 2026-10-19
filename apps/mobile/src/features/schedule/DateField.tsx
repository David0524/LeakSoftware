import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { dateFormat, formatDay } from "@leakbook/core";
import { Button, Field, T } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { color, face, MAX_TEXT_SCALE, minTap, shape, space } from "../../ui/theme";
import { DatePicker } from "./Calendar";

/** Today on this phone, as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Oct 19, 2026" (spec 3.14). */
function shown(d: string): string {
  return dateFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T12:00:00Z`));
}

/** YYYY-MM-DD as a local Date (noon, so no time zone moves it to another day). */
function toDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y!, m! - 1, day!, 12);
}

function fromDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A date field (New Job's Date, an invoice's Due date; spec 3.14): an outlined field showing the
 * date that opens the system picker: Android's date dialog, the iPhone's calendar in a sheet
 * (the drawn month calendar in the browser preview). No typing, so no date can be malformed.
 * `clearLabel` lets the date be empty.
 */
export function DateField({
  label,
  value,
  onChange,
  today = localToday(),
  min,
  placeholder = "Choose a date",
  hint,
  error,
  clearLabel,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  today?: string;
  min?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  /** e.g. "Due on Receipt": a button in the sheet that empties the date. */
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <View style={styles.field}>
      <T variant="bodyMedium">{label}</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${valid ? formatDay(value, "long") : placeholder}`}
        accessibilityHint={error ?? hint}
        onPress={() => {
          if (Platform.OS === "android") {
            DateTimePickerAndroid.open({
              value: toDate(valid ? value : today),
              mode: "date",
              minimumDate: min ? toDate(min) : undefined,
              onChange: (event, d) => {
                if (event.type === "set" && d) onChange(fromDate(d));
              },
            });
          } else setOpen(true);
        }}
        style={[
          styles.input,
          { backgroundColor: color.surface, borderColor: error ? color.fail : color.controlBorder },
        ]}
      >
        <Text
          style={[styles.text, { color: valid ? color.text : color.placeholder }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          numberOfLines={1}
        >
          {valid ? shown(value) : placeholder}
        </Text>
      </Pressable>
      {error ? (
        <T variant="secondary" style={{ color: color.fail }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="secondary" muted>
          {hint}
        </T>
      ) : null}
      <ModalSheet visible={open} onClose={() => setOpen(false)} title={label} cancel="Done">
        {Platform.OS === "ios" ? (
          <DateTimePicker
            value={toDate(valid ? value : today)}
            mode="date"
            display="inline"
            minimumDate={min ? toDate(min) : undefined}
            accentColor={color.link}
            onChange={(event, d) => {
              if (event.type === "set" && d) onChange(fromDate(d));
            }}
          />
        ) : (
          <DatePicker
            value={valid ? value : today}
            today={today}
            min={min}
            onChange={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
        )}
        {clearLabel && valid ? (
          <View style={{ marginTop: space["4"], alignItems: "flex-start" }}>
            <Button
              title={clearLabel}
              kind="secondary"
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
            />
          </View>
        ) : null}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space["1"] },
  input: {
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    justifyContent: "center",
  },
  text: { ...face.regular, fontSize: 17 },
});

/** "08:00" as "8:00 AM". */
function shownTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h! % 12 || 12}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`;
}

/**
 * A time field (New Job's Time): an outlined field showing "9:00 AM" that opens the system time
 * picker (Android's dialog, the iPhone's wheels in a sheet). The browser preview types it.
 * `value` is "HH:MM", 24-hour.
 */
export function TimeField({
  label,
  value,
  onChange,
  placeholder = "Choose a time",
  error,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const valid = /^\d{1,2}:\d{2}$/.test(value);
  const asDate = () => {
    const d = new Date();
    const [h, m] = (valid ? value : "09:00").split(":").map(Number);
    d.setHours(h!, m!, 0, 0);
    return d;
  };
  const fromTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (Platform.OS === "web") {
    return (
      <Field
        label={label}
        value={value}
        onChangeText={onChange}
        placeholder="09:00"
        error={error}
      />
    );
  }
  return (
    <View style={styles.field}>
      <T variant="bodyMedium">{label}</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${valid ? shownTime(value) : placeholder}`}
        accessibilityHint={error}
        onPress={() => {
          if (Platform.OS === "android") {
            DateTimePickerAndroid.open({
              value: asDate(),
              mode: "time",
              onChange: (event, d) => {
                if (event.type === "set" && d) onChange(fromTime(d));
              },
            });
          } else setOpen(true);
        }}
        style={[
          styles.input,
          { backgroundColor: color.surface, borderColor: error ? color.fail : color.controlBorder },
        ]}
      >
        <Text
          style={[styles.text, { color: valid ? color.text : color.placeholder }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          numberOfLines={1}
        >
          {valid ? shownTime(value) : placeholder}
        </Text>
      </Pressable>
      {error ? (
        <T variant="secondary" style={{ color: color.fail }}>
          {error}
        </T>
      ) : null}
      <ModalSheet visible={open} onClose={() => setOpen(false)} title={label} cancel="Done">
        <DateTimePicker
          value={asDate()}
          mode="time"
          display="spinner"
          minuteInterval={5}
          onChange={(event, d) => {
            if (event.type === "set" && d) onChange(fromTime(d));
          }}
        />
      </ModalSheet>
    </View>
  );
}
