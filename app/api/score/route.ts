import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ---------------- Minimal helpers tuned for hiring view ---------------- */
const STOP = new Set([
  "the","a","an","and","or","for","to","of","in","on","with","by","at","as","is","are","was","were","be","this","that","these","those","from","it","its","we","you","they","their","our","your","but","not","will","can","may","should","would","could","if","then","than","so","such","into","over","under","about","across"
]);

const KNOWN_SKILLS = [
  "react","next.js","typescript","javascript","node","python","java","c#","c++","go","golang","ruby","php",
  "sql","postgres","mysql","mongodb","nosql","redis","graphql",
  "aws","gcp","azure","docker","kubernetes","terraform","ansible","linux",
  "ci/cd","jenkins","github actions","kafka","spark","hadoop",
  "ml","machine learning","nlp","pytorch","tensorflow","scikit-learn",
  "html","css","tailwind"
];

const SYNONYM_CANON: Record<string,string[]> = {
  "ci/cd": ["ci/cd","continuous integration","continuous delivery","continuous deployment"],
  "next.js": ["next.js","next"],
  "c#": ["c#","c sharp"],
  "c++": ["c++","cpp"],
  "ml": ["ml","machine learning"],
  "sql": ["sql","postgres","mysql","mariadb","sql server"]
};

const MONTHS: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
const dec = new TextDecoder();
const normWS = (s:string)=>s.replace(/\u0000/g," ").replace(/\s+/g," ").trim();

