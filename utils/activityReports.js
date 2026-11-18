import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { drawSchoolHeader, loadSchoolLogo } from './pdfBranding';

const COLORS = [
  [79, 70, 229],
  [14, 116, 144],
  [190, 24, 93],
  [180, 83, 9],
  [22, 101, 52],
  [109, 40, 217],
  [194, 65, 12],
  [3, 105, 161],
];

const prettyDate = value =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const filenamePart = value =>
  String(value || 'activity')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_|_$/g, '');

const plainText = value => {
  if (!value) return '';
  const holder = document.createElement('div');
  holder.innerHTML = value;
  return holder.innerText || holder.textContent || '';
};

function richBlocks(value) {
  const parser = new DOMParser();
  const root = parser.parseFromString(value || '', 'text/html').body;
  const blocks = [];
  [...root.children].forEach(element => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'hr') return blocks.push({ type: 'divider' });
    if (tag === 'ul' || tag === 'ol') {
      return blocks.push({
        type: tag,
        items: [...element.querySelectorAll(':scope > li')].map(
          item => item.innerText || item.textContent
        ),
      });
    }
    if (tag === 'table') {
      const rows = [...element.querySelectorAll('tr')].map(row =>
        [...row.querySelectorAll(':scope > th, :scope > td')].map(cell =>
          (cell.innerText || cell.textContent || '').trim()
        )
      );
      return blocks.push({
        type: 'table',
        head: rows[0] || [],
        body: rows.slice(1),
      });
    }
    if (element.classList.contains('activity-task')) {
      return blocks.push({
        type: 'task',
        text: element.innerText || element.textContent,
        checked: Boolean(
          element.querySelector('input')?.checked ||
            element.querySelector('input')?.hasAttribute('checked')
        ),
      });
    }
    blocks.push({
      type: ['h1', 'h2', 'h3', 'blockquote', 'pre'].includes(tag) ? tag : 'p',
      text: element.innerText || element.textContent || '',
      strong: Boolean(element.querySelector('strong, b')),
      italic: Boolean(element.querySelector('em, i')),
    });
  });
  return blocks.length ? blocks : [{ type: 'p', text: plainText(value) }];
}

