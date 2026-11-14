export async function loadSchoolLogo() {
  try {
    const response = await fetch('/logo-1.png');
    if (!response.ok) throw new Error('Logo unavailable');
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('School logo unavailable:', error);
    return null;
  }
}

// Coordinates scale with the document unit, so this also works for point-based PDFs.
export function drawSchoolHeader(doc, { logo, title, subtitle = '' }) {
  const scale = doc.internal.pageSize.getWidth() > 400 ? 72 / 25.4 : 1;
  const width = doc.internal.pageSize.getWidth();
  const x = value => value * scale;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, x(25), 'F');
  doc.setFillColor(40, 38, 80);
  doc.rect(0, 0, width, x(2), 'F');
  if (logo) doc.addImage(logo, 'PNG', x(14), x(5), x(44), x(15));
  else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 38, 80);
    doc.text('DAR-E-ARQAM SCHOOL', x(14), x(13));
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59);
  doc.text(title, width - x(14), x(10), { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
  if (subtitle) doc.text(subtitle, width - x(14), x(16), { align: 'right' });
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(x(0.2));
  doc.line(x(14), x(22), width - x(14), x(22));
}
