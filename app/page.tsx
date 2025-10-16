"use client";
import { useState } from "react";
import ResultsTable from "../components/ResultsTable";

// quick detector for scanned PDFs
function looksLikePdfObjects(s: string) {
  return /%PDF-|\/Type\s*\/XObject|\/Subtype\s*\/(Image|Form)|\/CCITTFaxDecode|endobj|stream/i.test(s);
}

async function readAsTextIfPlain(file: File): Promise<string> {
  try {
    const ab = await file.arrayBuffer();
    const peek = new TextDecoder().decode(new Uint8Array(ab).slice(0, 2048));
    if (looksLikePdfObjects(peek)) return "";
    return new TextDecoder().decode(ab);
  } catch {
    return "";
  }
}

// client-side OCR (tesseract.js)
async function ocrInBrowser(file: File): Promise<string> {
  const tesseract = await import("tesseract.js");
  const { createWorker } = (tesseract as any);
  const worker = await createWorker();
  try {
    await worker.loadLanguage("eng");
    await worker.initialize("eng");
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    return (text || "").replace(/\s+/g, " ").trim();
  } catch {
    try { await worker.terminate(); } catch {}
    return "";
  }
}

export default function Page() {
  const [jd, setJd] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [progress, setProgress] = useState("");

  function pLimit(n: number) {
    const running: Promise<any>[] = [];
    let active = 0;
    const next = async (fn: () => Promise<any>) => {
      while (active >= n) await Promise.race(running);
      active++;
      const p = fn().finally(() => {
        active--;
        const i = running.indexOf(p);
        if (i >= 0) running.splice(i, 1);
      });
      running.push(p);
      return p;
    };
    return next;
  }

  async function extractResumeText(file: File): Promise<{ text: string; notes: string[] }> {
    const notes: string[] = [];
    const name = file.name.toLowerCase();
    if (name.endsWith(".txt")) {
      return { text: await file.text(), notes };
    }
    if (name.endsWith(".pdf")) {
      const peek = await file.slice(0, 4096).text().catch(() => "");
      if (peek && !looksLikePdfObjects(peek)) {
        return { text: "", notes }; // server can parse text-PDF
      }
      const quick = await readAsTextIfPlain(file);
      if (quick && !looksLikePdfObjects(quick)) {
        return { text: quick, notes };
      }
      setProgress(`OCR: ${file.name}`);
      const ocr = await ocrInBrowser(file);
      if (ocr && ocr.length > 40) {
        notes.push("Client OCR used");
        return { text: ocr, notes };
      }
      notes.push("Scanned PDF; OCR failed/empty");
      return { text: "", notes };
    }
    // let server parse DOCX/others
    return { text: "", notes };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!jd || jd.trim().length === 0) && !jdFile) { alert("Please paste a JD or upload a JD file."); return; }
    if (!files || files.length === 0) { alert("Please upload at least one resume."); return; }

    const limit = pLimit(2);
    setLoading(true);
    setResults([]);
    setProgress("");

    const jdPayload = new FormData();
    if (jd.trim().length > 0) jdPayload.append("jd", jd);
    if (jdFile) jdPayload.append("jdFile", jdFile);

    const tasks = Array.from(files).map((file) =>
      limit(async () => {
        const { text, notes } = await extractResumeText(file);
        const form = new FormData();
        for (const [k, v] of jdPayload.entries()) form.append(k, v);
        if (text) {
          form.append("resumeText", text);
          form.append("resumeName", file.name);
        } else {
          form.append("resumes", file);
        }
        const res = await fetch("/api/score", { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const [one] = data.results || [];
        if (one) {
          if (notes.length) {
            one.notes = one.notes && one.notes !== "—" ? `${one.notes}; ${notes.join("; ")}` : notes.join("; ");
          }
          setResults(prev => [...prev, one].sort((a,b)=>(b.score||0)-(a.score||0)));
        }
      })
    );

    try { await Promise.allSettled(tasks); } finally { setLoading(false); setProgress(""); }
  }

  function downloadCSV() {
    if (!results.length) return;
    const headers = ["Rank","Candidate","Recommend","Match","Years","Recent Title","Education","Key Matches","Gaps","Notes"];
    const rows = results.map((r:any,i:number)=>[
      i+1,
      r.filename,
      r.recommend ? "Yes" : "No",
      ((r.score||0)*100).toFixed(0)+"%",
      r.years||"—",
      r.recentTitle||"—",
      r.education||"—",
      (r.matches||[]).join("; "),
      (r.gaps||[]).join("; "),
      r.notes||"—"
    ]);
    const esc=(s:any)=>String(s).replace(/"/g,'""');
    const csv=[headers,...rows].map(row=>row.map(c=>`"${esc(c)}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="shortlist.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-8">
      <section className="card p-6">
        <h1 className="text-2xl font-semibold mb-2">AI Shortlist (Interview Readiness)</h1>
        <p className="text-gray-600 mb-6">
          Paste or upload a JD, then upload resumes. Output shows only interview-critical info: Recommend, Match, Years,
          Recent Title, Education, Key Matches & Gaps.
        </p>

        <form onSubmit={onSubmit} className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Job Description (Paste)</span>
            <textarea
              className="w-full p-3 rounded-xl border focus:outline-none focus:ring-2 min-h-[140px]"
              placeholder="Paste the job description here…"
              value={jd}
              onChange={(e)=>{ setJd(e.target.value); if (e.target.value.trim().length>0) setJdFile(null); }}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Or Upload JD (PDF, DOCX, TXT)</span>
            <input type="file" accept=".pdf,.docx,.txt"
              onChange={(e)=>{ const f=e.target.files?.[0]||null; setJdFile(f); if (f) setJd(""); }}
              className="file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white border rounded-xl p-2"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Resumes (PDF, DOCX, TXT) — multiple allowed</span>
            <input type="file" multiple accept=".pdf,.docx,.txt"
              onChange={(e)=>setFiles(e.target.files)}
              className="file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white border rounded-xl p-2"
              required
            />
          </label>

          <div className="flex gap-3 items-center flex-wrap">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? (progress || "Processing…") : "Generate Shortlist"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={()=>{ setJd(""); setJdFile(null); setFiles(null); setResults([]); }}>
              Reset
            </button>
            <button type="button" className="btn btn-ghost" onClick={downloadCSV} disabled={!results.length}>
              Export CSV
            </button>
            <span className="badge border-brand-200 text-brand-700 bg-brand-50">Client OCR enabled</span>
          </div>
        </form>
      </section>

      <ResultsTable results={results} />
    </div>
  );
}
