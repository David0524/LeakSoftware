/**
 * Intl.DateTimeFormat, built once per locale and options. Building one is slow (about 0.1 ms),
 * and lists format a date per row: the phone's job list grouped 9,000 jobs in 0.8 s, almost
 * all of it spent building formatters.
 */
const formats = new Map<string, Intl.DateTimeFormat>();

export function dateFormat(
  locale?: string,
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let f = formats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formats.set(key, f);
  }
  return f;
}
