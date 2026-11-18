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

Teacher-facing class workflows use the `teacher_class` assignments to limit class lists and class-specific operations, including attendance, notices, diary entries, activities, tests, syllabus tracking, and reports. These browser-side checks should be paired with equivalent Supabase Row Level Security policies to protect requests made outside the app.

## Payroll and attendance

Apply the SQL files in `supabase/migrations` in filename order to a Supabase project. Configure salary rates, holidays, loans, shifts and effective-dated assignments under Payroll attendance. Import the biometric export for the selected month; `Emp No.` is the biometric identifier and text dates use DD/MM/YYYY. Unmapped rows are skipped and may be imported later. Identical records are skipped; conflicting records stop the import.

In Payroll & payments, select the month and prepare a review. Scheduled days with no imported log are counted as absences, so import the full month before preparing. Each absence, each complete group of three late arrivals and each complete pair of early departures counts as a deduction day. One deduction day costs monthly salary divided by 30. Missing schedules and incomplete punches block posting until resolved. Record corrections with a reason; originals remain in the import. Salary changes within a month currently block posting for manual review. Save the draft, enter waived days and approved advance and loan repayments, and post after reviewing. A posted month cannot be posted again. Later changes are recorded as revisions; payments are ledger entries and do not transfer money. Employee attendance, review, final payment and payroll register reports are available from posted periods.

Employee salary visibility follows the application's existing client-side authorization model, as requested. This does **not** provide confidentiality: authenticated users with direct database access can read or change payroll data, including closed periods and other employees' salary data. The employee page filters records in the browser; opening and closing a period does not enforce access at the database. Use database access policies before relying on this system for confidential salary information.

## Parent-teacher meetings

Open Parent-teacher meetings from the navigation, select a class, and create a PTM for all or individual active students, and enter the meeting agenda and parent instructions. Invitations are added to the existing `messages` queue on creation. When attendance is marked, a thank-you or absence message is queued. The queue and its `sent` flag are maintained by the existing messaging workflow; queueing a message is not confirmation of delivery. Parents without a phone number are skipped and can be identified in the participant list.
