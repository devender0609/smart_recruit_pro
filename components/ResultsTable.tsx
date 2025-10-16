export default function ResultsTable({ results = [] as any[] }) {
  if (!results.length) {
    return (
      <section className="card p-6">
        <div className="text-gray-500">No results yet. Submit a job description and resumes to see ranked candidates.</div>
      </section>
    );
  }
  return (
    <section className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr className="text-left">
              <th className="px-5 py-3">Rank</th>
              <th className="px-5 py-3">Candidate (File)</th>
              <th className="px-5 py-3">Match Score</th>
              <th className="px-5 py-3">Keyword Evidence</th>
              <th className="px-5 py-3">Experience</th>
              <th className="px-5 py-3">Education</th>
              <th className="px-5 py-3">Summary Snippet</th>
              <th className="px-5 py-3">Chars</th>
              <th className="px-5 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r:any, idx:number) => (
              <tr key={`${r.filename}-${idx}`} className="border-t">
                <td className="px-5 py-3 font-semibold">{idx+1}</td>
                <td className="px-5 py-3">{r.filename}</td>
                <td className="px-5 py-3">{((r.score ?? 0) * 100).toFixed(1)}%</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-2">
                    {(r.evidence ?? []).map((k:string) => (
                      <span key={k} className="badge bg-green-50 border-green-200 text-green-700">{k}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3">{r.experience ?? "—"}</td>
                <td className="px-5 py-3">{r.education ?? "—"}</td>
                <td className="px-5 py-3 text-gray-600">{r.snippet ?? "—"}</td>
                <td className="px-5 py-3">{r.charCount ?? 0}</td>
                <td className="px-5 py-3">{r.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
