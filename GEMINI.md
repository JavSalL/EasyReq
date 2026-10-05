# Gemini Project Context: EasyReq

## Project Overview
This is a web application built with **Next.js 16** (using the App Router) and **React 19**. It serves as a comprehensive requirements management system (EasyReq):
- **Projects (Proyectos):** Top-level software projects with system types.
- **Teams (Equipos):** Development teams associated with projects and members with roles.
- **Requirements (Requerimientos):** System requirements with AI assistance (Gemini), modalities, status, and audit logs.
- **Patterns & Models (Patrones y Modelos):** Templates and standards like EARS, IEEE 830, and Agile User Stories.

The application uses **Firebase** (Firebase Authentication and Cloud Firestore) as its backend-as-a-service and **Tailwind CSS 4** for styling.

### Core Technologies
- **Framework:** Next.js 16 (App Router)
- **Library:** React 19
- **Backend:** Firebase (Firebase Auth, Cloud Firestore)
- **AI Integration:** Google Gemini API (REST), called only from a Cloudflare Worker (`workers/ai-proxy`)
- **Styling:** Tailwind CSS 4, PostCSS, Lucide React
- **Language:** TypeScript
- **UI Feedback:** `react-hot-toast`
- **Deployment:** Firebase Hosting (`easy-req.web.app`)

## Building and Running

### Prerequisites
- Node.js installed.
- Firebase and AI environment variables configured in `.env.local`:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
  - `NEXT_PUBLIC_AI_API_URL` (URL of the AI Worker, e.g. `https://easyreq-ai.<subdomain>.workers.dev`)
- The Gemini API key must NEVER be in `.env.local` or any `NEXT_PUBLIC_*` variable. It lives only as a Worker secret (`GEMINI_API_KEY`).

### Commands
- **Development:** `npm run dev` (Starts development server on http://localhost:3000)
- **Build & Export:** `npm run build` (Generates optimized static export in `out/`)
- **Deploy:** `firebase deploy` (Deploys Firestore rules and static hosting)
- **AI Worker** (run inside `workers/ai-proxy`):
  - `npm run dev` (local Worker on http://localhost:8787; secret in `.dev.vars`, run `npm run db:init:local` once)
  - `npm run deploy` (deploys to Cloudflare Workers)
  - `npx wrangler secret put GEMINI_API_KEY` (sets/rotates the Gemini key)

## Architecture & Conventions
- **Client-Side Data Fetching:** App Router client components interact with Firestore via services in `lib/firestore-service.ts`.
- **Authentication:** Managed via `lib/firebase-auth-provider.tsx` with user profiles in Firestore `perfil_usuario`.
- **Security Rules:** Defined in `firestore.rules`.
- **AI calls:** `lib/ai-actions.ts` sends the user's Firebase ID token to the Cloudflare Worker (`workers/ai-proxy`). The Worker verifies the token (`jose` + Google JWKS), applies a per-user burst limit (Workers Rate Limiting, 10/min) and a daily quota (D1, `DAILY_LIMIT`), builds the prompts server-side and calls Gemini. Prompts live in `workers/ai-proxy/src/prompts.ts`, never in the client.
