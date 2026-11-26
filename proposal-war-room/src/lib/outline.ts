// Outline operations: Volume > Section > Subsection. The outline is a flat list. A node's place among its siblings
// is its place in that list, so reordering never has to renumber anything.

import type { ISODate } from "./calendar.ts";
import { newNode } from "./model.ts";
import type { OutlineNode, Pursuit, Requirement } from "./model.ts";
import { defaultDueMilestone, sectionDueDate } from "./pursuit-ops.ts";

export const isSection = (node: OutlineNode): boolean => node.parentId === null;

export function siblingsOf(outline: readonly OutlineNode[], node: OutlineNode): OutlineNode[] {
  return outline.filter(item => item.volumeId === node.volumeId && item.parentId === node.parentId);
}

/** The outline in reading order: each volume's sections, each followed by its subsections. */
export function orderedOutline(pursuit: Pursuit): { node: OutlineNode; depth: 0 | 1; number: string }[] {
  const rows: { node: OutlineNode; depth: 0 | 1; number: string }[] = [];
  pursuit.volumes.forEach((volume, volumeIndex) => {
    const sections = pursuit.outline.filter(node => node.volumeId === volume.id && node.parentId === null);
    sections.forEach((section, sectionIndex) => {
      rows.push({ node: section, depth: 0, number: `${volumeIndex + 1}.${sectionIndex + 1}` });
      pursuit.outline.filter(node => node.parentId === section.id).forEach((child, childIndex) => {
        rows.push({ node: child, depth: 1, number: `${volumeIndex + 1}.${sectionIndex + 1}.${childIndex + 1}` });
      });
    });
  });
  return rows;
}

export function addSection(pursuit: Pursuit, volumeId: string, today: ISODate, title = "New section"): { pursuit: Pursuit; node: OutlineNode } {
  const node = newNode(volumeId, null, title, defaultDueMilestone(pursuit, today));
  return { pursuit: { ...pursuit, outline: [...pursuit.outline, node] }, node };
}

export function addSubsection(pursuit: Pursuit, sectionId: string, today: ISODate, title = "New subsection"): { pursuit: Pursuit; node: OutlineNode } | null {
  const parent = pursuit.outline.find(item => item.id === sectionId && item.parentId === null);
  if (!parent) return null;
  const node = { ...newNode(parent.volumeId, parent.id, title, parent.dueMilestone || defaultDueMilestone(pursuit, today)), ownerId: parent.ownerId, reviewerId: parent.reviewerId, dueDate: parent.dueDate };
  // The subsection goes after its section's last child, so the list stays in reading order.
  const lastIndex = pursuit.outline.reduce((last, item, index) => (item.id === parent.id || item.parentId === parent.id ? index : last), -1);
  const outline = [...pursuit.outline.slice(0, lastIndex + 1), node, ...pursuit.outline.slice(lastIndex + 1)];
  return { pursuit: { ...pursuit, outline }, node };
}

export function updateNode(pursuit: Pursuit, id: string, patch: Partial<OutlineNode>): Pursuit {
  return { ...pursuit, outline: pursuit.outline.map(node => (node.id === id ? { ...node, ...patch } : node)) };
}

/** Removes a node and, for a section, its subsections. Requirements mapped to them lose that mapping. */
export function removeNode(pursuit: Pursuit, id: string): Pursuit {
  const gone = new Set(pursuit.outline.filter(node => node.id === id || node.parentId === id).map(node => node.id));
  if (!gone.size) return pursuit;
  const requirements: Requirement[] = pursuit.requirements.map(item => (item.sectionIds.some(sectionId => gone.has(sectionId)) ? { ...item, sectionIds: item.sectionIds.filter(sectionId => !gone.has(sectionId)) } : item));
  return { ...pursuit, outline: pursuit.outline.filter(node => !gone.has(node.id)), requirements };
}

