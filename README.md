
# SmartRecruit Pro — Robust Edition

Features
- JD paste or upload (PDF/DOCX/TXT)
- Multi-resume upload (PDF/DOCX/TXT)
- PDF/DOCX parsing with lazy imports
- **OCR fallback** (Tesseract.js) when text is missing — toggle with `OCR_ENABLED=true`
- **Optional embeddings** via OpenAI to boost scoring — set `OPENAI_API_KEY`
- Optional **S3 presigned uploads** endpoint `/api/presign` (set AWS creds + S3_BUCKET)
- Results table shows score, evidence, snippet, **charCount** and **notes**
- CSV export

## Local
```bash
npm install
npm run dev
```

## Build & Start
```bash
npm run build
npm start
```

## Environment variables
- `OCR_ENABLED=true` (enable Tesseract OCR fallback)
- `OPENAI_API_KEY=<key>` (enables embeddings for semantic boost)
- `OPENAI_EMBED_MODEL=text-embedding-3-small` (default)
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` (for presigned uploads)
