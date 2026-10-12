import { PDFDocument, StandardFonts } from "pdf-lib";

/** Builds a text PDF: pages → paragraphs → lines (11pt, 13-unit line spacing, extra gap between paragraphs). */
export async function makePdf(pages, { title } = {}) {
  const pdf = await PDFDocument.create();
  if (title) pdf.setTitle(title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const paragraphs of pages) {
    const page = pdf.addPage([600, 800]);
    let y = 750;
    for (const lines of paragraphs) {
      for (const line of lines) {
        page.drawText(line, { x: 50, y, size: 11, font });
        y -= 13;
      }
      y -= 10;
    }
  }
  return Buffer.from(await pdf.save());
}