function tok(s:string){return (s||"").toLowerCase().replace(/[^a-z0-9+.#/ ]+/g," ").split(/\s+/).filter(Boolean);}
function keywords(toks:string[],min=3){return toks.filter(t=>t.length>=min && !STOP.has(t));}
function bag(tokens:string[]){const m=new Map<string,number>(); for(const t of tokens)m.set(t,(m.get(t)||0)+1); return m;}
function dot(a:Map<string,number>,b:Map<string,number>){let s=0; for(const[k,va]of a){const vb=b.get(k); if(vb)s+=va*vb;} return s;}
function norm(a:Map<string,number>){let s=0; for(const[,v]of a)s+=v*v; return Math.sqrt(s)||1;}
function cos(a:Map<string,number>,b:Map<string,number>){return dot(a,b)/(norm(a)*norm(b));}

function foldSynonymsPresent(textLower:string, items:string[]){
  const present = new Set<string>();
  for (const canon of items){
    const alts = SYNONYM_CANON[canon] || [canon];
    if (alts.some(a => textLower.includes(a))) present.add(canon);
  }
  return [...present];
}

function looksLikePdfObjects(s:string){
  return /%PDF-|\/Type\s*\/XObject|\/Subtype\s*\/(Image|Form)|\/CCITTFaxDecode|endobj|stream/i.test(s);
}
function isMostlyNoise(s:string){
  if(!s) return true;
  const c = s.replace(/\s/g,"");
  if (c.length < 40) return true;
  const letters = (c.match(/[a-zA-Z]/g)||[]).length;
  return letters/c.length < 0.35;
}

/* ------------ Experience, Education, Recent Title (simple, robust) ------------ */
function parseMonthYear(s:string){s=s.toLowerCase().trim(); const m1=s.match(/\b([a-z]{3,9})\s+(\d{4})\b/); if(m1 && MONTHS[m1[1].slice(0,3)]) return new Date(Number(m1[2]), MONTHS[m1[1].slice(0,3)], 1); const m2=s.match(/\b(19|20)\d{2}\b/); if(m2) return new Date(Number(m2[0]),0,1); return null;}
function totalExperience(text:string){
  const now=new Date(); let months=0;
  const re=new RegExp(["([A-Za-z]{3,9}\\s+\\d{4})\\s*[-–—to]+\\s*(Present|Now|Current|[A-Za-z]{3,9}\\s+\\d{4}|(19|20)\\d{2})","((19|20)\\d{2})\\s*[-–—to]+\\s*(Present|Now|Current|(19|20)\\d{2})"].join("|"),"gi");
  const seen=new Set<string>(); let m:RegExpExecArray|null;
  while((m=re.exec(text))!==null){const raw=m[0]; if(seen.has(raw))continue; seen.add(raw);
    const parts=raw.split(/[-–—to]+/i).map(s=>s.trim());
    const start=parseMonthYear(parts[0]); const endToken=parts[1]?.toLowerCase();
    const end = /present|now|current/.test(endToken||"") ? now : parseMonthYear(parts[1]||"");
    if(start){const ed=end||now; const dm=(ed.getFullYear()-start.getFullYear())*12+(ed.getMonth()-start.getMonth()); if(dm>0 && dm<80*12) months+=dm;}
  }
  if (months<=0) {
    const phrase = text.match(/(\d+)\s*(\+)?\s*(?:years|yrs)\s+(?:of\s+)?(?:experience|exp)\b/i);
    if (phrase) return `${phrase[1]}${phrase[2]?"+":""} yrs`;
    return "—";
  }
  const yrs = months/12; return yrs>=0.5 ? `${yrs.toFixed(1)} yrs` : `${months} mos`;
}
function highestEducation(text:string){
  const t=text.toLowerCase();
  if (/(phd|doctor of philosophy|doctorate)\b/.test(t)) return "PhD";
  if (/(mba|master of|m\.s\.|msc|mtech|m\.tech|mscs|ms in)\b/.test(t)) return "Master's";
  if (/(bachelor of|b\.s\.|bs in|bsc|b\.tech|btech|b\.e\.)\b/.test(t)) return "Bachelor's";
  if (/diploma in\b/.test(t)) return "Diploma";
  return "—";
}
function recentTitle(text:string){
  // pick the first plausible title line near "Experience"/role bullets
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  for (let i=0;i<Math.min(lines.length,80);i++){
    const L = lines[i];
    if (/^(experience|work experience)\b/i.test(L)) continue;
    // heuristics
    if (/(engineer|developer|manager|lead|architect|analyst|consultant|specialist|director)\b/i.test(L) && L.length<120) {
      return L.replace(/\s{2,}/g," ");
    }
  }
  // fallback: first short line
  return lines[0]?.slice(0,120) || "—";
}

/* ---------------------- JD skill extraction & scoring ---------------------- */
function pickJDMustHaveSkills(jdText:string){
  const lower = jdText.toLowerCase();
  // intersect JD with known skills (+ synonyms)
  const presentCanon = new Set(foldSynonymsPresent(lower, Object.keys(SYNONYM_CANON)).concat(
    KNOWN_SKILLS.filter(s=>lower.includes(s))
  ));
  // keep top 6
  return [...presentCanon].slice(0,6);
}

function scoreAndSummarize(jdText:string, resumeText:string){
  const jdKeys = keywords(tok(jdText),3);
  const rKeys  = keywords(tok(resumeText),3);

  const jdBag = bag(jdKeys), rBag = bag(rKeys);
  const cosine = cos(jdBag, rBag);

  const must = pickJDMustHaveSkills(jdText);
  const lower = resumeText.toLowerCase();

  const matched = foldSynonymsPresent(lower, must);
  const gaps    = must.filter(m => !matched.includes(m));
  const matchFrac = must.length ? matched.length / must.length : 0;

  // overall score tuned to hiring view
  const final = Math.min(1, 0.55*matchFrac + 0.45*cosine);

  const yrs = totalExperience(resumeText);
  const edu = highestEducation(resumeText);
  const title = recentTitle(resumeText);

  // simple recommendation rule; tune as desired
  const recommend = final >= 0.55 && matched.length >= Math.max(2, Math.ceil(must.length*0.5));

  return {
    score: final,                 // 0..1
    recommend,                    // boolean
    years: yrs,                   // "X.Y yrs"
    education: edu,               // "Master's" etc.
    recentTitle: title,           // last/first role line
    matches: matched,             // must-have hits
    gaps                           // must-have misses
  };
}

/* -------------------------- parsing utilities -------------------------- */
async function bufferToText(filename: string, buf: Buffer): Promise<{ text: string; raw: string }> {
  const { fileTypeFromBuffer } = await import("file-type");
  const ft = await fileTypeFromBuffer(buf);
  const mime = ft?.mime || "";
  const lower = filename.toLowerCase();

  if (mime.includes("pdf") || lower.endsWith(".pdf")) {
    try {
      const mod = await import("pdf-parse");
      const pdf = (mod as any).default || (mod as any);
      const data = await pdf(buf);
      const raw = (data.text || "").trim();
      if (raw.length > 0) return { text: normWS(raw), raw };
    } catch {}
  }

  if (mime.includes("officedocument.wordprocessingml.document") || lower.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const res = await (mammoth as any).extractRawText({ buffer: buf });
      const raw = (res.value || "").trim();
      return { text: normWS(raw), raw };
    } catch {}
  }

  try { const raw = dec.decode(buf); return { text: normWS(raw), raw }; } catch { return { text:"", raw:"" }; }
}

/* ------------------------------- route ------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // JD (text or file)
    let jdText = (form.get("jd") || "").toString().trim();
    const jdFile = form.get("jdFile") as File | null;
    if ((!jdText || jdText.length === 0) && jdFile) {
      const ab = await jdFile.arrayBuffer();
      const { text } = await bufferToText(jdFile.name, Buffer.from(ab));
      jdText = text;
    }

    // Fast path: client already OCR’d/extracted text
    const resumeText = (form.get("resumeText") || "").toString();
    const resumeName = (form.get("resumeName") || "").toString() || "resume.txt";

    if (resumeText && resumeText.trim().length > 0) {
      const s = scoreAndSummarize(jdText, resumeText);
      return NextResponse.json({
        results: [{
          filename: resumeName,
          ...s,
          notes: "Client text provided"
        }]
      });
    }

    // Otherwise parse the uploaded (single) file
    const files = form.getAll("resumes").filter(Boolean) as File[];
    if ((!jdText || jdText.length === 0) || files.length === 0) {
      return NextResponse.json({ error: "Missing job description or resumes." }, { status: 400 });
    }

    const f = files[0];
    const ab = await f.arrayBuffer();
    const buf = Buffer.from(ab);
    const { text, raw } = await bufferToText(f.name, buf);

    let notes: string[] = [];
    if (!text || isMostlyNoise(text) || looksLikePdfObjects(raw)) {
      notes.push("No/low extractable text (scan?)");
    }

    const s = scoreAndSummarize(jdText, text || "");

    return NextResponse.json({
      results: [{
        filename: f.name,
        ...s,
        notes: notes.join("; ") || "—"
      }]
    });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

export async function GET() {
  return new Response("score API OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
