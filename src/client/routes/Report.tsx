import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Badge, { claimRiskStatusTone, verdictTone } from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import { ApiClientError, getReport } from "../lib/apiClient";
import type { Report as ReportData } from "../../shared/types";

function formatCategory(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function SectionHeading({ children }: { children: string }) {
  return <h2 className="mt-12 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>;
}

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const { report: data } = await getReport(id);
      setReport(data);
    } catch (error) {
      // The interview hasn't reached `completed` yet (build-plan §22: report route
      // only runs after completion) — send the candidate back to finish it rather
      // than showing a raw error for a state they can still resolve.
      if (error instanceof ApiClientError && error.status === 409) {
        navigate(`/interview/${id}`);
        return;
      }
      setLoadError("We couldn't load your report. Please try again.");
    }
  }, [id, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see Scan.tsx's identical fetch-on-mount effect
    load();
  }, [load]);

  if (loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-slate-100">
        <p role="alert" className="text-sm text-red-400">
          {loadError}
        </p>
        <Button onClick={load}>Try again</Button>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-400">Generating your report…</p>
      </main>
    );
  }

  const verdict = verdictTone(report.verdict.status);
  const categoryEntries = Object.entries(report.categoryScores);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Interview Result</h1>

        <Card className="mt-8">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-slate-400">Overall Interview Readiness</p>
            <p className="text-3xl font-semibold">{report.overallReadiness} / 100</p>
          </div>
          {categoryEntries.length > 0 && (
            <div className="mt-6 space-y-3">
              {categoryEntries.map(([category, score]) => (
                <div key={category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{formatCategory(category)}</span>
                    <span className="text-slate-500">{score}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="mt-6">
          <div className="flex items-center gap-3">
            <Badge tone={verdict.tone}>{verdict.label}</Badge>
          </div>
          <p className="mt-3 text-sm text-slate-300">{report.verdict.summary}</p>
        </Card>

        <SectionHeading>CV Claim Risk</SectionHeading>
        <div className="mt-4 space-y-4">
          {report.claimRisk.map((claim) => {
            const tone = claimRiskStatusTone(claim.status);
            return (
              <Card key={claim.claimId}>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold text-slate-200">{claim.label}</h3>
                  <Badge tone={tone.tone}>{tone.label}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">{claim.explanation}</p>
                {(claim.likelyQuestions?.length || claim.suggestedCvFraming) && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-xs font-medium tracking-wide text-indigo-400 uppercase">
                      Details
                    </summary>
                    {claim.likelyQuestions && claim.likelyQuestions.length > 0 && (
                      <>
                        <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
                          Likely questions
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-1 text-slate-400">
                          {claim.likelyQuestions.map((question) => (
                            <li key={question}>{question}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {claim.suggestedCvFraming && (
                      <>
                        <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
                          Suggested CV framing
                        </p>
                        <p className="mt-1 text-slate-500 line-through">{claim.suggestedCvFraming.current}</p>
                        <p className="mt-1 text-slate-300">{claim.suggestedCvFraming.suggested}</p>
                      </>
                    )}
                  </details>
                )}
              </Card>
            );
          })}
        </div>

        {report.redFlags.length > 0 && (
          <>
            <SectionHeading>Questions That Could Hurt You</SectionHeading>
            <div className="mt-4 space-y-4">
              {report.redFlags.map((flag) => (
                <Card key={flag.title}>
                  <h3 className="text-sm font-semibold text-slate-200">{flag.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{flag.description}</p>
                  <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
                    What an interviewer may conclude
                  </p>
                  <p className="mt-1 text-sm text-slate-400 italic">{flag.interviewerConclusion}</p>
                  {flag.conceptsToRevise.length > 0 && (
                    <>
                      <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
                        What to revise
                      </p>
                      <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-400">
                        {flag.conceptsToRevise.map((concept) => (
                          <li key={concept}>{concept}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        {report.strongAreas.length > 0 && (
          <>
            <SectionHeading>Strong Areas</SectionHeading>
            <div className="mt-4 space-y-4">
              {report.strongAreas.map((area) => (
                <Card key={area.title}>
                  <h3 className="text-sm font-semibold text-slate-200">{area.title}</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-400">
                    {area.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
                    Interviewer impression
                  </p>
                  <p className="mt-1 text-sm text-slate-400 italic">{area.interviewerImpression}</p>
                </Card>
              ))}
            </div>
          </>
        )}

        {report.betterAnswers.length > 0 && (
          <>
            <SectionHeading>Better Answers</SectionHeading>
            <div className="mt-4 space-y-4">
              {report.betterAnswers.map((item) => (
                <Card key={item.question}>
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Question</p>
                  <p className="mt-1 text-sm text-slate-300">{item.question}</p>
                  <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">Your answer</p>
                  <p className="mt-1 text-sm text-slate-400">{item.candidateAnswer}</p>
                  <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">Why it was weak</p>
                  <p className="mt-1 text-sm text-slate-400">{item.whyWeak}</p>
                  <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
                    Stronger answer structure{item.isExample ? " (Example)" : ""}
                  </p>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-400">
                    {item.strongerAnswerStructure.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </>
        )}

        <SectionHeading>Questions You&apos;re Likely to Get</SectionHeading>
        <Card className="mt-4">
          <ol className="list-inside list-decimal space-y-2 text-sm text-slate-300">
            {report.likelyFollowUpQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </Card>

        <SectionHeading>Before Your Interview</SectionHeading>
        <div className="mt-4 space-y-4">
          {[...report.studyPriorities]
            .sort((a, b) => a.priority - b.priority)
            .map((item) => (
              <Card key={item.topic}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Priority {item.priority} — {item.topic}
                  </h3>
                  <span className="shrink-0 text-xs text-slate-500">{item.estimatedMinutes}</span>
                </div>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-400">
                  {item.reviewItems.map((review) => (
                    <li key={review}>{review}</li>
                  ))}
                </ul>
                {item.note && <p className="mt-2 text-sm text-slate-400 italic">{item.note}</p>}
              </Card>
            ))}
        </div>

        {report.roleFit && (
          <>
            <SectionHeading>Fit for This Role</SectionHeading>
            <Card className="mt-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-slate-400">Estimated technical fit</p>
                <p className="text-2xl font-semibold">{report.roleFit.estimatedFitPercent}%</p>
              </div>

              {report.roleFit.strongMatch.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-medium tracking-wide text-slate-500 uppercase">Strong match</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {report.roleFit.strongMatch.map((item) => (
                      <Badge key={item} tone="safe">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </>
              )}

              {report.roleFit.partialMatch.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-medium tracking-wide text-slate-500 uppercase">Partial match</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {report.roleFit.partialMatch.map((item) => (
                      <Badge key={item} tone="warning">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </>
              )}

              {report.roleFit.concerns.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-medium tracking-wide text-slate-500 uppercase">
                    Potential concerns
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {report.roleFit.concerns.map((item) => (
                      <Badge key={item} tone="danger">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </>
              )}

              {report.roleFit.likelyCompanyQuestions.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-medium tracking-wide text-slate-500 uppercase">
                    What this company is most likely to ask you
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-300">
                    {report.roleFit.likelyCompanyQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
