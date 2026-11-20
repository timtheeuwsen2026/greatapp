import { describe, expect, it } from "vitest";
import { renderTextPdf } from "../simplePdf";

describe("renderTextPdf", () => {
  it("writes a valid PDF with the text, euro sign included", () => {
    const pdf = renderTextPdf([{ text: "Venue agreement: TEST 1", bold: true, size: 15 }, { text: "Tickets €0.00, add-ons €1.00 per Coffee" }]);
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(raw).toContain("(Venue agreement: TEST 1) Tj");
    // € is 0x80 in WinAnsi, written as an octal escape.
    expect(raw).toContain("(Tickets \\2000.00, add-ons \\2001.00 per Coffee) Tj");
    // The xref offset points at the xref table.
    const startxref = Number(raw.match(/startxref\n(\d+)/)![1]);
    expect(raw.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("wraps long text and adds pages when it runs out of room", () => {
    const lines = Array.from({ length: 120 }, (_, i) => ({ text: `Line ${i} ${"word ".repeat(30)}` }));
    const raw = renderTextPdf(lines).toString("latin1");
    const pages = Number(raw.match(/\/Count (\d+)/)![1]);
    expect(pages).toBeGreaterThan(2);
  });
});
