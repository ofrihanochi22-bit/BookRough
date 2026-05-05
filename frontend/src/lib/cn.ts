/**
 * `cn` — lightweight Tailwind class-name merger.
 *
 * Joins class strings and filters falsy values, enabling conditional classes
 * without pulling in the `clsx` + `tailwind-merge` combo.
 *
 * Usage:
 *   cn("px-4 py-2", isActive && "bg-blue-500", "rounded")
 *   // → "px-4 py-2 bg-blue-500 rounded"  (when isActive = true)
 *
 * For complex conditional merging with Tailwind conflict resolution, consider
 * adding `tailwind-merge` in a later phase.
 */
export function cn(...classes: (string | boolean | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
