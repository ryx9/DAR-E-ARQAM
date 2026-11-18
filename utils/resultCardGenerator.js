// utils/resultCardGenerator.js
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const loadImage = src =>
  new Promise(resolve => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });

const formatDateRange = (start, end) => {
  const s = new Date(start);
  const e = new Date(end);
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  return `${s.toLocaleDateString('en-GB', options)} – ${e.toLocaleDateString('en-GB', options)}`;
};

const getGrade = percent => {
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B';
  if (percent >= 60) return 'C';
  if (percent >= 50) return 'D';
  if (percent > 33) return 'E';
  return 'F';
};

const getRemarks = percent => {
  if (percent >= 90) {
    return 'What a wonderful result! It is clear how much effort and care you have put into your studies, and it truly shows. Your love for learning is something every student can look up to. Keep nurturing that spirit, stay curious, and remember that the heights you can reach are limitless.';
  } else if (percent >= 80) {
    return 'Really well done — this is a result worth celebrating. Your hard work has paid off in a very real way, and you should feel good about what you have accomplished. With just a bit more focus in a few areas, the very top is comfortably within your reach. Keep that momentum going.';
  } else if (percent >= 70) {
    return 'A solid effort, and there is a lot here to be pleased about. You have shown what you are capable of, and this is a good foundation to build on. A little more consistency and targeted revision each day will make a noticeable difference next time. We can see the potential — keep pushing.';
  } else if (percent >= 60) {
    return 'You have shown that you can do this — and that matters. With more regular revision and perhaps some extra support in the trickier subjects, a stronger result next time is very much on the cards. Do not hesitate to ask your teachers for help; that is exactly what they are there for.';
  } else if (percent >= 50) {
    return 'There is clear room to grow, and we want you to see that as an opportunity rather than a setback. Many students who go on to do really well have faced a tough result along the way — what set them apart was how they responded. Let us work on building better routines and aim higher together next time.';
  } else {
    return 'We know this is not the result you were hoping for, and we want you to know that we are fully in your corner. This is not the end of the story — not even close. With renewed focus, regular attendance, and the right support from your teachers and family, real improvement is absolutely within reach. Let us pick things up together from here.';
  }
};

const getGradeColor = percent => {
  if (percent >= 90) return [22, 163, 74];
  if (percent >= 80) return [37, 99, 235];
  if (percent >= 70) return [161, 98, 7];
  if (percent >= 60) return [194, 65, 12];
  return [220, 38, 38];
};

const calcOverallPct = student => {
  const total = student.marksData.reduce((s, m) => s + m.total_marks, 0);
  const obtained = student.marksData.reduce((s, m) => s + m.obtained_marks, 0);
  return total > 0 ? (obtained / total) * 100 : 0;
};

