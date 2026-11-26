// Compliance matrix rules: every Section L requirement maps to a section, every Section M factor and subfactor
// traces to one, and Gold team does not start with Open or Gap items on the books.

import { toCsv } from "./exports.ts";
import { nodePath, personName } from "./model.ts";
import type { OutlineNode, Pursuit, ReqSource, ReqStatus, ReqType, Requirement, Volume } from "./model.ts";
import type { SheetSpec } from "./xlsx.ts";

export const isFactor = (item: Requirement): boolean => item.type === "evaluation factor" || item.type === "subfactor";

/** A status of N/A stands only with a reason. Without one the item still counts as open. */
export const naMissingReason = (item: Requirement): boolean => item.status === "N/A" && !item.naReason.trim();
export const isSettledNa = (item: Requirement): boolean => item.status === "N/A" && !naMissingReason(item);

/** "Unmapped" for a Section L requirement with no section, "Untraced" for a Section M factor or subfactor with none. */
export function mappingFlag(item: Requirement): "Unmapped" | "Untraced" | null {
  if (item.sectionIds.length || isSettledNa(item)) return null;
  if (item.source === "L") return "Unmapped";
  if (item.source === "M" && isFactor(item)) return "Untraced";
  return null;
}

export interface Coverage {
  total: number;
  /** Total less the items marked N/A with a reason. */
  applicable: number;
  /** Addressed or Verified compliant. */
  covered: number;
  percent: number | null;
  open: number;
  gap: number;
  addressed: number;
  verified: number;
  na: number;
}

export function coverageOf(items: readonly Requirement[]): Coverage {
  const na = items.filter(isSettledNa).length;
  const addressed = items.filter(item => item.status === "Addressed").length;
  const verified = items.filter(item => item.status === "Verified compliant").length;
  const gap = items.filter(item => item.status === "Gap").length;
  const applicable = items.length - na;
  return {
    total: items.length, applicable, covered: addressed + verified, addressed, verified, gap, na,
    open: items.filter(item => item.status === "Open" || naMissingReason(item)).length,
    percent: applicable ? Math.round(((addressed + verified) / applicable) * 100) : null,
  };
}

export interface VolumeCoverage extends Coverage { volume: Volume | null; label: string }

/** Coverage for each volume, by the sections its requirements map to, and for the requirements mapped nowhere. */
export function coverageByVolume(pursuit: Pursuit): VolumeCoverage[] {
  const volumeOfNode = new Map(pursuit.outline.map(node => [node.id, node.volumeId]));
  const rows: VolumeCoverage[] = pursuit.volumes.map(volume => ({
    volume, label: volume.name,
    ...coverageOf(pursuit.requirements.filter(item => item.sectionIds.some(id => volumeOfNode.get(id) === volume.id))),
  }));
  const loose = pursuit.requirements.filter(item => !item.sectionIds.length);
  if (loose.length) rows.push({ volume: null, label: "Not mapped to a section", ...coverageOf(loose) });
  return rows;
}

export interface GoldGate { ready: boolean; open: number; gap: number; unmapped: number; untraced: number; total: number; reason: string }

/** Gold team readiness: no Open items and no Gap items. Unmapped and untraced items are reported beside the gate. */
export function goldGate(pursuit: Pursuit): GoldGate {
  const coverage = coverageOf(pursuit.requirements);
  const unmapped = pursuit.requirements.filter(item => mappingFlag(item) === "Unmapped").length;
  const untraced = pursuit.requirements.filter(item => mappingFlag(item) === "Untraced").length;
  const ready = coverage.total > 0 && coverage.open === 0 && coverage.gap === 0;
  const reason = !coverage.total ? "The matrix is empty."
    : ready ? "No Open or Gap items remain."
    : `${coverage.open} Open and ${coverage.gap} Gap ${coverage.open + coverage.gap === 1 ? "item stands" : "items stand"} between this proposal and Gold team.`;
  return { ready, open: coverage.open, gap: coverage.gap, unmapped, untraced, total: coverage.total, reason };
}

export interface CrosswalkRow {
  key: string;
  l: Requirement | null;
  sections: OutlineNode[];
  m: Requirement[];
  flag: "Mapped" | "Unmapped" | "Untraced" | "No factor" | "N/A";
}

/**
 * The L-to-M crosswalk. Each Section L requirement meets the Section M factors and subfactors through the sections
 * they share. Factors that no Section L requirement reaches are listed after, so nothing in M drops out of sight.
 */
