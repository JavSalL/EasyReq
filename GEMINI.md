# Gemini Project Context: reyes-soft

## Project Overview
This is a web application built with **Next.js 16** (using the App Router) and **React 19**. It serves as a management system for organizational units, structured hierarchically:
- **Groups (Grupos):** Top-level containers.
- **Teams (Equipos):** Belong to a specific Group.
- **Sections (Secciones):** Belong to a specific Team, support ordering by level.
- **Content (Contenido):** Belong to a Section.
- **Tags:** Associated with Content.

The application uses **Supabase** as its backend-as-a-service for database operations and **Tailwind CSS 4** for styling.

### Core Technologies
- **Framework:** Next.js 16 (App Router)
- **Library:** React 19
- **Backend:** Supabase (`@supabase/supabase-js`)
- **Styling:** Tailwind CSS 4, PostCSS
- **Language:** TypeScript
- **UI Feedback:** `react-hot-toast`

## Building and Running

### Prerequisites
- Node.js installed.
- Supabase environment variables configured in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Commands
- **Development:** `npm run dev` (Starts the development server on http://localhost:3000)
- **Build:** `npm run build` (Creates an optimized production build)
- **Start:** `npm start` (Starts the production server)
- **Lint:** `npm run lint` (Runs ESLint for code quality checks)

## Development Conventions

### Architecture
- **Client-Side Data Fetching:** Most pages use the `'use client'` directive and interact directly with Supabase via the client defined in `lib/supabase-client.tsx`.
- **Hierarchical Navigation:** Navigation follows the data hierarchy (Home -> Groups -> Teams -> Sections/Content).

### Coding Style
- **TypeScript:** Strict typing is used for data models (e.g., `Group`, `Team`, `Section`, `Content`, `Tag`).
- **Hooks:** Extensively uses `useEffect` and `useCallback` for data fetching and state management.
- **Components:** UI is built using functional components and Tailwind CSS for rapid styling.
- **Error Handling:** `react-hot-toast` is used for user-facing success and error notifications.

### File Structure
- `app/`: Contains the Next.js App Router pages and layouts.
  - `page.tsx`: Group management.
  - `grupos/page.tsx`: Team management for a specific group.
  - `equipos/page.tsx`: Section and content management for a specific team.
- `lib/`: Utility functions and shared clients (e.g., Supabase client).
- `public/`: Static assets.

## Database Schema (Inferred)
The application interacts with the following Supabase tables:
- `grupos`: `id`, `name`
- `equipos`: `id`, `groupId`, `name`
- `secciones`: `id`, `teamId`, `name`, `level`
- `contenido`: `id`, `teamId`, `sectionId`, `name`
- `tags`: `id`, `contentId`, `name`
