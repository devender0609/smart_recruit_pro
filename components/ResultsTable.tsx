export default function ResultsTable({ results = [] as any[] }) {
  if (!results.length) {
    return (
      <section className="card p-6">
        <div className="text-gray-500">No results yet. Submit a job description and resumes.</div>
      </section>
    );
  }

  const anyTitle  = results.some((r:any) => r.recentTitle && r.recentTitle !== "—");
  const anyEdu    = results.some((r:any) => r.education && r.education !== "—");
  const anyMatch  = results.some((r:any) => r.matches && r.matches.length);
  const anyGaps   = results.some((r:any) => r.gaps && r.gaps.length);
  const anyNotes  = results.some((r:any) => r.notes && r.notes !== "—");
  const anyTotExp = results.some((r:any) => r.totalExp && r.totalExp !== "—");
  const anyLatest = results.some((r:any) => r.latestTenure && r.latestTenure !== "—");

  return (
    <section className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr className="text-left">
              <th className="px-5 py-3">Rank</th>
              <th className="px-5 py-3">Candidate</th>
              <th className="px-5 py-3">Recommend</th>
              <th className="px-5 py-3">Match</th>
              {anyTotExp && <th className="px-5 py-3">Total Exp</th>}
              {anyLatest && <th className="px-5 py-3">Latest Tenure</th>}
              {anyTitle && <th className="px-5 py-3">Recent Title</th>}
              {anyEdu   && <th className="px-5 py-3">Education</th>}
              {anyMatch && <th className="px-5 py-3">Key Matches</th>}
              {anyGaps  && <th className="px-5 py-3">Key Gaps (must-haves missing)</th>}
              {anyNotes && <th className="px-5 py-3">Notes</th>}
            </tr>
          </thead>
          <tbody>
            {results.map((r:any, idx:number) => (
              <tr key={`${r.filename}-${idx}`} className="border-t align-top">
                <td className="px-5 py-3 font-semibold">{idx+1}</td>
                <td className="px-5 py-3">{r.filename}</td>
                <td className="px-5 py-3">
                  {r.recommend ? (
                    <span className="badge bg-green-600 text-white">Yes</span>
                  ) : (
                    <span className="badge bg-gray-300 text-gray-800">No</span>
                  )}
                </td>
                <td className="px-5 py-3">{((r.score ?? 0) * 100).toFixed(0)}%</td>
                {anyTotExp && <td className="px-5 py-3">{r.totalExp ?? "—"}</td>}
                {anyLatest && <td className="px-5 py-3">{r.latestTenure ?? "—"}</td>}
                {anyTitle && <td className="px-5 py-3">{r.recentTitle ?? "—"}</td>}
                {anyEdu   && <td className="px-5 py-3">{r.education ?? "—"}</td>}
                {anyMatch && (
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {(r.matches || []).map((k:string) => (
                        <span key={k} className="badge bg-green-50 border-green-200 text-green-700">{k}</span>
                      ))}
                    </div>
                  </td>
                )}
                {anyGaps && (
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {(r.gaps || []).map((k:string) => (
                        <span key={k} className="badge bg-amber-50 border-amber-200 text-amber-700">{k}</span>
                      ))}
                    </div>
                  </td>
                )}
                {anyNotes && <td className="px-5 py-3">{r.notes ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
