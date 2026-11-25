# CampusCare — Smart Campus Problem Solver (Web Portal + Backend)

A working web portal and Java 21 backend implementation of **CampusCare – Smart Campus Problem Solver**, matching the UI, workflows, and storage design from the project report.

## How to Run (With Disk Backend — Recommended)

Double-click **`start-server.bat`** (uses Microsoft JDK 21 installed on Windows):
- Starts the backend server & web portal at **`http://localhost:8080`**
- Saves all data to real JSON files on disk inside **`server/data/`**:
  - `server/data/real_complaints.json` — Live student & admin complaints
  - `server/data/demo_complaints.json` — Demo Sandbox complaints
  - `server/data/student_accounts.json` — Registered student accounts & passwords
  - `server/data/activity_log.json` — Backend save/auth activity feed

Or open `index.html` directly in any browser to use offline `localStorage` fallback.

## Live Backend & Data Flow Aside Panel

Beside the main portal (or via the **Data** button in the top bar), the **Backend & Data Flow** aside panel shows in real time:
- Active storage target (Java Backend `server/data/*.json` vs. Browser `localStorage`)
- File paths, record counts, and byte sizes
- Saved Student Accounts table
- Saved Tickets table for the active mode
- Live Save & Activity Log + **Export JSON** backup button

## Features Included

- **Splash Screen**: Branded gradient launch screen with auto-transition and `Continue` button.
- **Role Selection & Sign-In**:
  - **Student Portal**: Name, Student ID, and Password (with Show/Hide toggle; persisted per Student ID in `student_accounts.json` / `localStorage`), plus instant **Enter Student Demo Mode**.
  - **Admin Portal**: Name, Staff ID, and Passcode (`admin123`), plus instant **Enter Admin Demo Mode**.
- **Student Dashboard**: Summary counters, quick actions, Repeated Location Hotspots, and recent tickets.
- **Report a Campus Issue**: Validated form, category chips, priority selector, and optional photo upload with preview.
- **Track Complaints**: Search, status filters, category dropdown, and detail modal with chronological Status Timeline.
- **Admin Panel & Operations**: Queue summary, Urgent Open counter, multi-filter toolbar, high-priority-first sorting, and ticket status + remarks editor.
- **Smart Campus Insights**: Category bars, repeated location hotspot detection, priority action queue, and Demo/Live reset/clear controls.
