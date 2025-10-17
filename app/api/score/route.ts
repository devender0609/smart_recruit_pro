import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* =========================
   Generic text utilities
========================= */
const dec = new TextDecoder();
const STOP = new Set([
  "the","a","an","and","or","for","to","of","in","on","with","by","at","as","is","are","was","were","be","this","that","these","those","from","it","its","we","you","they","their","our","your",
  "but","not","will","can","may","should","would","could","if","then","than","so","such","into","over","under","about","across","within","without","per","via","using","use","used","including",
  "must","have","required","minimum","preferred","nice","experience","responsibilities","skills","requirements","summary","role","position","job","candidate","ability","knowledge"
]);

const MONTHS: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };

const normWS = (s:string)=>s.replace(/\u0000/g," ").replace(/\s+/g," ").trim();
const onlyLetters = (s:string)=>s.replace(/[^a-z]/g,"");

/* Tokenization (lowercase, basic symbols kept for bigrams like "kubernetes cluster") */
function tok(s:string) {
  return (s||"")
    .toLowerCase()
    .replace(/[^a-z0-9+./\- ]+/g," ")
    .split(/\s+/)
    .filter(Boolean);
}
function keywords(tokens:string[], min=3){ return tokens.filter(t => t.length>=min && !STOP.has(t)); }

function bag(tokens:string[]){ const m=new Map<string,number>(); for(const t of tokens) m.set(t,(m.get(t)||0)+1); return m; }
function dot(a:Map<string,number>, b:Map<string,number>){ let s=0; for(const[k,va] of a){ const vb=b.get(k); if(vb) s+=va*vb; } return s; }
function norm(a:Map<string,number>){ let s=0; for(const[,v] of a) s+=v*v; return Math.sqrt(s)||1; }
function cosine(a:Map<string,number>, b:Map<string,number>){ return dot(a,b)/(norm(a)*norm(b)); }

/* =========================
   Fuzzy matching (typo tolerant)
========================= */
/* Damerau-Levenshtein distance with transpositions */
function editDistance(a:string,b:string){
  const n=a.length, m=b.length;
  if(n===0) return m; if(m===0) return n;
  const INF = n+m;
  const da:Record<string,number> = {};
  const d = Array.from({length:n+2},()=>Array(m+2).fill(0));
  d[0][0]=INF;
  for(let i=0;i<=n;i++){ d[i+1][1]=i; d[i+1][0]=INF; }
  for(let j=0;j<=m;j++){ d[1][j+1]=j; d[0][j+1]=INF; }
  for(let i=1;i<=n;i++){
    let db=0;
    for(let j=1;j<=m;j++){
      const i1 = da[b[j-1]] || 0;
      const j1 = db;
      const cost = a[i-1]===b[j-1] ? 0 : 1;
      if(cost===0) db=j;
      d[i+1][j+1] = Math.min(
        d[i][j] + cost,
        d[i+1][j] + 1,
        d[i][j+1] + 1,
        d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1)  // transposition
      );
    }
    da[a[i-1]] = i;
  }
  return d[n+1][m+1];
}

/* Normalized similarity 0..1 */
function fuzzySim(a:string,b:string){
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if(!a || !b) return 0;
  if(a===b) return 1;
  const dist = editDistance(a,b);
  const maxLen = Math.max(a.length,b.length) || 1;
  return 1 - dist/maxLen;
}

/* Check if a multi-word term appears in text with fuzziness.
   - Exact substring → match
   - Else token-by-token fuzzy ≥ threshold, allowing minor typos/variants */
function fuzzyContains(textLower:string, term:string){
  const t = term.toLowerCase().trim();
  if(!t) return false;
  if(textLower.includes(t)) return true;

  const words = t.split(/\s+/).filter(Boolean);
  const textWords = textLower.split(/\s+/);

  const thr = t.length <= 6 ? 0.82 : 0.88; // shorter terms allow slightly lower threshold
  // sliding window compare
  for(let i=0;i<=textWords.length - words.length; i++){
    let ok = true;
    for(let k=0;k<words.length;k++){
      if(fuzzySim(words[k], textWords[i+k]) < thr){ ok=false; break; }
    }
    if(ok) return true;
  }
  return false;
}

