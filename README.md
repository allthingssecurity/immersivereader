Lumen Reader
============

Premium‑quality, open‑source immersive reader for PDFs. Runs 100% locally in the browser using React + Vite + TypeScript with Tailwind. Text extraction uses Mozilla pdf.js; optional OCR via Tesseract.js is off by default.

Why Vite + React (not Next.js)
- Fully local app with no server rendering needs.
- Smaller bundle and simpler static hosting.
- Faster dev server and HMR for rapid iteration.

Features
- Library with IndexedDB storage for large files and metadata.
- PDF import (drag/drop and picker planned), shows basic metadata.
- Extraction worker with Fast/Accurate modes; hyphenation fixes; paragraph heuristics.
- Immersive Reading View with themeable CSS variables, typography controls, and virtualization for performance.
- Read‑Aloud via Web Speech API (UI coming in subsequent steps in this build).
- Preferences persisted in localStorage.
- Fallback PDF canvas view planned for extraction failures.
- Export extracted content as .txt or .md (coming in subsequent steps).

Setup
- Node 18+
- npm install
- npm run dev
- npm run build; npm run preview

Security
- Treats PDF content as untrusted; sanitized HTML before inserting into DOM (DOMPurify).
- No network calls for parsing, TTS, or translation.

Open‑source licensing checklist
- pdf.js (pdfjs-dist): Apache-2.0
- Tesseract.js: Apache-2.0
- React: MIT
- Vite: MIT
- Tailwind CSS: MIT
- DOMPurify: Apache-2.0
- OpenDyslexic font (to be added): SIL Open Font License

Commercial readiness (next steps)
- Authentication (optional) if adding cloud sync.
- Optional cloud sync of library and reading progress via user-selected storage (self-hosted).
- Add E2E encryption if syncing.
- Robust PDF fallback canvas viewer; advanced extraction heuristics; TOC builder.

