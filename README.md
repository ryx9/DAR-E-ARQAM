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