/* =========================
   JD-driven skill extraction
========================= */
function collectAcronyms(text:string){
  // capture things like HIPAA, GDPR, PCI, ICH-GCP, CRM
  const set = new Set<string>();
  const acr = text.match(/\b[A-Z][A-Z0-9-]{2,8}\b/g) || [];
  for(const a of acr){
    if(a.length<=2) continue;
    set.add(a.toLowerCase());
  }
  return [...set];
}

function topDomainTerms(jdText:string){
  // derive frequent unigrams & bigrams in JD; keep domain-ish items
  const t = jdText.toLowerCase();
  const tokens = t.replace(/[^a-z0-9+./\- ]/g," ").split(/\s+/).filter(Boolean);
  const counts = new Map<string,number>();
  for(let i=0;i<tokens.length;i++){
    const w = tokens[i];
    if(!STOP.has(w) && w.length>=3){
      counts.set(w,(counts.get(w)||0)+1);
      if(i<tokens.length-1){
        const bi = `${w} ${tokens[i+1]}`;
        if(!/^\d/.test(tokens[i+1])) counts.set(bi,(counts.get(bi)||0)+1);
      }
    }
  }
  const items = [...counts.entries()]
    .filter(([k,v]) => v>=2 && k.length<=40)
    .sort((a,b)=>b[1]-a[1])
    .map(([k])=>k);

  const acr = collectAcronyms(jdText);
  const merged = [...new Set([...acr, ...items])];

  // soft filter to keep “domain-y” things:
  const domainy = merged.filter(k =>
    /[a-z]/.test(k) && // contains letters
    !/^(responsib|require|skill|years?|yrs|experience|role|team|work|good|strong|excellent)$/i.test(k)
  );
  return domainy.slice(0, 40); // cap to 40 domain terms max
}

function extractMustWindows(jdLower:string){
  // windows like: "must have", "required", "minimum", "nice to have", "preferred"
  const must = jdLower.match(/(?:must[- ]have|required|minimum)[^.\n]{0,240}/g) || [];
  const nice = jdLower.match(/(?:nice[- ]to[- ]have|preferred|bonus)[^.\n]{0,240}/g) || [];
  return { must, nice };
}

function pickJDMustAndNice(jdText:string){
  const lower = jdText.toLowerCase();
  const domain = topDomainTerms(jdText);
  const { must, nice } = extractMustWindows(lower);

  const pickFromWindows = (wins:string[])=>{
    const set=new Set<string>();
    for(const span of wins){
      for(const term of domain){
        if(term.length<3) continue;
        if(fuzzyContains(span, term)) set.add(term);
      }
    }
    return [...set];
  };

  let mustTerms = pickFromWindows(must);
  let niceTerms = pickFromWindows(nice);

  // If JD didn’t write explicit “must”, fallback to top domain terms
  if(mustTerms.length===0) {
    mustTerms = domain.slice(0, 8);
    niceTerms = domain.slice(8, 16);
  }

  return {
    must: mustTerms.slice(0, 10),   // keep up to 10 must-haves
    nice: niceTerms.slice(0, 10),   // keep up to 10 nice-to-haves
    domain
  };
}

