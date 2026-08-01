import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Utility to export an HTML string or element to PDF with 100% Bengali & English Unicode support.
 * Uses html2canvas to render native browser font engine (supporting Hind Siliguri & Noto Sans Bengali)
 * and outputs a multi-page or single-page A4 PDF using jsPDF.
 */
export async function exportHtmlToPdf(htmlMarkup: string, fileName: string) {
  // Create offscreen container
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "800px";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.padding = "32px";
  container.style.boxSizing = "border-box";
  container.style.zIndex = "-9999";

  const fontStyles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      
      * {
        font-family: 'Hind Siliguri', 'Noto Sans Bengali', 'Inter', system-ui, -apple-system, sans-serif !important;
        box-sizing: border-box;
      }
      .font-mono {
        font-family: 'JetBrains Mono', monospace !important;
      }
      
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 8px 10px;
        text-align: left;
        font-size: 11px;
        border: 1px solid #e2e8f0;
      }
      th {
        background-color: #0f172a;
        color: #ffffff;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.5px;
      }
      tr:nth-child(even) {
        background-color: #f8fafc;
      }
    </style>
  `;

  container.innerHTML = fontStyles + htmlMarkup;
  document.body.appendChild(container);

  try {
    // Small delay to ensure WebFonts render completely
    await new Promise((resolve) => setTimeout(resolve, 250));

    const canvas = await html2canvas(container, {
      scale: 2, // High resolution capture
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 800,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.98);
    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 3) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    const cleanFileName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
    pdf.save(cleanFileName);
  } catch (err) {
    console.error("PDF export failed:", err);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}
