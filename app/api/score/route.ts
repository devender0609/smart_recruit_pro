import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ---------------------------- text + scoring utils --------------------------- */

const STOP = new Set([
  "the","a","an","and","or","for","to","of","in","on","with","by","at","as","is","are","was","were","be",
  "this","that","these","those","from","it","its","we","you","they","their","our","your","but","not","will",
  "can","may","should","would","could","if","then","than","so","such","into","over","under","about","across"
]);

const defaultSkills = [
  "react","next.js","typescript","javascript","node","python","java","c#","c++","sql","nosql","mongodb","postgres","mysql",
  "aws","gcp","azure","docker","kubernetes","ci/cd","jenkins","github actions","ml","machine learning","nlp","pytorch","tensorflow",
  "golang","ruby","php","html","css","tailwind","kafka","spark","hadoop","linux","bash","graphql","microservices","terraform","ansible"
];

const synonyms: Record<string, string[]> = {
  "ml": ["machine learning","ml"],
  "ci/cd": ["ci/cd","continuous integration","continuous delivery","continuous deployment"],
  "next.js": ["next","next.js"],
  "c#": ["c sharp","c#"],
  "c++": ["c++","cpp"],
  "sql": ["sql","postgres","mysql","mariadb","sql server"],
  "aws": ["aws","amazon web services"],
};

const dec = new TextDecoder();
const normalizeWS = (s: string) => s.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();

function tokenize(text: string) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+.#/ ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
function keywords(tokens: string[], minLen = 3) {
  return tokens.filter(t => t.length >= minLen && !STOP.has(t));
}
function bag(tokens: string[]) {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}
function dot(a: Map<string, number>, b: Map<string, number>) {
  let s = 0; for (const [k, va] of a) { const vb = b.get(k); if (vb) s += va * vb; } return s;
}
function norm(a: Map<string, number>) { let s = 0; for (const [, v] of a) s += v * v; return Math.sqrt(s) || 1; }
function cosineSim(a: Map<string, number>, b: Map<string, number>) { return dot(a,b)/(norm(a)*norm(b)); }

function cleanPdfArtifacts(text: string) {
  const lines = text.split(/\r?\n/).filter(l =>
    !/<<\s*\/Type\s*\/XObject/i.test(l) &&
    !/\/Subtype\s*\/(Image|Form)/i.test(l) &&
    !/\/BitsPerComponent/i.test(l) &&
    !/\/Length\s+\d+/i.test(l) &&
    !/stream\s*$/i.test(l) &&
    !/endobj/i.test(l)
  );
  return normalizeWS(lines.join(" "));
}

/* ----------------------------- Experience (yrs) ----------------------------- */

const MONTHS: Record<string, number> = {
  jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11
};

function parseMonthYear(s: string): Date | null {
  s = s.toLowerCase().trim();
  const m1 = s.match(/\b([a-z]{3,9})\s+(\d{4})\b/);
  if (m1 && MONTHS[m1[1].slice(0,3)]) {
    return new Date(Number(m1[2]), MONTHS[m1[1].slice(0,3)], 1);
  }
  const m2 = s.match(/\b(19|20)\d{2}\b/);
  if (m2) return new Date(Number(m2[0]), 0, 1);
  return null;
}