function drawRichDescription(doc, value, x, y, width, addPage) {
  const bottom = () => doc.internal.pageSize.getHeight() - 22;
  const ensure = height => {
    if (y + height > bottom()) y = addPage();
  };
  const write = (text, options = {}) => {
    const {
      size = 9,
      bold = false,
      italic = false,
      color = [71, 85, 105],
      indent = 0,
      prefix = '',
    } = options;
    doc.setFont('helvetica', bold ? 'bold' : italic ? 'italic' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text || '', width - indent - (prefix ? 5 : 0));
    ensure(lines.length * (size * 0.48) + 3);
    lines.forEach((line, index) => {
      if (index === 0 && prefix) doc.text(prefix, x + indent, y);
      doc.text(line, x + indent + (prefix ? 5 : 0), y);
      y += size * 0.48;
    });
    y += 2;
  };
  richBlocks(value).forEach(block => {
    if (block.type === 'divider') {
      ensure(8);
      doc.setDrawColor(203, 213, 225);
      doc.line(x, y + 2, x + width, y + 2);
      y += 7;
      return;
    }
    if (block.type === 'ul' || block.type === 'ol') {
      block.items.forEach((item, index) =>
        write(item, { indent: 2, prefix: block.type === 'ol' ? `${index + 1}.` : '•' })
      );
      return;
    }
    if (block.type === 'table') {
      if (!block.head.length) return;
      ensure(22);
      autoTable(doc, {
        startY: y,
        margin: { top: 48, bottom: 20, left: x, right: x },
        head: [block.head],
        body: block.body,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2.2,
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
          textColor: [30, 41, 59],
        },
        headStyles: { fillColor: [40, 38, 80], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      y = doc.lastAutoTable.finalY + 6;
      return;
    }
    if (block.type === 'task')
      return write(block.text, { indent: 2, prefix: block.checked ? '[x]' : '[ ]' });
    if (block.type === 'blockquote') {
      const initialY = y;
      write(block.text, { italic: true, color: [100, 116, 139], indent: 5 });
      doc.setDrawColor(96, 165, 250);
      doc.setLineWidth(0.8);
      doc.line(x, initialY - 3, x, y - 3);
      return;
    }
    if (block.type === 'pre') {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      const lines = doc.splitTextToSize(block.text, width - 8);
      ensure(lines.length * 4 + 8);
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(x, y - 4, width, lines.length * 4 + 6, 1, 1, 'F');
      doc.setTextColor(226, 232, 240);
      lines.forEach(line => {
        doc.text(line, x + 4, y);
        y += 4;
      });
      y += 5;
      return;
    }
    const heading = { h1: 15, h2: 12, h3: 10 }[block.type];
    write(block.text, {
      size: heading || 9,
      bold: Boolean(heading || block.strong),
      italic: block.italic,
      color: heading ? [30, 41, 59] : [71, 85, 105],
    });
  });
  return y;
}

async function drawStyledActivityHtml(doc, html, x, y, width, addContinuationPage) {
  const wrapper = document.createElement('div');
  // html2canvas ignores fixed content positioned outside the viewport. Keep the
  // temporary surface in the render tree but behind the app while it is captured.
  wrapper.style.cssText =
    'position:absolute;left:0;top:0;z-index:-1;pointer-events:none;width:760px;background:#fff;color:#334155;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.48;padding:0;';
  wrapper.innerHTML = `<style>
    h1{font-size:25px;line-height:1.25;margin:10px 0;color:#0f172a}h2{font-size:20px;line-height:1.35;margin:9px 0;color:#1e293b}h3{font-size:16px;line-height:1.4;margin:8px 0;color:#1e293b}
    p{margin:6px 0}ul,ol{margin:7px 0;padding-left:0;list-style:none}li{position:relative;margin:3px 0;padding-left:22px}.pdf-list-marker{position:absolute;left:3px;color:#2563eb;font-weight:700}.pdf-list-marker.number{width:20px;text-align:right;left:0}ol li{padding-left:28px}blockquote{border-left:4px solid #60a5fa;color:#64748b;font-style:italic;margin:10px 0;padding:5px 0 5px 13px}
    pre{background:#0f172a;border-radius:6px;color:#e2e8f0;font-family:monospace;font-size:12px;margin:10px 0;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere}hr{border:0;border-top:1px solid #cbd5e1;margin:14px 0}
    table{border-collapse:collapse;table-layout:fixed;margin:12px 0;width:100%}th,td{border:1px solid #cbd5e1;overflow-wrap:anywhere;padding:7px 9px;text-align:left;vertical-align:top;word-break:break-word}th{background:#e2e8f0;color:#1e293b;font-weight:700}
    a{color:#2563eb;text-decoration:underline}.activity-task{display:flex;gap:7px;margin:5px 0}.activity-task input{accent-color:#2563eb}
  </style>${html || '<p>No activity description was provided.</p>'}`;
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
    const pixelsPerMm = canvas.width / width;
    const pageHeight = doc.internal.pageSize.getHeight();
    let offset = 0,
      pageY = y;
    while (offset < canvas.height) {
      const availableMm = pageHeight - pageY - 20;
      const sliceHeight = Math.min(canvas.height - offset, Math.floor(availableMm * pixelsPerMm));
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      slice
        .getContext('2d')
        .drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      doc.addImage(slice.toDataURL('image/png'), 'PNG', x, pageY, width, sliceHeight / pixelsPerMm);
      offset += sliceHeight;
      if (offset < canvas.height) pageY = addContinuationPage();
    }
  } finally {
    wrapper.remove();
  }
}

function addFooter(doc, label) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(203, 213, 225);
  doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`DAR-E-ARQAM SCHOOL  |  ${label}`, 14, pageHeight - 9);
  doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pageWidth - 14, pageHeight - 9, {
    align: 'right',
  });
}

function reportHeader(doc, logo, title, subtitle) {
  drawSchoolHeader(doc, { logo, title, subtitle });
  addFooter(doc, title);
}

