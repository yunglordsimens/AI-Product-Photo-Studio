# AI Product Photo Studio

Private tool for OFST: a moodboard canvas plus **Catalog mode**, which re-shoots a client's real product photos in one consistent style.

## Catalog mode
1. **Style reference** – 1–3 images of how the whole catalog should look. "Описать стиль" writes the recipe (angle, background, light, framing, colour) from them.
2. **Product photos** – upload a folder or files; file names become item names.
3. **Run** – test on one photo, then the rest. Low temperature + fixed recipe + fixed aspect ratio keeps shots identical. Changing settings creates a new version; old versions stay.
4. **Review** – before/after grid, compare view (← → to browse, A to approve), regenerate single items.
5. **Export** – ZIP of approved shots (or all finished ones if none approved).

Always check by eye: food must stay the same dish and portion; label text on packaging can come back garbled; event photos are enhanced only.

## Packaging prototype
The **Упаковка** workspace is an early, separate view inside each studio project. It keeps an editable intake brief beside the existing Creative Workspace, parses an uploaded SVG dieline (up to 2 MB), shows a sanitized 2D preview and extracted text, builds client questions from missing fields, and marks unresolved product, legal and print checks. The optional Gemini summary is a draft only; legal requirements are not yet backed by a verified rules database and are never marked compliant.

Use the existing board for reference images, then select up to three in the Packaging view for analysis. Packaging data is saved with the project and follows the existing project storage/cloud sync. PDF parsing, dieline editing, verified compliance rules, and print-ready SVG/PDF export remain follow-up work.

## Access
Requests go through `/api/gemini` (Vercel function). Set in Vercel → Settings → Environment Variables:
- `GEMINI_API_KEY` – Google AI Studio key (server only)
- `STUDIO_PASSWORD` – typed once in the app's settings

## Cloud
`/api/cloud` keeps every device in step: documents (one per project, positions, catalog, prompts) in Neon Postgres, photos in Cloudflare R2 stored once by content hash. The browser stays the working copy and works offline; changes go up a few seconds later. Writes carry the cloud version they are based on, so nothing is overwritten silently: if two devices changed the same thing, the studio asks which version to keep.
Turn it on per device: Settings → Облако → «Перенести в облако и подключить». Needs, besides `STUDIO_PASSWORD`:
- `DATABASE_URL` – added by the Neon integration in Vercel (`POSTGRES_URL` also works)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`

For local `npm run dev` there is no `/api`; paste a personal key in settings instead (stored only in that browser).
Never use `VITE_`-prefixed variables for keys: they are embedded in the public bundle.