function sumExperienceYears(text: string): string {
  const now = new Date();
  let months = 0;

  const rangeRe = new RegExp(
    [
      "([A-Za-z]{3,9}\\s+\\d{4})\\s*[-–—to]+\\s*(Present|Now|Current|[A-Za-z]{3,9}\\s+\\d{4}|(19|20)\\d{2})",
      "((19|20)\\d{2})\\s*[-–—to]+\\s*(Present|Now|Current|(19|20)\\d{2})"
    ].join("|"),
    "gi"
  );

  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text)) !== null) {
    const raw = m[0];
    if (seen.has(raw)) continue;
    seen.add(raw);

    const parts = raw.split(/[-–—to]+/i).map(s => s.trim());
    const start = parseMonthYear(parts[0]);
    const endToken = parts[1]?.toLowerCase();
    const end =
      /present|now|current/.test(endToken || "") ? now : parseMonthYear(parts[1] || "");

    if (start) {
      const endDate = end || now;
      const dm = (endDate.getFullYear() - start.getFullYear()) * 12 + (endDate.getMonth() - start.getMonth());
      if (dm > 0 && dm < 80 * 12) months += dm;
    }
  }

  if (months < 12) {
    const expPhrase = text.match(/(\d+)\s*(\+)?\s*(?:years|yrs)\s+(?:of\s+)?(?:experience|exp)\b/i);
    if (expPhrase) return `${expPhrase[1]}${expPhrase[2] ? "+" : ""} yrs`;
  }

  if (months <= 0) return "—";
  const yrs = months / 12;
  return yrs >= 0.5 ? `${yrs.toFixed(1)} yrs` : `${months} mos`;
}

/* -------------------------------- Education -------------------------------- */

function detectEducation(text: string) {
  const t = text.toLowerCase();
  if (/(phd|doctor of philosophy|doctorate)\b/.test(t)) return "PhD";
  if (/(mba|master of|m\.s\.|msc|mtech|m\.tech|mscs|ms in)\b/.test(t)) return "Master's";
  if (/(bachelor of|b\.s\.|bs in|bsc|b\.tech|btech|b\.e\.)\b/.test(t)) return "Bachelor's";
  if (/diploma in\b/.test(t)) return "Diploma";
  return "—";
}

/* --------------------------------- Snippet --------------------------------- */

function extractSnippet(text: string, jdTokens: string[]) {
  const clean = text.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  for (const k of jdTokens) {
    const pos = lower.indexOf(k);
    if (pos >= 0) {
      const start = clean.lastIndexOf(". ", Math.max(0, pos - 120)) + 1;
      const end = clean.indexOf(". ", pos + 20);
      if (end > start) return clean.slice(start, Math.min(end + 1, start + 260));
    }
  }
  return clean.slice(0, 240) + (clean.length > 240 ? "…" : "");
}

function foldSynonyms(textLower: string) {
  const hits: string[] = [];
  for (const canon in synonyms) {
    if (synonyms[canon].some(s => textLower.includes(s))) hits.push(canon);
  }
  return hits;
}

/* ---------------------------- Parsing (lazy import) ---------------------------- */

async function bufferToText(filename: string, buf: Buffer): Promise<string> {
  const { fileTypeFromBuffer } = await import("file-type");
  const ft = await fileTypeFromBuffer(buf);
  const mime = ft?.mime || "";
  const lower = filename.toLowerCase();

  if (mime.includes("pdf") || lower.endsWith(".pdf")) {
    try {
      const mod = await import("pdf-parse");
      const pdf = (mod as any).default || (mod as any);
      const data = await pdf(buf);
      if (data.text && data.text.trim().length > 40) {
        return cleanPdfArtifacts(data.text);
      }
    } catch {}
  }

  if (mime.includes("officedocument.wordprocessingml.document") || lower.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const res = await (mammoth as any).extractRawText({ buffer: buf });
      if (res.value) return normalizeWS(res.value);
    } catch {}
  }

  try {
    return normalizeWS(dec.decode(buf));
  } catch {
    return "";
  }
}

async function ocrFallback(buf: Buffer): Promise<string> {
  if (process.env.OCR_ENABLED !== "true") return "";
  try {
    const tesseract = await import("tesseract.js");
    const { createWorker } = (tesseract as any);
    const worker = await createWorker();
    await worker.loadLanguage("eng");
    await worker.initialize("eng");
    const { data: { text } } = await worker.recognize(buf);
    await worker.terminate();
    return normalizeWS(text || "");
  } catch {
    return "";
  }
}

/* -------------------------- Optional embedding boost ------------------------- */

