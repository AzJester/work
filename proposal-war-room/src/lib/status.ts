// Every status in the app is a word, and most carry an icon from the astrion-icons set. None carries a color:
// the Astrion palette has no status colors. This table is the one place a status meets its icon.

export type StatusTone = "complete" | "progress" | "attention" | "blocked" | "neutral";

export interface StatusStyle {
  /** Sprite symbol name, or null for a status shown as a word only. */
  icon: string | null;
  tone: StatusTone;
  /** The label is set in bold. */
  strong: boolean;
}

const TABLE: Record<string, StatusStyle> = {
  // Page budget
  "Within": { icon: "check", tone: "complete", strong: false },
  "Near limit": { icon: "status-attention", tone: "attention", strong: false },
  "Over": { icon: "status-blocked", tone: "blocked", strong: true },
  "No limit": { icon: null, tone: "neutral", strong: false },
  "No allocation": { icon: null, tone: "neutral", strong: false },
  "Not counted": { icon: null, tone: "neutral", strong: false },
  // Sections
  "Not started": { icon: null, tone: "neutral", strong: false },
  "Outlining": { icon: "status-in-progress", tone: "progress", strong: false },
  "Drafting": { icon: "status-in-progress", tone: "progress", strong: false },
  "In review": { icon: "color-review", tone: "progress", strong: false },
  "Final": { icon: "status-complete", tone: "complete", strong: false },
  "Overdue": { icon: "status-attention", tone: "attention", strong: true },
  // Compliance
  "Open": { icon: "status-in-progress", tone: "progress", strong: false },
  "Addressed": { icon: "check", tone: "complete", strong: false },
  "Verified compliant": { icon: "status-complete", tone: "complete", strong: false },
  "Gap": { icon: "status-blocked", tone: "blocked", strong: true },
  "N/A": { icon: null, tone: "neutral", strong: false },
  "Unmapped": { icon: "status-attention", tone: "attention", strong: false },
  "Untraced": { icon: "status-attention", tone: "attention", strong: false },
  "Mapped": { icon: "check", tone: "complete", strong: false },
  // Gates and schedule
  "Ready": { icon: "status-complete", tone: "complete", strong: false },
  "Not ready": { icon: "status-blocked", tone: "blocked", strong: true },
  "Compressed plan": { icon: "status-attention", tone: "attention", strong: false },
  "Conflict": { icon: "issue", tone: "blocked", strong: true },
  "Locked": { icon: "lock", tone: "neutral", strong: false },
  "Dropped": { icon: null, tone: "neutral", strong: false },
  "On plan": { icon: "check", tone: "complete", strong: false },
  "Done": { icon: "status-complete", tone: "complete", strong: false },
  "Today": { icon: "status-in-progress", tone: "progress", strong: true },
  "Upcoming": { icon: null, tone: "neutral", strong: false },
  // Questions for the contracting officer
  "Submitted": { icon: "submit", tone: "progress", strong: false },
  "Answered": { icon: "status-complete", tone: "complete", strong: false },
  // Parser confidence
  "High": { icon: null, tone: "neutral", strong: false },
  "Medium": { icon: null, tone: "neutral", strong: false },
  "Low": { icon: "status-attention", tone: "attention", strong: false },
  // Storage
  "Saved": { icon: "check", tone: "complete", strong: false },
  "Saving": { icon: "status-in-progress", tone: "progress", strong: false },
  "Not saved": { icon: "status-blocked", tone: "blocked", strong: true },
};

export function statusStyle(word: string): StatusStyle {
  return TABLE[word] ?? { icon: null, tone: "neutral", strong: false };
}

export const STATUS_WORDS: readonly string[] = Object.keys(TABLE);