export function crosswalk(pursuit: Pursuit): CrosswalkRow[] {
  const nodes = new Map(pursuit.outline.map(node => [node.id, node]));
  const factors = pursuit.requirements.filter(item => item.source === "M" && isFactor(item));
  const reached = new Set<string>();
  const rows: CrosswalkRow[] = pursuit.requirements.filter(item => item.source === "L").map(l => {
    const sections = l.sectionIds.map(id => nodes.get(id)).filter((node): node is OutlineNode => Boolean(node));
    const m = factors.filter(factor => factor.sectionIds.some(id => l.sectionIds.includes(id)));
    m.forEach(factor => reached.add(factor.id));
    return { key: l.id, l, sections, m, flag: isSettledNa(l) ? "N/A" : !sections.length ? "Unmapped" : m.length ? "Mapped" : "No factor" };
  });
  for (const factor of factors) {
    if (reached.has(factor.id)) continue;
    const sections = factor.sectionIds.map(id => nodes.get(id)).filter((node): node is OutlineNode => Boolean(node));
    rows.push({ key: factor.id, l: null, sections, m: [factor], flag: isSettledNa(factor) ? "N/A" : sections.length ? "Mapped" : "Untraced" });
  }
  return rows;
}

export interface MatrixFilter {
  search: string;
  source: ReqSource | "all";
  status: ReqStatus | "all";
  type: ReqType | "all";
  volumeId: string;
  ownerId: string;
  flaggedOnly: boolean;
}

export const EMPTY_FILTER: MatrixFilter = { search: "", source: "all", status: "all", type: "all", volumeId: "all", ownerId: "all", flaggedOnly: false };

export function filterRequirements(pursuit: Pursuit, filter: MatrixFilter): Requirement[] {
  const needle = filter.search.trim().toLowerCase();
  const volumeOfNode = new Map(pursuit.outline.map(node => [node.id, node.volumeId]));
  return pursuit.requirements.filter(item => {
    if (filter.source !== "all" && item.source !== filter.source) return false;
    if (filter.status !== "all" && item.status !== filter.status) return false;
    if (filter.type !== "all" && item.type !== filter.type) return false;
    if (filter.ownerId !== "all" && item.ownerId !== filter.ownerId) return false;
    if (filter.volumeId !== "all" && !item.sectionIds.some(id => volumeOfNode.get(id) === filter.volumeId)) return false;
    if (filter.flaggedOnly && !mappingFlag(item) && item.status !== "Gap" && !naMissingReason(item)) return false;
    if (!needle) return true;
    return [item.reqId, item.ref, item.text, item.comment, item.pageRef, item.naReason, personName(pursuit, item.ownerId)].some(value => value.toLowerCase().includes(needle));
  });
}

export type SortKey = "reqId" | "source" | "ref" | "text" | "type" | "sections" | "owner" | "status" | "pageRef";

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const STATUS_ORDER: ReqStatus[] = ["Gap", "Open", "Addressed", "Verified compliant", "N/A"];

export function sortRequirements(pursuit: Pursuit, items: readonly Requirement[], key: SortKey, descending: boolean): Requirement[] {
  const value = (item: Requirement): string => {
    switch (key) {
      case "sections": return mappedSectionsText(pursuit, item);
      case "owner": return personName(pursuit, item.ownerId);
      case "status": return String(STATUS_ORDER.indexOf(item.status));
      default: return item[key];
    }
  };
  const sorted = [...items].sort((a, b) => natural.compare(value(a), value(b)) || natural.compare(a.reqId, b.reqId));
  return descending ? sorted.reverse() : sorted;
}

export function mappedSectionsText(pursuit: Pursuit, item: Requirement, separator = "; "): string {
  const nodes = new Map(pursuit.outline.map(node => [node.id, node]));
  return item.sectionIds.map(id => nodes.get(id)).filter((node): node is OutlineNode => Boolean(node)).map(node => nodePath(pursuit, node)).join(separator);
}

export const MATRIX_COLUMNS = ["Req ID", "Source", "Paragraph ref", "Requirement text", "Type", "Mapped sections", "Owner", "Status", "N/A reason", "Proposal page ref", "Reviewer comment"] as const;

export function matrixRows(pursuit: Pursuit, items: readonly Requirement[]): string[][] {
  return items.map(item => [
    item.reqId, item.source, item.ref, item.text, item.type, mappedSectionsText(pursuit, item), personName(pursuit, item.ownerId),
    item.status, item.status === "N/A" ? item.naReason : "", item.pageRef, item.comment,
  ]);
}

export function matrixCsv(pursuit: Pursuit, items: readonly Requirement[]): string {
  return toCsv([[...MATRIX_COLUMNS], ...matrixRows(pursuit, items)]);
}

/** The matrix as a styled sheet. No icons and no status colors: the status is the word in its column. */
export function matrixSheet(pursuit: Pursuit, items: readonly Requirement[], exportedOn: string): SheetSpec {
  const widths = [10, 9, 14, 64, 16, 36, 20, 18, 28, 16, 40];
  return {
    sheetName: "Compliance matrix",
    title: `Compliance matrix: ${pursuit.name || "Untitled pursuit"}`,
    meta: [pursuit.solicitationNumber ? `Solicitation ${pursuit.solicitationNumber}` : "", pursuit.agency, `Exported ${exportedOn}`, `${items.length} ${items.length === 1 ? "requirement" : "requirements"}`].filter(Boolean).join(" / "),
    tableName: "ComplianceMatrix",
    columns: MATRIX_COLUMNS.map((header, index) => ({ header, width: widths[index] })),
    rows: matrixRows(pursuit, items),
    highlightRow: null,
  };
}
