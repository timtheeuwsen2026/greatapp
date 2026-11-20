/**
 * A plain text PDF, written by hand: A4, Helvetica, wrapped lines, as many
 * pages as it needs. Enough for an agreement (Tim, 57: "Download agreement
 * (PDF)") without adding a PDF library to the build.
 *
 * Text is encoded in WinAnsi, the built-in encoding of the standard fonts, so
 * "€" and accented letters print; anything outside it becomes "?".
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;

export type PdfLine = { text: string; bold?: boolean; size?: number };

// WinAnsi code points for the characters above 0x7f that differ from Latin-1.
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99,
};

function encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    if (WIN_ANSI_EXTRA[char] !== undefined) bytes.push(WIN_ANSI_EXTRA[char]);
    else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (char === "×") bytes.push(0xd7);
    else bytes.push(63);
  }
  return bytes;
}

function escapeBytes(bytes: number[]): string {
  return bytes.map((byte) => {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) return `\\${String.fromCharCode(byte)}`;
    if (byte < 0x20 || byte > 0x7e) return `\\${byte.toString(8).padStart(3, "0")}`;
    return String.fromCharCode(byte);
  }).join("");
}

/** Average Helvetica glyph width is about half the font size. */
function wrap(text: string, size: number): string[] {
  const maxChars = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (size * 0.5));
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current ? `${current} ${word}` : word).length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderTextPdf(lines: PdfLine[]): Buffer {
  // Lay out into pages.
  const pages: string[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN;
  for (const line of lines) {
    const size = line.size ?? 10.5;
    const leading = size * 1.45;
    for (const part of wrap(line.text, size)) {
      if (y - leading < MARGIN) {
        pages.push([]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= leading;
      if (part) {
        pages[pages.length - 1].push(`BT /${line.bold ? "F2" : "F1"} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${escapeBytes(encode(part))}) Tj ET`);
      }
    }
  }

  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = add("");
  const pagesId = add("");
  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  for (const content of pages) {
    const stream = content.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
