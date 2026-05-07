import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

export interface AnalyticsExportData {
  filters: { from?: string; to?: string; category?: string; status?: string; officerIds?: number[] };
  totals: { grievances: number; mapped: number; unmapped: number };
  byWard: Array<{ wardId: number; name: string; nameTa: string | null; count: number; avgResolutionHours: number | null }>;
  byCategory: Array<{ category: string; count: number }>;
  byOfficer: Array<{ officerId: number; name: string; role: string | null; total: number; open: number }>;
  byStatus: Array<{ status: string; count: number }>;
  cachedAt: string;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Neutralize spreadsheet formula-injection: cells beginning with =, +, -, @,
  // tab, or CR are treated as formulas by Excel/Sheets/LibreOffice.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\r\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function filterSummary(f: AnalyticsExportData["filters"]): string {
  const parts: string[] = [];
  if (f.from) parts.push(`from=${f.from}`);
  if (f.to) parts.push(`to=${f.to}`);
  if (f.category) parts.push(`category=${f.category}`);
  if (f.status) parts.push(`status=${f.status}`);
  if (f.officerIds && f.officerIds.length > 0) parts.push(`officers=${f.officerIds.join("+")}`);
  return parts.length > 0 ? parts.join(", ") : "All grievances (no filters)";
}

export function exportAnalyticsCsv(data: AnalyticsExportData) {
  const sections: string[] = [];

  sections.push(`# Grievance analytics export`);
  sections.push(`# Generated: ${new Date().toISOString()}`);
  sections.push(`# Filters: ${filterSummary(data.filters)}`);
  sections.push("");

  sections.push("## Totals");
  sections.push(rowsToCsv(
    ["Metric", "Count"],
    [
      ["Total grievances", data.totals.grievances],
      ["Mapped to ward", data.totals.mapped],
      ["Unmapped", data.totals.unmapped],
    ],
  ));
  sections.push("");

  sections.push("## Per ward");
  sections.push(rowsToCsv(
    ["Ward ID", "Ward (English)", "Ward (Tamil)", "Grievances", "Avg resolution (hours)"],
    data.byWard.map(w => [w.wardId, w.name, w.nameTa ?? "", w.count, w.avgResolutionHours ?? ""]),
  ));
  sections.push("");

  sections.push("## Per category");
  sections.push(rowsToCsv(
    ["Category", "Grievances"],
    data.byCategory.map(c => [c.category, c.count]),
  ));
  sections.push("");

  sections.push("## Per status");
  sections.push(rowsToCsv(
    ["Status", "Grievances"],
    data.byStatus.map(s => [s.status, s.count]),
  ));
  sections.push("");

  sections.push("## Per officer");
  sections.push(rowsToCsv(
    ["Officer ID", "Name", "Role", "Total assigned", "Currently open"],
    data.byOfficer.map(o => [o.officerId, o.name, o.role ?? "", o.total, o.open]),
  ));

  const csv = "\uFEFF" + sections.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `grievance-analytics-${timestamp()}.csv`);
}

async function captureToImage(el: HTMLElement | null): Promise<string | null> {
  if (!el) return null;
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: "#ffffff",
      scale: 1.5,
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[analyticsExport] capture failed", err);
    return null;
  }
}

interface PdfSnapshotRefs {
  chartsEl?: HTMLElement | null;
  mapEl?: HTMLElement | null;
}

