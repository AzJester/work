// Page budget: allocations against the Section L limit, and current counts against both.
// Status is always a word. The thresholds come from the build specification: below 90 percent is Within,
// 90 to 100 percent is Near limit, above 100 percent is Over.

import type { OutlineNode, Pursuit, Volume } from "./model.ts";

export type BudgetStatus = "Within" | "Near limit" | "Over" | "No limit" | "No allocation" | "Not counted";

export function budgetStatus(current: number, basis: number | null): BudgetStatus | null {
  if (basis === null || basis <= 0) return null;
  const ratio = current / basis;
  if (ratio > 1) return "Over";
  if (ratio >= 0.9) return "Near limit";
  return "Within";
}

export const percentOf = (current: number, basis: number | null): number | null => (basis === null || basis <= 0 ? null : Math.round((current / basis) * 100));

/** Pages as a short number: whole when whole, one decimal otherwise. */
export function formatPages(value: number | null): string {
  if (value === null) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A section's own current page count: the number typed in, or words divided by words per page plus graphics pages. */
export function currentPagesOf(node: OutlineNode, wordsPerPage: number): number | null {
  if (node.countMode === "manual") return node.currentPages;
  if (node.wordCount === null && node.graphicsPages === null) return null;
  return (node.wordCount ?? 0) / Math.max(1, wordsPerPage) + (node.graphicsPages ?? 0);
}

const sum = (values: (number | null)[]): number | null => {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
};

/**
 * A section's allocation: its own number, or the sum of its subsections when it has none of its own.
 * A subsection's allocation is a share of its section's, so only sections count toward the volume.
 */
export function allocationOf(pursuit: Pursuit, node: OutlineNode): number | null {
  if (node.pages !== null || node.parentId !== null) return node.pages;
  return sum(pursuit.outline.filter(child => child.parentId === node.id).map(child => child.pages));
}

export interface NodeBudget {
  node: OutlineNode;
  depth: 0 | 1;
  /** A section with subsections: its current count is the sum of theirs. */
  rollup: boolean;
  /** The section, or the section above it, is left out of the page count. */
  excluded: boolean;
  allocation: number | null;
  /** True when the allocation shown is the sum of the subsections, because the section has none of its own. */
  allocationDerived: boolean;
  /** Pages the subsections allocate beyond their section's own allocation. */
  childrenOverBy: number;
  current: number | null;
  percent: number | null;
  status: BudgetStatus;
}

export interface VolumeBudget {
  volume: Volume;
  limit: number | null;
  /** Sum of the section allocations that count against the limit. */
  allocated: number;
  /** Pages allocated beyond the limit. Zero when the allocations fit or there is no limit. */
  overAllocatedBy: number;
  /** Current pages that count against the limit. */
  current: number;
  /** Current pages in excluded sections. */
  excludedCurrent: number;
  percent: number | null;
  status: BudgetStatus;
  /** True when the count comes from the volume's own box because no section counts yet. */
  manual: boolean;
  rows: NodeBudget[];
}

export function volumeBudget(pursuit: Pursuit, volume: Volume): VolumeBudget {
  const rows: NodeBudget[] = [];
  const sections = pursuit.outline.filter(node => node.volumeId === volume.id && node.parentId === null);
  let allocated = 0, current = 0, excludedCurrent = 0, counted = 0;
  const status = (excluded: boolean, pages: number | null, allocation: number | null): BudgetStatus => (excluded ? "Not counted" : budgetStatus(pages ?? 0, allocation) ?? "No allocation");
  for (const section of sections) {
    const children = pursuit.outline.filter(node => node.parentId === section.id);
    const childRows: NodeBudget[] = children.map(child => {
      const excluded = section.excluded || child.excluded;
      const pages = currentPagesOf(child, pursuit.wordsPerPage);
      return { node: child, depth: 1, rollup: false, excluded, allocation: child.pages, allocationDerived: false, childrenOverBy: 0, current: pages, percent: excluded ? null : percentOf(pages ?? 0, child.pages), status: status(excluded, pages, child.pages) };
    });
    const allocation = allocationOf(pursuit, section);
    const childAllocation = sum(childRows.filter(row => !row.excluded).map(row => row.allocation)) ?? 0;
    const pages = children.length ? sum(childRows.filter(row => !row.excluded).map(row => row.current)) : currentPagesOf(section, pursuit.wordsPerPage);
    rows.push({
      node: section, depth: 0, rollup: children.length > 0, excluded: section.excluded, allocation,
      allocationDerived: section.pages === null && allocation !== null,
      childrenOverBy: section.pages !== null && childAllocation > section.pages ? childAllocation - section.pages : 0,
      current: pages, percent: section.excluded ? null : percentOf(pages ?? 0, allocation), status: status(section.excluded, pages, allocation),
    }, ...childRows);
    const excludedPages = children.length ? sum(childRows.filter(row => row.excluded).map(row => row.current)) ?? 0 : section.excluded ? pages ?? 0 : 0;
    excludedCurrent += excludedPages;
    if (!section.excluded) {
      allocated += allocation ?? 0;
      current += pages ?? 0;
      counted += 1;
    }
  }
  const manual = counted === 0;
  if (manual) current = volume.manualPages ?? 0;
  const limit = volume.pageLimit;
  return {
    volume, limit, allocated, current, excludedCurrent, manual, rows,
    overAllocatedBy: limit !== null && allocated > limit ? allocated - limit : 0,
    percent: percentOf(current, limit),
    status: budgetStatus(current, limit) ?? "No limit",
  };
}

export function allVolumeBudgets(pursuit: Pursuit): VolumeBudget[] {
  return pursuit.volumes.map(volume => volumeBudget(pursuit, volume));
}

/** The volumes whose current count is past the Section L limit. Each one raises the alert at the top of the screen. */
export function volumesOverLimit(pursuit: Pursuit): VolumeBudget[] {
  return allVolumeBudgets(pursuit).filter(budget => budget.status === "Over");
}
