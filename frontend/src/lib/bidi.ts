/**
 * User-written text inside an English sentence built as a string — a
 * notification line, a toast, a sheet body — keeps its own direction when
 * wrapped in the Unicode isolate marks FSI … PDI, the plain-text twin of
 * `<bdi>` (docs/features/manual-test-fixes-1122.md §5.1). Without them a Hebrew
 * name's trailing punctuation jumps to the wrong side.
 */
export function isolate(text: string): string {
  return text ? `\u2068${text}\u2069` : text;
}