export async function exportAnalyticsPdf(data: AnalyticsExportData, refs: PdfSnapshotRefs) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Grievance analytics", margin, margin + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, margin + 22);
  const filterText = `Filters: ${filterSummary(data.filters)}`;
  const wrappedFilters = doc.splitTextToSize(filterText, pageWidth - margin * 2);
  doc.text(wrappedFilters, margin, margin + 36);
  doc.setTextColor(0);

  let cursorY = margin + 36 + wrappedFilters.length * 11 + 8;

  // KPI strip
  const kpiBoxW = (pageWidth - margin * 2 - 16) / 3;
  const kpiBoxH = 48;
  const kpis: Array<[string, string | number]> = [
    ["Total grievances", data.totals.grievances],
    ["Mapped", data.totals.mapped],
    ["Unmapped", data.totals.unmapped],
  ];
  kpis.forEach(([label, value], i) => {
    const x = margin + i * (kpiBoxW + 8);
    doc.setDrawColor(220);
    doc.setFillColor(248, 248, 250);
    doc.roundedRect(x, cursorY, kpiBoxW, kpiBoxH, 4, 4, "FD");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(label, x + 8, cursorY + 14);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text(String(value), x + 8, cursorY + 36);
    doc.setFont("helvetica", "normal");
  });
  cursorY += kpiBoxH + 18;

  // Charts snapshot
  const chartsImg = await captureToImage(refs.chartsEl ?? null);
  if (!chartsImg) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(180, 100, 0);
    doc.text("Chart snapshot unavailable.", margin, cursorY);
    doc.setTextColor(0);
    cursorY += 16;
  } else {
    const props = doc.getImageProperties(chartsImg);
    const maxW = pageWidth - margin * 2;
    const w = maxW;
    const h = (props.height * w) / props.width;
    const fitH = Math.min(h, pageHeight - margin - cursorY - 10);
    if (fitH < 120) {
      doc.addPage();
      cursorY = margin;
      const fullH = Math.min(h, pageHeight - margin * 2);
      doc.addImage(chartsImg, "PNG", margin, cursorY, w, fullH);
      cursorY += fullH + 14;
    } else {
      doc.addImage(chartsImg, "PNG", margin, cursorY, w, fitH);
      cursorY += fitH + 14;
    }
  }

  // Heatmap snapshot
  const mapImg = await captureToImage(refs.mapEl ?? null);
  doc.addPage();
  cursorY = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Grievance heatmap", margin, cursorY);
  cursorY += 14;
  if (data.totals.unmapped > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(180, 100, 0);
    doc.text(`${data.totals.unmapped} grievance(s) could not be mapped to a location.`, margin, cursorY);
    doc.setTextColor(0);
    cursorY += 14;
  }
  if (mapImg) {
    const props = doc.getImageProperties(mapImg);
    const maxW = pageWidth - margin * 2;
    const w = maxW;
    const h = (props.height * w) / props.width;
    const fitH = Math.min(h, pageHeight - margin - cursorY - 10);
    doc.addImage(mapImg, "PNG", margin, cursorY, w, fitH);
    cursorY += fitH + 14;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(180, 100, 0);
    doc.text("Heatmap snapshot unavailable.", margin, cursorY);
    doc.setTextColor(0);
    cursorY += 16;
  }

  // Tables
  const tableOpts = {
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [201, 24, 30] as [number, number, number], textColor: 255 },
    margin: { left: margin, right: margin },
  };

  doc.addPage();
  autoTable(doc, {
    ...tableOpts,
    startY: margin,
    head: [["Ward", "Tamil", "Grievances", "Avg resolution (h)"]],
    body: data.byWard.map(w => [
      w.name,
      w.nameTa ?? "",
      String(w.count),
      w.avgResolutionHours != null ? String(w.avgResolutionHours) : "—",
    ]),
    didDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Per ward", margin, margin - 12);
    },
  });

  autoTable(doc, {
    ...tableOpts,
    head: [["Category", "Grievances"]],
    body: data.byCategory.map(c => [c.category, String(c.count)]),
    didDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Per category", margin, margin - 12);
    },
  });

  autoTable(doc, {
    ...tableOpts,
    head: [["Officer", "Role", "Total", "Open"]],
    body: data.byOfficer.map(o => [o.name, o.role ?? "—", String(o.total), String(o.open)]),
    didDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Per officer", margin, margin - 12);
    },
  });

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 18, { align: "right" });
    doc.setTextColor(0);
  }

  doc.save(`grievance-analytics-${timestamp()}.pdf`);
}
