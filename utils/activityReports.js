import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
        margin: { left: x, right: x },
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
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(activity.title, 14, 43);
  const tableY =
    drawRichDescription(
      doc,
      activity.description || '<p>No activity description was provided.</p>',
      14,
      50,
      178,
      () => {
        doc.addPage();
        reportHeader(doc, logo, 'ACTIVITY BRIEF', activity.title);
        return 38;
      }
    ) + 6;
  autoTable(doc, {
    startY: tableY,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    head: [['Activity information', 'Details']],
    body: [
      [
        'Schedule',
        activity.end_date && activity.end_date !== activity.start_date
          ? `${prettyDate(activity.start_date)} – ${prettyDate(activity.end_date)}`
          : prettyDate(activity.start_date),
      ],
      ['Classes involved', classes.join(', ') || 'No classes assigned'],
      ['Responsible person', activity.responsible_name || 'Not specified'],
      ['Venue', activity.venue || 'Not specified'],
      ['Created', prettyDate(activity.created_at?.slice(0, 10))],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      textColor: [30, 41, 59],
    },
    headStyles: { fillColor: [40, 38, 80], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', fillColor: [248, 250, 252] } },
  });
  const noteY = doc.lastAutoTable.finalY + 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('Coordination notes', 14, noteY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'This brief records the approved activity, its class coverage, schedule and responsible person.',
    14,
    noteY + 6
  );
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

function drawCalendarPage(
  doc,
  logo,
  title,
  subtitle,
  startDate,
  endDate,
  activities,
  classId,
  colorByClass
) {
  reportHeader(doc, logo, title, subtitle);
  const width = doc.internal.pageSize.getWidth();
  const calendarX = 14,
    calendarY = 34,
    calendarW = width - 28;
  const days = daysBetween(startDate, endDate);
  const firstOffset = new Date(`${startDate}T00:00:00`).getDay();
  const cells = firstOffset + days.length;
  const rows = Math.max(1, Math.ceil(cells / 7));
  const dayHeader = 10,
    cellW = calendarW / 7,
    cellH = Math.min(28, (doc.internal.pageSize.getHeight() - calendarY - 31 - dayHeader) / rows);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weekdays.forEach((name, index) => {
    doc.setFillColor(40, 38, 80);
    doc.rect(calendarX + index * cellW, calendarY, cellW, dayHeader, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(name, calendarX + index * cellW + cellW / 2, calendarY + 6.5, { align: 'center' });
  });
  for (let index = 0; index < rows * 7; index++) {
    const col = index % 7,
      row = Math.floor(index / 7);
    const x = calendarX + col * cellW,
      y = calendarY + dayHeader + row * cellH;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.rect(x, y, cellW, cellH, 'FD');
    const dateIndex = index - firstOffset;
    if (dateIndex < 0 || dateIndex >= days.length) continue;
    const day = days[dateIndex],
      dayString = iso(day);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(day.getDate()), x + 2, y + 5.5);
    const entries = activitiesOn(activities, dayString, classId).slice(0, 3);
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
      const entryY = y + 10 + entryIndex * 6;
      doc.setFillColor(...color);
      doc.roundedRect(x + 1.5, entryY - 4, cellW - 3, 5.2, 0.8, 0.8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.4);
      doc.setTextColor(255, 255, 255);
      doc.text(text, x + 2.5, entryY);
    });
    const remaining = activitiesOn(activities, dayString, classId).length - entries.length;
    if (remaining > 0) {
      doc.setFontSize(6.2);
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
  const period = `${prettyDate(startDate)} – ${prettyDate(endDate)}`;
  drawCalendarPage(
    doc,
    logo,
    'ACTIVITY CALENDAR',
    `All classes | ${period}`,
    startDate,
    endDate,
    activities,
    null,
    classColors
  );
  classes.forEach(item => {
    doc.addPage('a4', 'landscape');
    drawCalendarPage(
      doc,
      logo,
      'ACTIVITY CALENDAR',
      `${item.name} | ${period}`,
      startDate,
      endDate,
      activities,
      item.id,
      classColors
    );
  });
  doc.save(`Activity_Calendar_${startDate}_to_${endDate}.pdf`);
}