export async function downloadActivityReport(activity) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadSchoolLogo();
  const classes = activity.classNames || [];
  reportHeader(
    doc,
    logo,
    'ACTIVITY BRIEF',
    `Generated ${prettyDate(new Date().toISOString().slice(0, 10))}`
  );
  // Executive activity hero: the key coordination facts are immediately visible
  // before the detailed, Notion-style activity plan.
  doc.setFillColor(40, 38, 80);
  doc.roundedRect(14, 34, 182, 35, 3, 3, 'F');
  doc.setFillColor(79, 70, 229);
  doc.roundedRect(14, 34, 4, 35, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(doc.splitTextToSize(activity.title, 166)[0], 23, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    activity.end_date && activity.end_date !== activity.start_date
      ? `${prettyDate(activity.start_date)}  –  ${prettyDate(activity.end_date)}`
      : prettyDate(activity.start_date),
    23,
    54
  );
  doc.text(activity.venue || 'Venue to be confirmed', 23, 61);
  const heroFacts = [
    ['CLASSES', classes.join(', ') || 'Not assigned'],
    ['RESPONSIBLE', activity.responsible_name || 'Not specified'],
  ];
  heroFacts.forEach(([label, value], index) => {
    const x = 108 + index * 42;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(165, 180, 252);
    doc.text(label, x, 54);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(255, 255, 255);
    doc.text(doc.splitTextToSize(value, 36)[0], x, 60);
  });
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(14, 75, 182, 8, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(30, 64, 175);
  doc.text('ACTIVITY DETAILS & IMPLEMENTATION PLAN', 18, 80.2);
  try {
    await drawStyledActivityHtml(doc, activity.description, 14, 88, 182, () => {
      doc.addPage();
      reportHeader(doc, logo, 'ACTIVITY BRIEF', activity.title);
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(14, 34, 182, 8, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(30, 64, 175);
      doc.text('ACTIVITY DETAILS & IMPLEMENTATION PLAN (CONTINUED)', 18, 39.2);
      return 48;
    });
  } catch (error) {
    drawRichDescription(
      doc,
      activity.description || '<p>No activity description was provided.</p>',
      14,
      90,
      178,
      () => {
        doc.addPage();
        reportHeader(doc, logo, 'ACTIVITY BRIEF', activity.title);
        return 38;
      }
    );
  }
  doc.save(`Activity_${filenamePart(activity.title)}.pdf`);
}

function daysBetween(start, end) {
  const result = [];
  const cursor = new Date(`${start}T00:00:00`);
  const limit = new Date(`${end}T00:00:00`);
  while (cursor <= limit) {
    result.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function activitiesOn(activityList, date, classId) {
  const scheduled = activityList.filter(activity => {
    const end = activity.end_date || activity.start_date;
    const applies = !classId || activity.classIds?.includes(classId);
    return applies && date >= activity.start_date && date <= end;
  });
  // The all-classes calendar draws one colour-coded chip for each affected
  // class. A shared event is therefore visible in every class colour.
  return classId
    ? scheduled
    : scheduled.flatMap(activity =>
        (activity.classIds || []).map(assignedClassId => ({
          ...activity,
          calendarClassId: assignedClassId,
        }))
      );
}

function monthWindows(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const windows = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    windows.push({
      start: iso(monthStart),
      end: iso(monthEnd),
      label: monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return windows;
}

function drawLegend(doc, classes, colorByClass, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let x = 14;
  classes.forEach(item => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const itemWidth = doc.getTextWidth(item.name) + 13;
    if (x + itemWidth > pageWidth - 14) {
      x = 14;
      y += 7;
    }
    doc.setFillColor(...(colorByClass[item.id] || COLORS[0]));
    doc.roundedRect(x, y - 3.2, 5, 5, 1, 1, 'F');
    doc.setTextColor(71, 85, 105);
    doc.text(item.name, x + 7, y + 0.4);
    x += itemWidth;
  });
  return y + 6;
}

function drawCalendarPage(
  doc,
  logo,
  window,
  rangeStart,
  rangeEnd,
  activities,
  classId,
  colorByClass,
  classes
) {
  const context = classId ? classes.find(item => item.id === classId)?.name : 'All classes';
  reportHeader(doc, logo, 'ACTIVITY CALENDAR', `${window.label}  |  ${context}`);
  const width = doc.internal.pageSize.getWidth();
  const calendarX = 14,
    calendarW = width - 28;
  let calendarY = 31;
  if (classId) {
    doc.setFillColor(...(colorByClass[classId] || COLORS[0]));
    doc.roundedRect(calendarX, calendarY - 3.5, 5, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Activities assigned to this class', calendarX + 7, calendarY + 0.4);
    calendarY += 8;
  } else {
    calendarY = drawLegend(doc, classes, colorByClass, calendarY);
  }
  const days = daysBetween(window.start, window.end);
  const firstOffset = new Date(`${window.start}T00:00:00`).getDay();
  const rows = Math.max(1, Math.ceil((firstOffset + days.length) / 7));
  const dayHeader = 10,
    cellW = calendarW / 7;
  const cellH = Math.min(
    30,
    (doc.internal.pageSize.getHeight() - calendarY - 29 - dayHeader) / rows
  );
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weekdays.forEach((name, index) => {
    doc.setFillColor(40, 38, 80);
    doc.rect(calendarX + index * cellW, calendarY, cellW, dayHeader, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(name.toUpperCase(), calendarX + index * cellW + cellW / 2, calendarY + 6.8, {
      align: 'center',
    });
  });
  for (let index = 0; index < rows * 7; index++) {
    const col = index % 7,
      row = Math.floor(index / 7);
    const x = calendarX + col * cellW,
      y = calendarY + dayHeader + row * cellH;
    const weekend = col === 0 || col === 6;
    doc.setFillColor(...(weekend ? [248, 250, 252] : [255, 255, 255]));
    doc.setDrawColor(203, 213, 225);
    doc.rect(x, y, cellW, cellH, 'FD');
    const dateIndex = index - firstOffset;
    if (dateIndex < 0 || dateIndex >= days.length) continue;
    const day = days[dateIndex],
      dayString = iso(day);
    const outsideRange = dayString < rangeStart || dayString > rangeEnd;
    if (outsideRange) {
      doc.setFillColor(241, 245, 249);
      doc.rect(x, y, cellW, cellH, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.rect(x, y, cellW, cellH, 'S');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setFillColor(...(outsideRange ? [226, 232, 240] : [224, 231, 255]));
    doc.circle(x + 5, y + 5, 3.3, 'F');
    doc.setTextColor(...(outsideRange ? [148, 163, 184] : [49, 46, 129]));
    doc.text(String(day.getDate()), x + 5, y + 6.8, { align: 'center' });
    const entryLimit = cellH >= 27 ? 3 : 2;
    const entries = outsideRange
      ? []
      : activitiesOn(activities, dayString, classId).slice(0, entryLimit);
    entries.forEach((entry, entryIndex) => {
      const color = classId
        ? colorByClass[classId] || COLORS[0]
        : colorByClass[entry.calendarClassId] || COLORS[0];
      const className = !classId
        ? entry.classNames?.[entry.classIds.indexOf(entry.calendarClassId)] || ''
        : '';
      const text = doc.splitTextToSize(
        className ? `${className}: ${entry.title}` : entry.title,
        cellW - 5
      )[0];
      const entryY = y + 13 + entryIndex * 7.2;
      doc.setFillColor(...color);
      doc.roundedRect(x + 1.8, entryY - 4.9, cellW - 3.6, 6.3, 1, 1, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(255, 255, 255);
      doc.text(text, x + 2.5, entryY);
    });
    const remaining = outsideRange
      ? 0
      : activitiesOn(activities, dayString, classId).length - entries.length;
    if (remaining > 0) {
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(`+${remaining} more`, x + 2, y + cellH - 2);
    }
  }
}

export async function downloadActivityCalendar({ activities, classes, startDate, endDate }) {
  if (!startDate || !endDate) throw new Error('Choose a start and end date for the calendar.');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logo = await loadSchoolLogo();
  const classColors = Object.fromEntries(
    classes.map((item, index) => [item.id, COLORS[index % COLORS.length]])
  );
  const months = monthWindows(startDate, endDate);
  let firstPage = true;
  months.forEach(window => {
    if (!firstPage) doc.addPage('a4', 'landscape');
    drawCalendarPage(doc, logo, window, startDate, endDate, activities, null, classColors, classes);
    firstPage = false;
  });
  classes.forEach(item =>
    months.forEach(window => {
      doc.addPage('a4', 'landscape');
      drawCalendarPage(
        doc,
        logo,
        window,
        startDate,
        endDate,
        activities,
        item.id,
        classColors,
        classes
      );
    })
  );
  doc.save(`Activity_Calendar_${startDate}_to_${endDate}.pdf`);
}
