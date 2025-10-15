
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STOP = new Set([
  "the","a","an","and","or","for","to","of","in","on","with","by","at","as","is","are","was","were","be",
  "this","that","these","those","from","it","its","we","you","they","their","our","your","but","not","will",
  "can","may","should","would","could","if","then","than","so","such","into","over","under","about","across"
]);

const defaultSkills = [
  "javascript","typescript","react","node","next.js","python","java","c++","c#","sql","nosql","mongodb","postgres","mysql",
  "aws","gcp","azure","docker","kubernetes","ci/cd","jenkins","github actions","ml","nlp","tensorflow","pytorch",
  "golang","ruby","php","html","css","tailwind","jira","git","agile","scrum","kafka","spark","hadoop","linux","bash",
  "rest","graphql","microservices","terraform","ansible"
];

function tokenize(text: string) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+.#]+/g, " ")
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
  let s = 0;
  for (const [k, va] of a) { const vb = b.get(k); if (vb) s += va * vb; }
  return s;
}
function norm(a: Map<string, number>) {
  let s = 0; for (const [, v] of a) s += v * v; return Math.sqrt(s) || 1;
}
function cosineSim(a: Map<string, number>, b: Map<string, number>) {
  return dot(a, b) / (norm(a) * norm(b));
}

function estimateYears(text: string) {
  const m = text.match(/(\d+)\s*(\+)?\s*(?:years|yrs)\b/i); return m ? m[0] : "—";
}
function detectEducation(text: string) {
  const t = text.toLowerCase();
  if (t.includes("phd") || t.includes("doctor of philosophy")) return "PhD";
  if (t.includes("master of") || t.includes("msc") || t.includes("m.s.") || t.includes("mtech") || t.includes("m.tech")) return "Master's";
  if (t.includes("bachelor of") || t.includes("bsc") || t.includes("b.e.") || t.includes("btech") || t.includes("b.tech")) return "Bachelor's";
  return "—";
}
function snippet(text: string, jdTokens: string[]) {
  const lower = text.toLowerCase();
  for (const k of jdTokens) {
    const pos = lower.indexOf(k);
    if (pos >= 0) {
      const start = Math.max(0, pos - 80);
      const end = Math.min(text.length, pos + 120);
      return text.slice(start, end) + (end < text.length ? "..." : "");
    }
  }
  return text.slice(0, 200) + (text.length > 200 ? "..." : "");
}

async function bufferToText(filename: string, buf: Buffer): Promise<string> {
  const { fileTypeFromBuffer } = await import("file-type");
  const ft = await fileTypeFromBuffer(buf);
  const mime = ft?.mime || "";

  if (mime.includes("pdf") || filename.toLowerCase().endsWith(".pdf")) {
    try {
      const mod = await import("pdf-parse"); const pdf = (mod as any).default || (mod as any);
      const data = await pdf(buf); return data.text || "";
    } catch { /* fallthrough */ }
  }

  if (mime.includes("officedocument.wordprocessingml.document") || filename.toLowerCase().endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const res = await (mammoth as any).extractRawText({ buffer: buf });
      return res.value || "";
    } catch { /* fallthrough */ }
  }

  try { return new TextDecoder().decode(buf); } catch { return ""; }
}

async function ocrFallback(buf: Buffer): Promise<string> {
  if (process.env.OCR_ENABLED !== "true") return "";
  try {
    const tesseract = await import("tesseract.js");
    const { createWorker } = (tesseract as any);
    const worker = await createWorker();
    await worker.loadLanguage("eng"); await worker.initialize("eng");
    const { data: { text } } = await worker.recognize(buf);
    await worker.terminate();
    return text || "";
  } catch (e) { console.error("OCR error", e); return ""; }
}

async function embeddingSim(a: string, b: string): Promise<number> {
  if (!process.env.OPENAI_API_KEY) return 0;
  try {
    const { default: fetch } = await import("node-fetch");
    const model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
    async function embed(input: string) {
      const r = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model, input })
      });
      const j = await r.json();
      return j?.data?.[0]?.embedding as number[];
    }
    const [ea, eb] = await Promise.all([embed(a.slice(0,8000)), embed(b.slice(0,8000))]);
    if (!ea || !eb) return 0;
    const dot = ea.reduce((s, v, i) => s + v * eb[i], 0);
    const na = Math.sqrt(ea.reduce((s,v)=>s+v*v,0)) || 1;
    const nb = Math.sqrt(eb.reduce((s,v)=>s+v*v,0)) || 1;
    return dot/(na*nb);
  } catch { return 0; }
}

function scoreResume(jdText: string, resumeText: string, semBoost=0) {
  const jdTokensAll = tokenize(jdText);
  const rTokensAll  = tokenize(resumeText);
  const jdKeys = keywords(jdTokensAll, 3);
  const rKeys  = keywords(rTokensAll, 3);
  const jdSet = new Set(jdKeys); const rSet = new Set(rKeys);
  const overlap = [...jdSet].filter(t => rSet.has(t));
  const overlapScore = overlap.length / Math.max(1, jdSet.size);
  const jdBag = bag(jdKeys); const rBag = bag(rKeys);
  const cosine = cosineSim(jdBag, rBag);
  const skillHits = defaultSkills.filter(s => rTokensAll.includes(s));
  const skillScore = Math.min(1, skillHits.length / 10);
  const finalScore = Math.min(1, 0.45 * overlapScore + 0.30 * cosine + 0.20 * skillScore + 0.05 * semBoost);
  return {
    score: finalScore,
    evidence: [...new Set([...overlap.slice(0,6), ...skillHits.slice(0,6)])].slice(0,8),
    experience: estimateYears(resumeText),
    education: detectEducation(resumeText),
    snippet: snippet(resumeText, jdKeys),
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    let jdText = (form.get("jd") || "").toString();
    const jdFile = form.get("jdFile") as File | null;
    if ((!jdText || jdText.trim().length === 0) && jdFile) {
      const a = await jdFile.arrayBuffer(); jdText = await bufferToText(jdFile.name, Buffer.from(a));
    }
    const files = form.getAll("resumes").filter(Boolean) as File[];
    if ((!jdText || jdText.trim().length === 0) || files.length === 0) {
      return NextResponse.json({ error: "Missing job description (text or file) or resumes." }, { status: 400 });
    }

    const results: any[] = [];
    for (const f of files) {
      const a = await f.arrayBuffer(); let buf = Buffer.from(a);
      let text = await bufferToText(f.name, buf);
      let charCount = (text || "").trim().length;
      let notes = "";

      if (charCount < 120) {
        const ocrText = await ocrFallback(buf);
        if (ocrText && ocrText.trim().length > charCount) {
          text = ocrText; charCount = ocrText.trim().length; notes = "OCR used";
        } else if (f.name.toLowerCase().endsWith(".pdf")) {
          notes = "No extractable text — likely a scanned/image PDF. Provide DOCX/TXT or enable OCR.";
        } else {
          notes = "Very little text extracted.";
        }
      }

      const sem = await embeddingSim(jdText, text || "");
      const s = scoreResume(jdText, text || "", sem);
      results.push({ filename: f.name, ...s, notes, charCount });
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
