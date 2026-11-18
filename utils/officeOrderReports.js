import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { loadSchoolLogo } from './pdfBranding';

const PURPLE = [67, 44, 136];
const YELLOW = [255, 233, 0];
const MARGIN = 18;

const displayDate = value =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

const openPdf = doc => {
  const url = URL.createObjectURL(doc.output('blob'));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

const drawHeader = (doc, logo, order, continuation = false) => {
  const width = doc.internal.pageSize.getWidth();
  const right = width - MARGIN;
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, width, 44, 'F');
  doc.setFillColor(89, 69, 157);
  doc.circle(width + 10, 3, 34, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(-15, 5, 118, 33, 16.5, 16.5, 'F');
  doc.setFillColor(...YELLOW);
  doc.roundedRect(0, 36, 70, 2.2, 1.1, 1.1, 'F');
  if (logo) doc.addImage(logo, 'PNG', 13, 9, 76, 26.1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text('OFFICE OF THE PRINCIPAL', right, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.7);
  doc.setTextColor(245, 243, 255);
  doc.text(`Order No: ${order.order_number}`, right, 24, { align: 'right' });
  doc.text(`Issued: ${displayDate(order.issued_on)}`, right, 31, { align: 'right' });
  doc.setFillColor(...YELLOW);
  doc.rect(0, 44, width, 2, 'F');
  if (!continuation) {
    doc.setFont('times', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(34, 34, 34);
    doc.text('OFFICE ORDER', MARGIN, 61);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...PURPLE);
    doc.text(order.title, MARGIN, 70);
    doc.setDrawColor(...PURPLE);
    doc.setLineWidth(0.35);
    doc.line(MARGIN, 75, right, 75);
  }
};

const drawFooter = doc => {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const top = height - 23;
  doc.setFillColor(...PURPLE);
  doc.rect(0, top, width, 23, 'F');
  doc.setFillColor(...YELLOW);
  doc.rect(0, top, width, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('583 Q Block Model Town, Lahore', MARGIN, height - 10);
  doc.text('03234447292  ·  qmodeltown@das.edu.pk', width / 2, height - 10, { align: 'center' });
  doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, width - MARGIN, height - 10, {
    align: 'right',
  });
};

async function renderRichContent(doc, html, startY, addPage) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'position:absolute;left:0;top:0;z-index:-1;width:760px;background:#fff;color:#242424;font-family:Georgia,serif;font-size:15px;line-height:1.55;padding:0;';
  wrapper.innerHTML = `<style>
    h1{font:700 26px/1.25 Arial,sans-serif;color:#432c88;margin:10px 0}h2{font:700 21px/1.3 Arial,sans-serif;color:#432c88;margin:12px 0 8px}h3{font:700 17px/1.35 Arial,sans-serif;color:#432c88;margin:10px 0 6px}
    p{margin:8px 0}ul,ol{margin:9px 0;padding-left:0;list-style:none}li{position:relative;margin:4px 0;padding-left:22px}.pdf-list-marker{position:absolute;left:3px;color:#432c88;font-weight:700}.pdf-list-marker.number{width:20px;text-align:right;left:0}ol li{padding-left:28px}blockquote{border-left:4px solid #ffe900;background:#faf9ff;color:#4b5563;margin:12px 0;padding:7px 0 7px 14px}hr{border:0;border-top:1px solid #b9acd9;margin:16px 0}
    table{border-collapse:collapse;table-layout:fixed;margin:13px 0;width:100%}th,td{border:1px solid #c9c0dc;overflow-wrap:anywhere;padding:8px 10px;text-align:left;vertical-align:top;word-break:break-word}th{background:#432c88;color:#fff;font-family:Arial,sans-serif;font-weight:700}
    strong,b{font-weight:700}u{text-decoration-color:#ffe900;text-decoration-thickness:2px}.activity-task{display:flex;gap:7px;margin:5px 0}.activity-task input{accent-color:#432c88}
  </style>${html || '<p>No order details were provided.</p>'}`;
  wrapper.querySelectorAll('ul > li').forEach(item => {
    item.insertAdjacentHTML('afterbegin', '<span class="pdf-list-marker">•</span>');
  });
  wrapper.querySelectorAll('ol').forEach(list => {
    [...list.children].forEach((item, index) => {
      if (item.tagName?.toLowerCase() === 'li')
        item.insertAdjacentHTML(
          'afterbegin',
          `<span class="pdf-list-marker number">${index + 1}.</span>`
        );
    });
  });
  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper, {
      scale: 1.5,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });
    const contentWidth = 174;
    const pixelsPerMm = canvas.width / contentWidth;
    const pageHeight = doc.internal.pageSize.getHeight();
    let offset = 0;
    let y = startY;
    while (offset < canvas.height) {
      const available = pageHeight - y - 27;
      const sliceHeight = Math.min(canvas.height - offset, Math.floor(available * pixelsPerMm));
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      slice
        .getContext('2d')
        .drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      doc.addImage(
        slice.toDataURL('image/png'),
        'PNG',
        MARGIN,
        y,
        contentWidth,
        sliceHeight / pixelsPerMm
      );
      offset += sliceHeight;
      if (offset < canvas.height) y = addPage();
    }
  } finally {
    wrapper.remove();
  }
}

export async function printOfficeOrder(order) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadSchoolLogo();
  drawHeader(doc, logo, order);
  await renderRichContent(doc, order.content, 84, () => {
    doc.addPage();
    drawHeader(doc, logo, order, true);
    return 58;
  });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    drawFooter(doc);
  }
  openPdf(doc);
}
