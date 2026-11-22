import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { ApiError } from "../errors.ts";

const ink = "#102745";
const muted = "#425771";
const line = "#dbe5ef";
const accent = "#12688a";
const margin = 44;
const responseLimit = 4_500_000;
let font: Buffer | undefined;

export async function bankingPdf(
  title: string,
  draw: (doc: PDFKit.PDFDocument) => void,
) {
  font ??= readFileSync(
    new URL("../../assets/fonts/NotoSansBengali.ttf", import.meta.url),
  );
  const doc = new PDFDocument({
    size: "A4",
    margin,
    autoFirstPage: false,
    // Load the embedded font explicitly so the bundle needs no built-in AFM files.
    font: "",
    fontLayoutCache: false,
    info: { Title: title, Author: "BankBolt" },
  });
  doc.font(font);
  const chunks: Buffer[] = [];
  let bytes = 0;
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > responseLimit) {
        doc.destroy(
          new ApiError(
            413,
            "STATEMENT_TOO_LARGE",
            "Choose a shorter date range.",
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    doc.once("error", reject);
    doc.once("end", () => resolve(Buffer.concat(chunks)));
  });
  try {
    draw(doc);
    doc.end();
  } catch (error) {
    doc.destroy(
      error instanceof Error ? error : new Error("Could not generate PDF."),
    );
  }
  return result;
}

export function pdfPage(
  doc: PDFKit.PDFDocument,
  title: string,
  subtitle: string,
  page = 1,
) {
  doc.addPage();
  const width = doc.page.width - margin * 2;
  doc
    .fontSize(17)
    .fillColor(accent)
    .text("BankBolt", margin, margin, { lineBreak: false });
  doc.fontSize(9).fillColor(muted);
  const watermark = "SIMULATED BANKING";
  doc.text(
    watermark,
    doc.page.width - margin - doc.widthOfString(watermark),
    margin + 5,
    { lineBreak: false },
  );
  doc
    .fontSize(24)
    .fillColor(ink)
    .text(title, margin, margin + 35, { width });
  doc.moveDown(0.25).fontSize(10).fillColor(muted).text(subtitle, { width });
  doc.fontSize(9);
  const pageLabel = "Page " + page;
  doc.text(
    pageLabel,
    doc.page.width - margin - doc.widthOfString(pageLabel),
    doc.page.height - 33,
    { lineBreak: false },
  );
  doc.x = margin;
  doc.y = margin + 102;
}

export function pdfSection(doc: PDFKit.PDFDocument, label: string) {
  const width = doc.page.width - margin * 2;
  doc
    .moveTo(margin, doc.y)
    .lineTo(margin + width, doc.y)
    .strokeColor(line)
    .stroke();
  doc.y += 8;
  doc.fontSize(12).fillColor(ink).text(label, margin, doc.y, { width });
  doc.moveDown(0.35);
}

export function pdfField(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
) {
  const width = doc.page.width - margin * 2;
  doc.fontSize(9).fillColor(muted).text(label, margin, doc.y, { width });
  doc.fontSize(11).fillColor(ink).text(pdfPlainText(value), { width });
  doc.moveDown(0.35);
}

export function pdfPlainText(value: string) {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ");
}
