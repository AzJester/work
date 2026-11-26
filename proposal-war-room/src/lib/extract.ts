// Text out of uploaded files. The file itself never leaves the browser: only the text the owner then chooses to run.

import { unzipFiles } from "./zip.ts";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (value: string): string => value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
  if (name[0] === "#") {
    const code = name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  }
  return ENTITIES[name.toLowerCase()] ?? whole;
});

/** The paragraphs of a Word document's main part, one per line. Tables read left to right, one row per line. */
export function documentXmlToText(xml: string): string {
  const lines: string[] = [];
  for (const row of xml.split(/<\/w:tr>/)) {
    const cells = row.split(/<\/w:tc>/);
    const inTable = cells.length > 1 && /<w:tr[ >]/.test(row);
    const paragraphs = (chunk: string): string[] => chunk.split(/<\/w:p>/).map(paragraph => {
      let text = "";
      for (const match of paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g)) {
        text += match[0].startsWith("<w:t") && !match[0].startsWith("<w:tab") ? decode(match[1] ?? "") : match[0].startsWith("<w:tab") ? "\t" : "\n";
      }
      return text;
    });
    if (inTable) {
      const before = row.slice(0, row.search(/<w:tr[ >]/));
      lines.push(...paragraphs(before).filter(line => line.trim()));
      const rowText = cells.map(cell => paragraphs(cell.slice(cell.search(/<w:tr[ >]/) >= 0 ? cell.search(/<w:tr[ >]/) : 0)).filter(line => line.trim()).join(" ")).filter(Boolean).join(" | ");
      if (rowText.trim()) lines.push(rowText);
    } else {
      lines.push(...paragraphs(row).filter(line => line.trim()));
    }
  }
  return lines.join("\n").replace(/[ \t]+\n/g, "\n").trim();
}

export async function docxToText(bytes: Uint8Array): Promise<string> {
  const [entry] = await unzipFiles(bytes, path => path === "word/document.xml");
  if (!entry) throw new Error("This file is not a Word document: it has no word/document.xml.");
  return documentXmlToText(new TextDecoder().decode(entry.data));
}

export interface PdfTextItem { str: string; hasEOL?: boolean; transform?: number[] }

/** Lines of one PDF page, rebuilt from its text items: a new line where the reader marks one or the baseline moves. */
export function pdfItemsToText(items: readonly PdfTextItem[]): string {
  let text = "";
  let lastY: number | null = null;
  for (const item of items) {
    const y = item.transform ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !text.endsWith("\n")) text += "\n";
    text += item.str;
    if (item.hasEOL && !text.endsWith("\n")) text += "\n";
    if (y !== null) lastY = y;
  }
  return text.replace(/[ \t]+\n/g, "\n").trim();
}
