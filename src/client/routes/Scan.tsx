import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Badge, { riskTone } from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import { analyzeInterview, getInterview, startInterview, type InterviewDetail } from "../lib/apiClient";
import type { TechnicalClaim } from "../../shared/types";

const MAX_CLAIMS_SHOWN = 5;
const MAX_FOLLOW_UPS_SHOWN = 4;

/**
 * build-plan §11 explicitly says not to expose every generated question — this picks a
 * curated, high-impact subset (high-risk claims first, then medium) rather than the
 * full claim list from the analysis.
 */
function selectHighlightedClaims(claims: TechnicalClaim[]): TechnicalClaim[] {
  const order = { high: 0, medium: 1, low: 2 } as const;
  return [...claims].sort((a, b) => order[a.riskLevel] - order[b.riskLevel]).slice(0, MAX_CLAIMS_SHOWN);
}

function formatCategory(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export default function Scan() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      let data = await getInterview(id);
      if (!data.analysis) {
        await analyzeInterview(id);
        data = await getInterview(id);
      }
      setInterview(data);
    } catch {
      setLoadError("We couldn't load your CV risk scan. Please try again.");
    }
  }, [id]);

  useEffect(() => {
    // Fetching on mount/param-change is the documented React pattern for synchronizing
    // with an external system (https://react.dev/learn/you-might-not-need-an-effect);
    // `load`'s setState calls happen asynchronously after `await`, not synchronously in
    // this effect body, but the react-hooks static analysis can't tell the difference.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleStart() {
    if (!id) return;
    setStartError(null);
    setIsStarting(true);
    try {
      await startInterview(id);
      navigate(`/interview/${id}`);
    } catch {
      setStartError("We couldn't start your interview. Please try again.");
      setIsStarting(false);
    }
  }

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

  if (!interview || !interview.analysis) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-400">Analyzing your CV…</p>
      </main>
    );
  }

  const { analysis } = interview;
  const claimsFound = analysis.claims.length;
  const counts = { low: 0, medium: 0, high: 0 };
  for (const claim of analysis.claims) counts[claim.riskLevel]++;
  const highlightedClaims = selectHighlightedClaims(analysis.claims);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Your CV Risk Scan</h1>

        <Card className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-2xl font-semibold">{claimsFound}</p>
            <p className="text-xs text-slate-500">Technical claims found</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-emerald-400">{counts.low}</p>
            <p className="text-xs text-slate-500">Likely safe</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-amber-400">{counts.medium}</p>
            <p className="text-xs text-slate-500">Worth reviewing</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-red-400">{counts.high}</p>
            <p className="text-xs text-slate-500">High-risk</p>
          </div>
        </Card>

        <div className="mt-8 space-y-4">
          {highlightedClaims.map((claim) => {
            const { tone, label } = riskTone(claim.riskLevel);
            return (
              <Card key={claim.id}>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold text-slate-200">
                    {claim.project ? `${claim.project} — ${formatCategory(claim.category)}` : formatCategory(claim.category)}
                  </h2>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <blockquote className="mt-3 border-l-2 border-slate-700 pl-3 text-sm text-slate-400 italic">
                  &ldquo;{claim.sourceExcerpt}&rdquo;
                </blockquote>
                <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Why this may be challenged
                </p>
                <p className="mt-1 text-sm text-slate-400">{claim.reasoning}</p>
                {claim.likelyQuestions.length > 0 && (
                  <>
                    <p className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">Likely follow-ups</p>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-400">
                      {claim.likelyQuestions.slice(0, MAX_FOLLOW_UPS_SHOWN).map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            );
          })}
        </div>

        {startError && (
          <p role="alert" className="mt-6 text-sm text-red-400">
            {startError}
          </p>
        )}

        <div className="mt-8">
          <Button onClick={handleStart} disabled={isStarting}>
            {isStarting ? "Starting…" : "Start My Interview"}
          </Button>
        </div>
      </div>
    </main>
  );
}
