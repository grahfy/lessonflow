"use client";

import { useEffect, useState } from "react";

import { AppDialog } from "@/components/ui/app-dialog";

type Finding = { id: string; category: string; value: string; confidence: number; status: string; sourceUrl: string | null; evidence: string | null };

/** Compact, accessible audit surface: successful tags stay brief; provenance remains opt-in. */
export function LibraryEnrichmentDialog({ itemId, title, onClose }: { itemId: string; title: string; onClose: () => void }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState("Loading tag review…");
  const [details, setDetails] = useState(false);

  useEffect(() => {
    void fetch(`/api/admin/library/${itemId}/enrichment`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { run: { status: string; findings: Finding[] } | null }) => {
        setFindings(data.run?.findings ?? []);
        setStatus(data.run ? data.run.status === "completed" ? "Automatic tag review complete." : "Tag review is queued and will not delay this upload." : "No automatic tag review has run yet.");
      })
      .catch(() => setStatus("Tag review is unavailable right now; the upload is safely stored."));
  }, [itemId]);

  const applied = findings.filter((finding) => finding.status === "applied");
  const withheld = findings.filter((finding) => finding.status === "withheld");
  const musical = applied.filter((finding) => !["Difficulty"].includes(finding.category));
  const teaching = applied.filter((finding) => finding.category === "Difficulty");
  return <AppDialog isOpen onClose={onClose} title="Automatic tags" description={title} size="sm" footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}>
    <div className="dialog-col">
      <p className="helper-text" role="status">{status}</p>
      {applied.length > 0 ? <><section><b>Musical details</b><p className="helper-text">{musical.map((f) => `${f.category}: ${f.value}`).join(" · ") || "No musical details approved."}</p></section><section><b>Teaching context</b><p className="helper-text">{teaching.map((f) => `${f.category}: ${f.value}`).join(" · ") || "No teaching-context tags approved."}</p></section></> : null}
      {withheld.length > 0 ? <p className="helper-text">{withheld.length} finding{withheld.length === 1 ? " was" : "s were"} withheld pending stronger evidence.</p> : null}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetails((open) => !open)}>{details ? "Hide tag review" : "Review tags"}</button>
      {details ? <ul className="helper-text">{findings.map((finding) => <li key={finding.id}><b>{finding.status}</b> — {finding.category}: {finding.value} ({Math.round(finding.confidence * 100)}%). {finding.evidence} {finding.sourceUrl ? <a href={finding.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}</li>)}</ul> : null}
    </div>
  </AppDialog>;
}
