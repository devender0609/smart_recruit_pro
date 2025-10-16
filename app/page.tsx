"use client";
import { useState } from "react";
import ResultsTable from "../components/ResultsTable";

export default function Page() {
  const [jd, setJd] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  // simple concurrency limiter
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!jd || jd.trim().length === 0) && !jdFile) {
      alert("Please paste a JD or upload a JD file.");
      return;
    }
    if (!files || files.length === 0) {
      alert("Please upload at least one resume.");
      return;
    }

    const limiter = pLimit(2); // keep low (1–3) to avoid serverless timeouts
    setLoading(true);
    setResults([]);

    // Build JD payload once
    const jdPayload = new FormData();
    if (jd.trim().length > 0) jdPayload.append("jd", jd);
    if (jdFile) jdPayload.append("jdFile", jdFile);

    const tasks = Array.from(files).map((file) =>
      limiter(async () => {
        const form = new FormData();
        for (const [k, v] of jdPayload.entries()) form.append(k, v);
        form.append("resumes", file); // ONE resume per request

        const res = await fetch("/api/score", { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const [one] = data.results || [];
        if (one) {
          setResults((prev) => {
            const next = [...prev, one].sort((a, b) => (b.score || 0) - (a.score || 0));
            return next;
          });
        }
      })
    );

    try {
      await Promise.allSettled(tasks);
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!results.length) return;
    const headers = ["Rank", "Candidate", "Score", "Evidence", "Experience", "Education", "Chars", "Notes"];
    const rows = results.map((r: any, i: number) => [
      i + 1,
      r.filename,
      ((r.score || 0) * 100).toFixed(1) + "%",
      (r.evidence || []).join("; "),
      r.experience || "—",
      r.education || "—",
      r.charCount || 0,
      r.notes || "",
    ]);
    const esc = (s: any) => String(s).replace(/"/g, '""');
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${esc(c)}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shortlist.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-8">
      <section className="card p-6">
        <h1 className="text-2xl font-semibold mb-2">AI Candidate Shortlisting</h1>
        <p className="text-gray-600 mb-6">
          Upload a job description and unlimited resumes (PDF, DOCX, TXT). Results appear progressively with match
          score, evidence, experience, education and notes.
        </p>

        <form onSubmit={onSubmit} className="grid gap-4">
          {/* JD Paste */}
          <label className="grid gap-2">
            <span className="text-sm font-medium">Job Description (Paste)</span>
            <textarea
              className="w-full p-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-300 min-h-[140px]"
              placeholder="Paste the job description here..."
              value={jd}
              onChange={(e) => {
                setJd(e.target.value);
                if (e.target.value.trim().length > 0) setJdFile(null);
              }}
            />
            <span className="text-xs text-gray-500">Tip: If you upload a JD file below, you don’t need to paste text.</span>
          </label>

          {/* JD Upload */}
          <label className="grid gap-2">
            <span className="text-sm font-medium">Or Upload JD (PDF, DOCX, TXT)</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setJdFile(f);
                if (f) setJd("");
              }}
              className="file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white file:hover:bg-brand-700 border rounded-xl p-2"
            />
          </label>

          {/* Resumes */}
          <label className="grid gap-2">
            <span className="text-sm font-medium">Resumes (PDF, DOCX, TXT) — multiple allowed</span>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={(e) => setFiles(e.target.files)}
              className="file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white file:hover:bg-brand-700 border rounded-xl p-2"
              required
            />
          </label>

          <div className="flex gap-3 items-center flex-wrap">
            <button className="btn btn-primary" disabled={loading}>{loading ? "Scoring..." : "Generate Shortlist"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setJd(""); setJdFile(null); setFiles(null); setResults([]); }}>
              Reset
            </button>
            <button type="button" className="btn btn-ghost" onClick={downloadCSV} disabled={!results.length}>
              Export CSV
            </button>
            <span className="badge border-brand-200 text-brand-700 bg-brand-50">OCR & embeddings via env</span>
          </div>
        </form>
      </section>

      <ResultsTable results={results} />
    </div>
  );
}
