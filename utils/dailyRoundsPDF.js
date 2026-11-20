import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawSchoolHeader, loadSchoolLogo } from './pdfBranding';
import { formatScore, roundGroups } from './dailyRounds';

async function reportDocument(title, subtitle, landscape = false) {
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', format: 'a4' });
  const logo = await loadSchoolLogo();
  const options = {
    margin: { top: 29, bottom: 16, left: 14, right: 14 },
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [40, 38, 80] },
  };
  function save(name) {
    for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
      doc.setPage(page);
      drawSchoolHeader(doc, { logo, title, subtitle });
      doc.setFontSize(8);
      doc.text(
        `Page ${page} of ${doc.getNumberOfPages()}`,
        doc.internal.pageSize.getWidth() - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      );
    }
    doc.save(name);
  }
  return { doc, options, save };
}

export async function downloadRound(visit) {
  const { doc, options, save } = await reportDocument('Daily Round Report', visit.visit_date);
  autoTable(doc, {
    ...options,
    head: [['Class', 'Lecture / Subject', 'Observed teacher', 'Overall']],
    body: [
      [
        visit.class_name,
        `${visit.lecture} / ${visit.subject}`,
        visit.teacher_name,
        formatScore(visit.score, '/5'),
      ],
    ],
  });
  autoTable(doc, {
    ...options,
    head: [['Attendance snapshot', 'Diaries marked sent in the last 5 days']],
    body: [
      [
        visit.attendance_days
          ? `${formatScore(visit.attendance_average, '%')} over ${visit.attendance_days} marked days`
          : 'No marked days',
        visit.diary_count,
      ],
    ],
  });
  autoTable(doc, {
    ...options,
    head: [['Area', 'Criterion', 'Rating']],
    body: roundGroups.flatMap(group =>
      group.items.map(([key, label], index) => [
        index === 0 ? group.title : '',
        label,
        visit.ratings[key] === 'na' ? 'Not observed' : visit.ratings[key] + '/5',
      ])
    ),
  });
  const numbered = entries =>
    entries.map((entry, index) => `${index + 1}. ${entry}`).join('\n') || 'None recorded';
  autoTable(doc, {
    ...options,
    head: [['Follow-up and actionables', 'Details']],
    body: [
      [
        visit.prior_round_date ? `Previous visit (${visit.prior_round_date})` : 'Previous visit',
        numbered(visit.prior_actionables),
      ],
      ['Follow-up notes', visit.follow_up || 'None recorded'],
      ['New actionables', numbered(visit.actionables)],
      ['Observations', visit.notes || 'None recorded'],
    ],
    columnStyles: { 0: { cellWidth: 58 } },
  });
  save(`daily-round-${visit.visit_date}-${visit.class_id}.pdf`);
}

export async function downloadRoundPeriod({
  overview,
  visits,
  teacherOverview,
  start,
  end,
  className,
  teacherName,
}) {
  const { doc, options, save } = await reportDocument(
    className ? 'Class Daily Rounds' : 'Class Visit Comparison',
    `${start} to ${end}`,
    true
  );
  if (teacherName) {
    doc.setFontSize(9);
    doc.text(`Observed teacher: ${teacherName}`, 14, 28);
  }
  autoTable(doc, {
    ...options,
    startY: teacherName ? 33 : 29,
    head: [['Class', 'Visits', 'Average /5', 'Last visit', 'Actionables']],
    body: overview.map(row => [
      row.name,
      row.visits,
      formatScore(row.score),
      row.latest || '—',
      row.actions,
    ]),
  });
  if (className && visits.length) {
    autoTable(doc, {
      ...options,
      head: [['Observed teacher', 'Visits', 'Average /5', 'Actionables']],
      body: teacherOverview.map(row => [row.name, row.visits, formatScore(row.score), row.actions]),
    });
    autoTable(doc, {
      ...options,
      head: [['Date', 'Lecture / Subject', 'Observed teacher', 'Score', 'Actionables']],
      body: visits.map(row => [
        row.visit_date,
        `${row.lecture} / ${row.subject}`,
        row.teacher_name,
        formatScore(row.score),
        row.actionables.join('\n') || '—',
      ]),
    });
  }
  save(`daily-rounds-${className ? 'class' : 'comparison'}-${start}-${end}.pdf`);
}