/* =========================
   Resume signals (exp, edu, title)
========================= */
function parseMonthYear(s:string){
  s=s.toLowerCase().trim();
  const m1=s.match(/\b([a-z]{3,9})\s+(\d{4})\b/);
  if(m1 && MONTHS[m1[1].slice(0,3)]) return new Date(Number(m1[2]), MONTHS[m1[1].slice(0,3)], 1);
  const m2=s.match(/\b(19|20)\d{2}\b/);
  if(m2) return new Date(Number(m2[0]),0,1);
  return null;
}
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
  if(/\b(ph\.?d\.?|doctor of philosophy|doctorate)\b/.test(t)) return "PhD";
  if(/\b(mba|m\.?s\.?|m\.?sc\.?|master'?s|mtech|m\.?tech)\b/.test(t)) return "Master's";
  if(/\b(b\.?e\.?|b\.?tech|b\.?s\.?|bsc|bachelor'?s)\b/.test(t)) return "Bachelor's";
  if(/\bdiploma\b/.test(t)) return "Diploma";
  return "—";
}
function recentTitle(text:string){
  const blocks = text.split(/\n{2,}/).map(b=>b.trim()).filter(Boolean);
  const isTitle = (s:string)=>/(intern|junior|senior|staff|principal)?\s*(engineer|developer|manager|lead|architect|analyst|specialist|consultant|scientist|coordinator|associate|director|designer|account|sales|marketing|recruiter|operator|technician|nurse|assistant)\b/i.test(s);
  for(const b of blocks.slice(0,6)){
    if(/^(work\s+)?experience\b/i.test(b) || /(?:\b\d{4}\b).*?(?:present|current|\b\d{4}\b)/i.test(b)){
      const lines=b.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      for(const L of lines.slice(0,12)){
        const clean=L.replace(/\s{2,}/g," ");
        if(isTitle(clean) && clean.length<=120) return clean;
        const m=clean.match(/(.+?)\s+[–-]\s+(.+)|(.+?)\s+at\s+(.+)/i);
        if(m){ const t=[m[2],m[1],m[3],m[4]].filter(Boolean).find(isTitle); if(t) return t; }
      }
    }
  }
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  for(const L of lines.slice(0,60)){
    const clean=L.replace(/\s{2,}/g," ");
    if(isTitle(clean)&&clean.length<=120) return clean;
  }
  return "—";
}

/* =========================
   JD/Resume matching
========================= */
function computeMatches(jdTerms:string[], resumeLower:string){
  const matched:string[] = [];
  for(const term of jdTerms){
    if(fuzzyContains(resumeLower, term)) matched.push(term);
  }
  return matched;
}

function scoreHiringFit(matchedMust:string[], gapsMust:string[], matchedNice:string[], cos:number){
  // emphasize must-haves, then nice-to-haves, then global cosine
  const mustFrac = matchedMust.length / Math.max(1, matchedMust.length + gapsMust.length);
  const niceScore = Math.min(1, matchedNice.length / 6); // cap effect
  let s = 0.65*mustFrac + 0.20*niceScore + 0.15*cos;
  return Math.max(0, Math.min(1, s));
}

function looksLikePdfObjects(s:string){ return /%PDF-|\/Type\s*\/XObject|\/Subtype\s*\/(Image|Form)|\/CCITTFaxDecode|endobj|stream/i.test(s); }
function isMostlyNoise(s:string){ if(!s) return true; const c=s.replace(/\s/g,""); if(c.length<40) return true; const letters=(c.match(/[a-zA-Z]/g)||[]).length; return letters/c.length<0.35; }

/* =========================
   Parse buffers (PDF/DOCX/TXT)
========================= */
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

/* =========================
   Main scorer
========================= */
function summarize(jdText:string, resumeText:string){
  const jdTokens = keywords(tok(jdText),3);
  const rTokens  = keywords(tok(resumeText),3);
  const cos = cosine(bag(jdTokens), bag(rTokens));

  const { must, nice } = pickJDMustAndNice(jdText);
  const resumeLower = resumeText.toLowerCase();

  const matchedMust = computeMatches(must, resumeLower);
  const matchedNice = computeMatches(nice, resumeLower);
  const gapsMust    = must.filter(t => !matchedMust.includes(t));

  const years = totalExperience(resumeText);
  const edu   = highestEducation(resumeText);
  const title = recentTitle(resumeText);

  const score = scoreHiringFit(matchedMust, gapsMust, matchedNice, cos);
  const recommend = score >= 0.60 && matchedMust.length >= Math.max(1, Math.ceil(must.length*0.4));

  // For display: keep top 6 key matches (favor must over nice)
  const keyMatches = [...matchedMust, ...matchedNice.filter(x=>!matchedMust.includes(x))].slice(0,6);

  return { score, recommend, years, education: edu, recentTitle: title, matches: keyMatches, gaps: gapsMust };
}

/* =========================
   Route handlers
========================= */
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

    // Resume provided as plain text (client OCR path)
    const resumeText = (form.get("resumeText") || "").toString();
    const resumeName = (form.get("resumeName") || "").toString() || "resume.txt";

    if (resumeText && resumeText.trim().length > 0) {
      const s = summarize(jdText, resumeText);
      return NextResponse.json({
        results: [{ filename: resumeName, ...s, notes: "Client text provided" }]
      });
    }

    // Otherwise parse the uploaded file server-side (single per request)
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

    const s = summarize(jdText, text || "");

    return NextResponse.json({
      results: [{ filename: f.name, ...s, notes: notes.join("; ") || "—" }]
    });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

export async function GET() {
  return new Response("score API OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
