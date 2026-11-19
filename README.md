# Attendance Management System

## 🚀 About

This project is an Attendance Management System built with Next.js. It aims to streamline the process of tracking and managing student attendance in educational institutions.

## ✨ Features

- 🖲️ Easy Attendance Tracking
- 🧑‍🤝‍🧑 Student Management
- 📅 Calendar Integration
- 📃 Detailed Reports
- ⚡ Fast performance with Next.js

## 📃 Technologies Used

- Next.js
- Tailwind CSS
- Supabase
- Shadcn/ui
- Radix UI
- Lucide Icons
- Recharts
- Date-fns
- Framer Motion

## Admin password changes

The superadmin profile manager changes passwords directly through Supabase Auth using each profile's user ID, so profile email addresses do not need to be valid. Configure these environment variables:

- `NEXT_PUBLIC_SUPABASE_URL` — the project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the `sb_publishable_...` key; safe for browser use.
- `SUPABASE_SECRET_KEY` — the `sb_secret_...` key; server-only and must never use a `NEXT_PUBLIC_` prefix.

The secret key bypasses Row Level Security. The password API checks that the caller is an active superadmin before using it.

## Teacher class access

Teacher-facing class workflows use `teacher_class_access` (published timetable assignments plus special `teacher_class` assignments) to limit class lists and class-specific operations, including attendance, notices, diary entries, activities, tests, syllabus tracking, and reports. These browser-side checks should be paired with equivalent Supabase Row Level Security policies to protect requests made outside the app.

## Timetable and subjects

Apply `supabase/migrations/202611190001_timetable_subjects.sql` after the existing migrations. Open **Timetable** from the navigation. Admins and superadmins manage the shared subject catalogue and enable subjects per class; test creation and datesheet creation use only those subjects. Existing test subjects are seeded into the catalogue with their historical class assignments. Classes without historical tests need subjects assigned before new tests or lectures can be created. For datesheets spanning several classes, the subject dropdown shows their common subjects.

Superadmins configure each weekday's slots, timings and breaks. Admins and superadmins edit class/subject/staff assignments, with confirmation for multiple teachers and overlapping staff lessons. Copy a day's timings, assignments, or both to selected days; assignment-only copies require matching slot counts and map by position. Save a draft, then **Publish & queue notifications** when complete. Concurrent edits require a reload rather than overwriting another editor. Publishing atomically queues one message for each active affected staff member with a phone number, including staff removed from a slot. Queueing uses the existing sender; it does not confirm delivery. Teachers see the published timetable and can download overall, classwise and teacherwise branded PDFs. Choosing “All” downloads all groups in the selected report type.

Teacher class access uses `teacher_class_access`, the union of the published timetable and special assignments maintained in Manage Teachers. Removing timetable lessons removes that source of access while retaining special assignments. Drafts do not grant access. This follows the existing application's browser-side access model. Existing classes, including any sections represented as separate classes, are reused; the project has no separate academic-session model, so this module maintains one current weekly timetable.

## Payroll and attendance

Apply the SQL files in `supabase/migrations` in filename order to a Supabase project. Configure salary rates, holidays, loans, shifts and effective-dated assignments under Payroll attendance. Import the biometric export for the selected month; `Emp No.` is the biometric identifier and text dates use DD/MM/YYYY. Unmapped rows are skipped and may be imported later. Identical records are skipped; conflicting records stop the import.

In Payroll & payments, select the month and prepare a review. Scheduled days with no imported log are counted as absences, so import the full month before preparing. Each absence, each complete group of three late arrivals and each complete pair of early departures counts as a deduction day. One deduction day costs monthly salary divided by 30. Missing schedules and incomplete punches block posting until resolved. Record corrections with a reason; originals remain in the import. Salary changes within a month currently block posting for manual review. Save the draft, enter waived days and approved advance and loan repayments, and post after reviewing. A posted month cannot be posted again. Later changes are recorded as revisions; payments are ledger entries and do not transfer money. Employee attendance, review, final payment and payroll register reports are available from posted periods.

Employee salary visibility follows the application's existing client-side authorization model, as requested. This does **not** provide confidentiality: authenticated users with direct database access can read or change payroll data, including closed periods and other employees' salary data. The employee page filters records in the browser; opening and closing a period does not enforce access at the database. Use database access policies before relying on this system for confidential salary information.

## Parent-teacher meetings

Open Parent-teacher meetings from the navigation, select a class, and create a PTM for all or individual active students, and enter the meeting agenda and parent instructions. Invitations are added to the existing `messages` queue on creation. When attendance is marked, a thank-you or absence message is queued. The queue and its `sent` flag are maintained by the existing messaging workflow; queueing a message is not confirmation of delivery. Parents without a phone number are skipped and can be identified in the participant list.
