/**
 * Certificate Generation — PDF + shareable image (PNG).
 *
 * Uses pdf-lib for server-side PDF creation with elegant design.
 * The PNG is a rasterized version at 1200x1200 for social sharing.
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface CertificateData {
  studentName: string;
  courseTitle: string;
  completionDate: Date;
  certificateId: string;
}

// ── Brand Colors (fuchsia/pink theme) ──
const FUCHSIA = rgb(192 / 255, 38 / 255, 211 / 255);   // #C026D3
const DARK_PURPLE = rgb(88 / 255, 28 / 255, 135 / 255); // #581C87
const GOLD = rgb(217 / 255, 168 / 255, 74 / 255);       // #D9A84A
const LIGHT_GRAY = rgb(0.6, 0.6, 0.6);
const WHITE = rgb(1, 1, 1);
const NEAR_BLACK = rgb(0.15, 0.15, 0.15);

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Generate a PDF certificate (landscape A4, ~842 x 595 pts).
 */
export async function generateCertificatePDF(data: CertificateData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);

  const fontRegular = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const { width, height } = page.getSize();
  const cx = width / 2;

  // ── Background ──
  page.drawRectangle({ x: 0, y: 0, width, height, color: WHITE });

  // ── Decorative border (double line) ──
  const borderOuter = 20;
  const borderInner = 28;
  page.drawRectangle({
    x: borderOuter, y: borderOuter,
    width: width - borderOuter * 2, height: height - borderOuter * 2,
    borderColor: GOLD, borderWidth: 2,
  });
  page.drawRectangle({
    x: borderInner, y: borderInner,
    width: width - borderInner * 2, height: height - borderInner * 2,
    borderColor: FUCHSIA, borderWidth: 0.5, opacity: 0.3,
  });

  // ── Corner ornaments (small diamonds) ──
  const corners = [
    [borderOuter + 10, borderOuter + 10],
    [width - borderOuter - 10, borderOuter + 10],
    [borderOuter + 10, height - borderOuter - 10],
    [width - borderOuter - 10, height - borderOuter - 10],
  ];
  for (const [cx2, cy] of corners) {
    page.drawCircle({ x: cx2, y: cy, size: 3, color: GOLD });
  }

  // ── Top decorative line ──
  const lineY = height - 60;
  page.drawLine({
    start: { x: cx - 120, y: lineY },
    end: { x: cx + 120, y: lineY },
    thickness: 1.5, color: GOLD, opacity: 0.6,
  });

  // ── Academy name ──
  drawCentered(page, "HIGH HEELS DANCE ACADEMY", cx, height - 90, fontRegular, 11, GOLD, 4);

  // ── Title ──
  drawCentered(page, "Certificate of Completion", cx, height - 130, fontItalic, 32, DARK_PURPLE);

  // ── Decorative divider ──
  page.drawLine({
    start: { x: cx - 80, y: height - 150 },
    end: { x: cx + 80, y: height - 150 },
    thickness: 1, color: FUCHSIA, opacity: 0.4,
  });

  // ── "This is to certify that" ──
  drawCentered(page, "This is to certify that", cx, height - 185, fontItalic, 13, LIGHT_GRAY);

  // ── Student Name ──
  drawCentered(page, data.studentName, cx, height - 225, fontBold, 30, NEAR_BLACK);

  // ── Underline below name ──
  const nameWidth = fontBold.widthOfTextAtSize(data.studentName, 30);
  page.drawLine({
    start: { x: cx - nameWidth / 2 - 20, y: height - 235 },
    end: { x: cx + nameWidth / 2 + 20, y: height - 235 },
    thickness: 0.8, color: FUCHSIA, opacity: 0.3,
  });

  // ── "has successfully completed" ──
  drawCentered(page, "has successfully completed the course", cx, height - 270, fontItalic, 13, LIGHT_GRAY);

  // ── Course Title ──
  // Handle long titles by reducing font size
  let courseFontSize = 22;
  if (data.courseTitle.length > 40) courseFontSize = 18;
  if (data.courseTitle.length > 60) courseFontSize = 15;
  drawCentered(page, data.courseTitle, cx, height - 310, fontBold, courseFontSize, FUCHSIA);

  // ── Date ──
  drawCentered(page, formatDate(data.completionDate), cx, height - 355, fontRegular, 12, NEAR_BLACK);

  // ── Bottom section: Signature + Certificate ID ──
  const bottomY = 90;

  // Signature line (left)
  const sigLineX = cx - 140;
  const sigLineWidth = 160;
  page.drawLine({
    start: { x: sigLineX, y: bottomY },
    end: { x: sigLineX + sigLineWidth, y: bottomY },
    thickness: 0.8, color: NEAR_BLACK, opacity: 0.4,
  });
  drawCentered(page, "Elizabeth Zolotova", sigLineX + sigLineWidth / 2, bottomY + 15, fontItalic, 14, NEAR_BLACK);
  drawCentered(page, "Instructor", sigLineX + sigLineWidth / 2, bottomY - 15, fontRegular, 9, LIGHT_GRAY);

  // Date line (right)
  const dateLineX = cx + 0;
  page.drawLine({
    start: { x: dateLineX, y: bottomY },
    end: { x: dateLineX + sigLineWidth, y: bottomY },
    thickness: 0.8, color: NEAR_BLACK, opacity: 0.4,
  });
  drawCentered(page, formatDate(data.completionDate), dateLineX + sigLineWidth / 2, bottomY + 15, fontRegular, 11, NEAR_BLACK);
  drawCentered(page, "Date of Completion", dateLineX + sigLineWidth / 2, bottomY - 15, fontRegular, 9, LIGHT_GRAY);

  // ── Certificate ID ──
  drawCentered(page, `Certificate ID: ${data.certificateId}`, cx, 45, fontRegular, 8, LIGHT_GRAY);

  // ── Bottom decorative line ──
  page.drawLine({
    start: { x: cx - 120, y: 60 },
    end: { x: cx + 120, y: 60 },
    thickness: 1.5, color: GOLD, opacity: 0.6,
  });

  return pdf.save();
}

/**
 * Generate certificate data for the social sharing image.
 * Returns structured data that the client renders to canvas.
 * (Generating actual PNG server-side would require cairo/sharp — too heavy.
 *  Instead, we return data and the client uses html2canvas or a canvas-based approach.)
 */
export function getCertificateShareData(data: CertificateData) {
  return {
    studentName: data.studentName,
    courseTitle: data.courseTitle,
    completionDate: formatDate(data.completionDate),
    certificateId: data.certificateId,
    shareText: `I just completed "${data.courseTitle}" at High Heels Dance Academy! 🎉💃`,
    shareUrl: `https://www.elizabeth-zolotova.com/courses`,
  };
}

// ── Helper ──
function drawCentered(
  page: any,
  text: string,
  cx: number,
  y: number,
  font: any,
  size: number,
  color: any,
  charSpacing?: number,
) {
  const w = font.widthOfTextAtSize(text, size) + (charSpacing || 0) * text.length;
  page.drawText(text, {
    x: cx - w / 2,
    y,
    size,
    font,
    color,
    ...(charSpacing ? { characterSpacing: charSpacing } : {}),
  });
}
