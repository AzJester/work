// Which icons may be drawn at 16 px. The astrion-icons skill holds every other group at 20 px or larger, because
// those glyphs carry detail that closes up below that. Copied from the skill's icon-groups.json: Interface and Documents.
export const SMALL_OK: ReadonlySet<string> = new Set([
  "add", "arrow-down", "arrow-left", "arrow-right", "arrow-up", "calendar", "check", "chevron-down", "chevron-left", "chevron-right",
  "chevron-up", "clock", "close", "collapse", "copy", "delete", "download", "edit", "email", "expand", "external-link", "filter",
  "grid-view", "help", "hidden", "home", "info", "link", "list-view", "menu", "more", "notification", "phone", "print", "refresh",
  "search", "settings", "share", "sort", "team", "upload", "user", "visible",
  "attachment", "compliance", "document", "lock", "milestone", "revision", "section",
]);

export type IconSize = 16 | 20 | 24 | 32;

/** The size an icon is drawn at: the size asked for, raised to 20 px for glyphs that do not hold at 16. */
export function iconSize(name: string, requested: IconSize = 20): IconSize {
  return requested === 16 && !SMALL_OK.has(name) ? 20 : requested;
}
