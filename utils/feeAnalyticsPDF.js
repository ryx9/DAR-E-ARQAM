import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = value => Number(value || 0).toLocaleString('en-PK');

export async function exportFeeAnalyticsPDF({ students, withFee, noFee, avgFee, totalRev, minFee, maxFee, feeSlabs, classStats }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const generated = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  let logo = null;
  try {
    const response = await fetch('/logo-1.png');
    if (!response.ok) throw new Error('Logo unavailable');
    const blob = await response.blob();
    logo = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) { console.warn('Fee report logo unavailable:', error); }

  const header = () => {
    doc.setFillColor(40, 38, 80); doc.rect(0, 0, width, 2.5, 'F');
    if (logo) doc.addImage(logo, 'PNG', 14, 8, 53, 18);
    else { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(40, 38, 80); doc.text('DAR-E-ARQAM SCHOOL', 14, 17); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30, 41, 59);
    doc.text('FEE ANALYTICS', width - 14, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Generated ${generated}`, width - 14, 21, { align: 'right' });
    doc.setDrawColor(203, 213, 225); doc.line(14, 29, width - 14, 29);
  };
  const footer = () => {
    doc.setDrawColor(203, 213, 225); doc.line(14, height - 15, width - 14, height - 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text('DAR-E-ARQAM SCHOOL  |  Fee analytics', 14, height - 10);
    doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, width - 14, height - 10, { align: 'right' });
  };
  const tableStyle = {
    theme: 'grid', margin: { top: 36, left: 14, right: 14, bottom: 20 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, lineColor: [215, 222, 231], lineWidth: 0.15, textColor: [30, 41, 59] },
    headStyles: { fillColor: [40, 38, 80], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    footStyles: { fillColor: [235, 238, 244], textColor: [30, 41, 59], fontStyle: 'bold' },
    didDrawPage: () => { header(); footer(); },
  };

  header(); footer();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(15, 23, 42);
  doc.text('Monthly fee overview', 14, 39);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
  doc.text('Active students with a recorded monthly fee. Amounts in PKR.', 14, 45);

  const cards = [
    ['AVERAGE FEE', `Rs. ${fmt(avgFee)}`], ['MONTHLY FEE TOTAL', `Rs. ${fmt(totalRev)}`],
    ['STUDENTS WITH FEES', `${fmt(withFee.length)} / ${fmt(students.length)}`], ['FEE TIERS', String(feeSlabs.length)],
  ];
  cards.forEach(([label, value], index) => {
    const x = 14 + index * 46;
    doc.setFillColor(245, 247, 251); doc.roundedRect(x, 51, 43, 21, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139); doc.text(label, x + 3, 57);
    doc.setFontSize(10); doc.setTextColor(40, 38, 80); doc.text(value, x + 3, 66);
  });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
  doc.text(`Lowest: Rs. ${fmt(minFee)}    Highest: Rs. ${fmt(maxFee)}    Missing fee data: ${noFee.length} students`, 14, 79);

  const topSlabs = [...feeSlabs].sort((a, b) => b.count - a.count || a.fee - b.fee).slice(0, 8);
  const maxCount = Math.max(1, ...topSlabs.map(s => s.count));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59);
  doc.text('Fee distribution', 14, 91);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
  doc.text('Largest fee tiers by number of students', 14, 96);
  topSlabs.forEach((slab, index) => {
    const y = 104 + index * 9;
    doc.setFontSize(8); doc.setTextColor(71, 85, 105); doc.text(`Rs. ${fmt(slab.fee)}`, 14, y + 2);
    doc.setFillColor(235, 238, 244); doc.roundedRect(54, y - 2, 116, 5, 1, 1, 'F');
    doc.setFillColor(79, 70, 155); doc.roundedRect(54, y - 2, Math.max(1, 116 * slab.count / maxCount), 5, 1, 1, 'F');
    doc.setTextColor(30, 41, 59); doc.text(String(slab.count), 176, y + 2);
  });

  let y = 111 + topSlabs.length * 9;
  if (y > height - 48) { doc.addPage(); header(); footer(); y = 38; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59); doc.text('Fee tier detail', 14, y);
  autoTable(doc, { ...tableStyle, startY: y + 4,
    head: [['Monthly fee (PKR)', 'Students', '% with fee data', 'Monthly fee total (PKR)']],
    body: feeSlabs.map(s => [fmt(s.fee), s.count, `${(s.count / withFee.length * 100).toFixed(1)}%`, fmt(s.revenue)]),
    foot: [['TOTAL', withFee.length, '100.0%', fmt(totalRev)]],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 10;
  if (y > height - 45) { doc.addPage(); header(); footer(); y = 38; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59); doc.text('Class-wise summary', 14, y);
  autoTable(doc, { ...tableStyle, startY: y + 4,
    head: [['Class', 'Students', 'Average fee (PKR)', 'Monthly fee total (PKR)']],
    body: classStats.map(c => [c.name, c.count, fmt(c.avg), fmt(c.revenue)]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 10;
  classStats.forEach(cls => {
    if (y > height - 45) { doc.addPage(); header(); footer(); y = 38; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    doc.text(`${cls.name}  |  ${cls.count} students  |  Average Rs. ${fmt(cls.avg)}`, 14, y);
    autoTable(doc, { ...tableStyle, startY: y + 4,
      head: [['Monthly fee (PKR)', 'Students', '% of class', 'Monthly fee total (PKR)']],
      body: Object.entries(cls.slabs).sort(([a], [b]) => Number(a) - Number(b)).map(([fee, count]) => [fmt(fee), count, `${(count / cls.count * 100).toFixed(1)}%`, fmt(Number(fee) * count)]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 10;
  });
  doc.save(`Fee_Analytics_${new Date().toISOString().split('T')[0]}.pdf`);
}