export const generateClassResultPDF = async (students, classInfo, dateRanges) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const logoImg = await loadImage('/logo-1.png');

  const colors = {
    navy: [15, 23, 42],
    royal: [37, 99, 235],
    royalDark: [29, 78, 216],
    royalLight: [219, 234, 254],
    border: [203, 213, 225],
    white: [255, 255, 255],
    muted: [100, 116, 139],
    lightGray: [248, 250, 252],
    text: [30, 41, 59],
  };

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // Sort descending by overall percentage
  const sortedStudents = [...students].sort((a, b) => calcOverallPct(b) - calcOverallPct(a));

  sortedStudents.forEach((student, index) => {
    if (index !== 0) doc.addPage();

    let y = 0;

    /* ════════════════════════════════════════
       HEADER  (taller for bolder presence)
    ════════════════════════════════════════ */
    const headerH = 44;

    // Main header background
    doc.setFillColor(...colors.royal);
    doc.rect(0, 0, pageWidth, headerH, 'F');

    // Bottom accent line
    doc.setFillColor(...colors.royalDark);
    doc.rect(0, headerH - 2, pageWidth, 2, 'F');

    // ── Logo box — cleaner white card with subtle shadow feel ──
    const logoBoxW = 52;
    const logoBoxH = 30;
    const logoBoxX = margin;
    const logoBoxY = (headerH - logoBoxH) / 2;

    // Slight shadow via an offset dark rect
    doc.setFillColor(20, 60, 180);
    doc.roundedRect(logoBoxX + 1, logoBoxY + 1, logoBoxW, logoBoxH, 3, 3, 'F');

    // White card
    doc.setFillColor(...colors.white);
    doc.roundedRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 3, 3, 'F');

    if (logoImg) {
      const pad = 4;
      const maxW = logoBoxW - pad * 2;
      const maxH = logoBoxH - pad * 2;
      const ar = logoImg.width / logoImg.height;
      let lw = maxW;
      let lh = lw / ar;
      if (lh > maxH) {
        lh = maxH;
        lw = lh * ar;
      }
      const lx = logoBoxX + (logoBoxW - lw) / 2;
      const ly = logoBoxY + (logoBoxH - lh) / 2;
      doc.addImage(logoImg, 'PNG', lx, ly, lw, lh);
    }

    // ── RESULT CARD — bold stacked title, right-aligned ──
    const titleX = pageWidth - margin;

    // "RESULT" — large and heavy
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...colors.white);
    doc.text('RESULT', titleX, headerH / 2 - 1, { align: 'right' });

    // "CARD" — slightly smaller, tight below
    doc.setFontSize(13);
    doc.setTextColor(186, 214, 255); // lighter tint for contrast
    doc.text('CARD', titleX, headerH / 2 + 10, { align: 'right' });

    // Underline accent below CARD
    doc.setDrawColor(186, 214, 255);
    doc.setLineWidth(0.8);
    const cardW = doc.getTextWidth('CARD');
    doc.line(titleX - cardW, headerH / 2 + 12.5, titleX, headerH / 2 + 12.5);

    y = headerH + 7;

    /* ════════════════════════════════════════
       STUDENT INFO BLOCK
    ════════════════════════════════════════ */
    const infoH = 26;
    doc.setFillColor(...colors.lightGray);
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, infoH, 3, 3, 'FD');

    // Left accent bar
    doc.setFillColor(...colors.royal);
    doc.roundedRect(margin, y, 3, infoH, 1.5, 1.5, 'F');

    const col1 = margin + 8;
    const col2 = margin + contentWidth * 0.5 + 5;

    const infoField = (label, value, x, cy) => {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colors.muted);
      doc.text(label.toUpperCase(), x, cy);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.text);
      doc.text(String(value || '—'), x, cy + 5.5);
    };

    infoField('Student Name', student.studentName, col1, y + 8.5);
    infoField("Father's Name", student.fatherName, col2, y + 8.5);
    infoField('Class', student.className, col1, y + 19);
    infoField('DAS No.', student.dasNumber, col2, y + 19);

    y += infoH + 7;

    /* ════════════════════════════════════════
       MARKS TABLE
    ════════════════════════════════════════ */
    const academicRange = formatDateRange(dateRanges.start, dateRanges.end);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.royal);
    doc.text('MARKS DISTRIBUTION', margin, y + 1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...colors.muted);
    doc.text(academicRange, pageWidth - margin, y + 1, { align: 'right' });

    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 3.5, pageWidth - margin, y + 3.5);

    y += 6;

    const totalMarks = student.marksData.reduce((s, m) => s + m.total_marks, 0);
    const obtainedMarks = student.marksData.reduce((s, m) => s + m.obtained_marks, 0);
    const overallPct = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;

    const marksBody = student.marksData.map(m => {
      const pct = (m.obtained_marks / m.total_marks) * 100;
      return [
        m.subject.replace(/_/g, ' '),
        m.total_marks,
        m.obtained_marks,
        `${pct.toFixed(0)}%`,
        getGrade(pct),
      ];
    });

    // Totals row
    marksBody.push([
      'TOTAL',
      totalMarks,
      obtainedMarks,
      `${overallPct.toFixed(0)}%`,
      getGrade(overallPct),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Subject', 'Total', 'Obtained', '%', 'Grade']],
      body: marksBody,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: { top: 3, bottom: 3, left: 5, right: 5 },
        font: 'helvetica',
        halign: 'center',
        textColor: colors.text,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: colors.royal,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
        cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
      },
      tableWidth: contentWidth,
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
        1: {},
        2: {},
        3: {},
        4: {},
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: data => {
        const isTotal = data.row.index === marksBody.length - 1;
        if (isTotal) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = colors.royalLight;
          data.cell.styles.textColor = colors.royalDark;
          data.cell.styles.fontSize = 9.5;
        }
        if (data.section === 'body' && !isTotal) {
          const pct = parseFloat(data.row.raw[3]);
          if (data.column.index === 3 || data.column.index === 4) {
            data.cell.styles.textColor = getGradeColor(pct);
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    y = doc.lastAutoTable.finalY + 7;

    /* ════════════════════════════════════════
       ATTENDANCE + OVERALL RESULT (side by side)
    ════════════════════════════════════════ */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.royal);
    doc.text('ATTENDANCE SUMMARY', margin, y + 1);

    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 3.5, pageWidth - margin, y + 3.5);

    y += 6;

    const attColW = contentWidth * 0.6;
    const summaryX = margin + attColW + 5;
    const summaryW = contentWidth - attColW - 5;

    const attendanceHeaders = ['Working Days', 'Present', 'Absent', 'Attendance %'];
    const attendanceValues = [
      student.attendance.total,
      student.attendance.present,
      student.attendance.absent,
      `${student.attendance.percent.toFixed(1)}%`,
    ];
    if (student.ptmAttended > 0) {
      attendanceHeaders.push('PTMs attended');
      attendanceValues.push(String(student.ptmAttended));
    }
    autoTable(doc, {
      startY: y,
      head: [attendanceHeaders],
      body: [attendanceValues],
      theme: 'grid',
      tableWidth: attColW,
      headStyles: {
        fillColor: colors.navy,
        textColor: 255,
        fontSize: 8,
        halign: 'center',
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      },
      styles: {
        halign: 'center',
        fontSize: 9,
        fontStyle: 'bold',
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
        textColor: colors.text,
      },
    });

    // ── Overall Result Card (right of attendance) ──
    const summaryY = y;
    const summaryH = doc.lastAutoTable.finalY - y;
    const gradeColor = getGradeColor(overallPct);

    doc.setFillColor(...colors.lightGray);
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(summaryX, summaryY, summaryW, summaryH, 3, 3, 'FD');

    // Left accent stripe
    doc.setFillColor(...gradeColor);
    doc.roundedRect(summaryX, summaryY, 3, summaryH, 1.5, 1.5, 'F');

    const midY = summaryY + summaryH / 2 + 1;
    const padX = 7;
    const leftX = summaryX + padX + 3; // after the accent stripe
    const rightX = summaryX + summaryW - padX;

    // "OVERALL RESULT" label — top centre
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.muted);
    doc.text('OVERALL RESULT', summaryX + summaryW / 2, summaryY + 5.5, { align: 'center' });

    // Thin rule under label
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.2);
    doc.line(summaryX + 5, summaryY + 8, summaryX + summaryW - 5, summaryY + 8);

    // LEFT — large percentage
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...gradeColor);
    doc.text(`${overallPct.toFixed(0)}%`, leftX, midY + 4);

    // Vertical divider
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.line(
      summaryX + summaryW / 2,
      summaryY + 10,
      summaryX + summaryW / 2,
      summaryY + summaryH - 5
    );

    // RIGHT — grade label + value stacked
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.muted);
    doc.text('GRADE', rightX, midY - 3, { align: 'right' });

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gradeColor);
    doc.text(getGrade(overallPct), rightX, midY + 7, { align: 'right' });

    y = doc.lastAutoTable.finalY + 7;

    /* ════════════════════════════════════════
       TEACHER'S REMARKS
    ════════════════════════════════════════ */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.royal);
    doc.text("TEACHER'S REMARKS", margin, y + 1);

    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 3.5, pageWidth - margin, y + 3.5);

    y += 6;

    const remarksText = getRemarks(overallPct);
    const textStartX = margin + 9;
    const textMaxWidth = contentWidth - 13;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    const splitRemarks = doc.splitTextToSize(remarksText, textMaxWidth);
    const lineH = 5.5; // slightly more generous line height
    const remarksBoxH = splitRemarks.length * lineH + 14;

    doc.setFillColor(...colors.royalLight);
    doc.setDrawColor(...colors.royal);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, remarksBoxH, 3, 3, 'FD');

    // Left accent bar
    doc.setFillColor(...colors.royal);
    doc.roundedRect(margin, y, 4, remarksBoxH, 2, 2, 'F');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(29, 78, 216);
    doc.text(splitRemarks, textStartX, y + 8, { lineHeightFactor: 1.5 });

    y += remarksBoxH + 8;

    /* ════════════════════════════════════════
       SIGNATURE ROW
    ════════════════════════════════════════ */
    const sigBoxW = contentWidth / 3 - 4;

    const drawSig = (label, xStart) => {
      doc.setDrawColor(...colors.border);
      doc.setLineWidth(0.3);
      doc.line(xStart, y + 12, xStart + sigBoxW, y + 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...colors.muted);
      doc.text(label, xStart + sigBoxW / 2, y + 17, { align: 'center' });
    };

    drawSig('Class Teacher', margin);
    drawSig('Principal', margin + sigBoxW + 6);
    drawSig('Parent / Guardian', margin + (sigBoxW + 6) * 2);

    /* ════════════════════════════════════════
       FOOTER
    ════════════════════════════════════════ */
    const footerH = 14;
    const footerY = pageHeight - footerH;

    doc.setFillColor(...colors.navy);
    doc.rect(0, footerY, pageWidth, footerH, 'F');

    // Top accent stripe on footer
    doc.setFillColor(...colors.royal);
    doc.rect(0, footerY, pageWidth, 1.5, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('583 Q Block Model Town, Lahore   |   Phone: 03234447292', margin, footerY + 9);
    doc.text('System generated document — no signature required', pageWidth - margin, footerY + 9, {
      align: 'right',
    });
  });

  doc.save(`Result_Card_${classInfo.name}.pdf`);
};