async function embeddingSim(a: string, b: string): Promise<number> {
  if (!process.env.OPENAI_API_KEY) return 0;
  try {
    const model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
    const embed = async (input: string) => {
      const r = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model, input })
      });
      const j = await r.json();
      return j?.data?.[0]?.embedding as number[] | undefined;
    };
    const [ea, eb] = await Promise.all([embed(a.slice(0, 8000)), embed(b.slice(0, 8000))]);
    if (!ea || !eb) return 0;
    const d = ea.reduce((s, v, i) => s + v * eb[i], 0);
    const na = Math.sqrt(ea.reduce((s, v) => s + v * v, 0)) || 1;
    const nb = Math.sqrt(eb.reduce((s, v) => s + v * v, 0)) || 1;
    return d / (na * nb);
  } catch {
    return 0;
  }
}

/* --------------------------------- Scoring --------------------------------- */

function scoreResume(jdText: string, resumeText: string, semBoost = 0) {
  const jdTokensAll = tokenize(jdText);
  const rTokensAll  = tokenize(resumeText);

  const jdKeys = keywords(jdTokensAll, 3);
  const rKeys  = keywords(rTokensAll, 3);

  const jdSet = new Set(jdKeys);
  const rSet  = new Set(rKeys);

  const overlap = [...jdSet].filter(t => rSet.has(t));
  const overlapScore = overlap.length / Math.max(1, jdSet.size);

  const jdBag = bag(jdKeys), rBag = bag(rKeys);
  const cosine = cosineSim(jdBag, rBag);

  const lower = resumeText.toLowerCase();
  const synHits = foldSynonyms(lower);
  const skillHits = [...new Set(defaultSkills.filter(s => lower.includes(s)).concat(synHits))];
  const skillScore = Math.min(1, skillHits.length / 12);

  const finalScore = Math.min(1,
    0.35 * overlapScore +
    0.30 * cosine +
    0.25 * skillScore +
    0.10 * semBoost
  );

  return {
    score: finalScore,
    evidence: [...new Set([...overlap.slice(0,6), ...skillHits.slice(0,6)])].slice(0,8),
    experience: sumExperienceYears(resumeText),
    education: detectEducation(resumeText),
    snippet: extractSnippet(resumeText, jdKeys),
  };
}

/* --------------------------------- Routes --------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    let jdText = (form.get("jd") || "").toString().trim();
    const jdFile = form.get("jdFile") as File | null;
    if ((!jdText || jdText.length === 0) && jdFile) {
      const a = await jdFile.arrayBuffer();
      jdText = await bufferToText(jdFile.name, Buffer.from(a));
    }

    const files = form.getAll("resumes").filter(Boolean) as File[];
    if ((!jdText || jdText.length === 0) || files.length === 0) {
      return NextResponse.json({ error: "Missing job description (text or file) or resumes." }, { status: 400 });
    }

    const results: any[] = [];
    for (const f of files) {
      const a = await f.arrayBuffer(); const buf = Buffer.from(a);

      let text = await bufferToText(f.name, buf);
      let charCount = (text || "").trim().length;
      let notes = "";

      if (charCount < 120) {
        const ocrText = await ocrFallback(buf);
        if (ocrText && ocrText.length > charCount) {
          text = ocrText; charCount = ocrText.length; notes = "OCR used";
        } else if (f.name.toLowerCase().endsWith(".pdf")) {
          notes = "No extractable text — likely a scanned/image PDF. Provide DOCX/TXT or enable OCR.";
        } else {
          notes = "Very little text extracted.";
        }
      }

      const sem = await embeddingSim(jdText, text || "");
      const s = scoreResume(jdText, text || "", sem);

      results.push({ filename: f.name, ...s, charCount, notes });
    }

    results.sort((a,b)=>b.score-a.score);
    return NextResponse.json({ results });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

export async function GET() {
  return new Response("score API OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