/** Puts `id` just before or after `targetId`. Both have to share a volume and a parent. Subsections travel with their section. */
export function placeNode(pursuit: Pursuit, id: string, targetId: string, where: "before" | "after"): Pursuit {
  const node = pursuit.outline.find(item => item.id === id);
  const target = pursuit.outline.find(item => item.id === targetId);
  if (!node || !target || node.id === target.id || node.volumeId !== target.volumeId || node.parentId !== target.parentId) return pursuit;
  const block = (root: OutlineNode): OutlineNode[] => [root, ...pursuit.outline.filter(item => item.parentId === root.id)];
  const moving = block(node);
  const movingIds = new Set(moving.map(item => item.id));
  const rest = pursuit.outline.filter(item => !movingIds.has(item.id));
  const targetBlock = block(target).filter(item => !movingIds.has(item.id));
  const anchor = where === "before" ? rest.indexOf(targetBlock[0]) : rest.indexOf(targetBlock[targetBlock.length - 1]) + 1;
  return { ...pursuit, outline: [...rest.slice(0, anchor), ...moving, ...rest.slice(anchor)] };
}

/** Moves a node one place up or down among its siblings. */
export function moveNode(pursuit: Pursuit, id: string, direction: -1 | 1): Pursuit {
  const node = pursuit.outline.find(item => item.id === id);
  if (!node) return pursuit;
  const siblings = siblingsOf(pursuit.outline, node);
  const target = siblings[siblings.indexOf(node) + direction];
  return target ? placeNode(pursuit, id, target.id, direction === -1 ? "before" : "after") : pursuit;
}

/** Past its due date and not yet handed to a review. */
export function isOverdue(pursuit: Pursuit, node: OutlineNode, today: ISODate): boolean {
  const due = sectionDueDate(pursuit, node);
  return Boolean(due) && due < today && node.status !== "In review" && node.status !== "Final";
}

export interface Assignment { node: OutlineNode; role: "Owner" | "Reviewer" | "Owner and reviewer"; due: ISODate | ""; overdue: boolean; number: string; depth: 0 | 1 }

/** Every section a person owns or reviews, in outline order. An empty id returns the sections nobody owns. */
export function assignmentsFor(pursuit: Pursuit, personId: string, today: ISODate): Assignment[] {
  return orderedOutline(pursuit)
    .filter(({ node }) => (personId ? node.ownerId === personId || node.reviewerId === personId : !node.ownerId))
    .map(({ node, number, depth }) => ({
      node, number, depth,
      role: !personId || (node.ownerId === personId && node.reviewerId === personId) ? (personId ? "Owner and reviewer" : "Owner") : node.ownerId === personId ? "Owner" : "Reviewer",
      due: sectionDueDate(pursuit, node), overdue: isOverdue(pursuit, node, today),
    }));
}

/** Overdue sections by owner, most overdue first. The key "" holds sections with no owner. */
export function overdueByOwner(pursuit: Pursuit, today: ISODate): { ownerId: string; nodes: { node: OutlineNode; due: ISODate }[] }[] {
  const groups = new Map<string, { node: OutlineNode; due: ISODate }[]>();
  for (const { node } of orderedOutline(pursuit)) {
    if (!isOverdue(pursuit, node, today)) continue;
    const list = groups.get(node.ownerId) ?? [];
    list.push({ node, due: sectionDueDate(pursuit, node) as ISODate });
    groups.set(node.ownerId, list);
  }
  return [...groups].map(([ownerId, nodes]) => ({ ownerId, nodes: nodes.sort((a, b) => (a.due < b.due ? -1 : 1)) })).sort((a, b) => b.nodes.length - a.nodes.length);
}

/** Removes a person from the roster and clears every assignment that pointed at them. */
export function removePerson(pursuit: Pursuit, personId: string): Pursuit {
  return {
    ...pursuit,
    roster: pursuit.roster.filter(person => person.id !== personId),
    outline: pursuit.outline.map(node => (node.ownerId === personId || node.reviewerId === personId ? { ...node, ownerId: node.ownerId === personId ? "" : node.ownerId, reviewerId: node.reviewerId === personId ? "" : node.reviewerId } : node)),
    requirements: pursuit.requirements.map(item => (item.ownerId === personId ? { ...item, ownerId: "" } : item)),
  };
}
