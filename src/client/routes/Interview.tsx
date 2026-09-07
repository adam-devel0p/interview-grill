import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import { getInterview, submitAnswer, type ApiMessage, type InterviewDetail } from "../lib/apiClient";

const DONT_KNOW_ANSWER = "I don't know.";

/**
 * Target duration is build-plan §19's 15-25 minute range; 20 is the midpoint. Minutes
 * remaining is the share of that budget implied by `1 - estimatedCompletion`
 * (`InterviewState.estimatedCompletion`, Section 4.5) — the same 0..1 progress signal
 * the backend already maintains, so no separate client-side pacing model is needed.
 */
const TARGET_INTERVIEW_MINUTES = 20;

function minutesRemaining(estimatedCompletion: number): number {
  return Math.max(1, Math.round(TARGET_INTERVIEW_MINUTES * (1 - estimatedCompletion)));
}

/**
 * `InterviewState.majorQuestionsAsked` (Section 4.5) counts *answered* turns, so the
 * question currently on screen — not yet answered — is one more than that.
 */
function questionNumber(majorQuestionsAsked: number): number {
  return majorQuestionsAsked + 1;
}

function latestInterviewerMessage(messages: ApiMessage[]): ApiMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "interviewer") return messages[i];
  }
  return undefined;
}

export default function Interview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentRequired, setPaymentRequired] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const data = await getInterview(id);
      if (data.status === "completed") {
        navigate(`/interview/${id}/report`);
        return;
      }
      if (data.status === "created" || data.status === "analyzing" || data.status === "ready") {
        navigate(`/interview/${id}/scan`);
        return;
      }
      if (data.status === "failed") {
        setLoadError("This interview could not continue. Please start a new one.");
        return;
      }
      setInterview(data);
      setPaymentRequired(data.status === "payment_required");
    } catch {
      setLoadError("We couldn't load your interview. Please try again.");
    }
  }, [id, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see Scan.tsx's identical fetch-on-mount effect
    load();
  }, [load]);

  async function handleSubmit(submittedAnswer: string) {
    if (!id || isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const result = await submitAnswer(id, submittedAnswer);
      setAnswer("");
      if (result.completed) {
        navigate(`/interview/${id}/report`);
        return;
      }
      if (result.paymentRequired) {
        setPaymentRequired(true);
        return;
      }
      // Re-fetch rather than trusting the partial `/answer` response as the render
      // source: this keeps `interviewState` (question count, time remaining) and the
      // message list from a single source of truth, and gives refresh-mid-interview
      // and normal turn-advance the same code path.
      const refreshed = await getInterview(id);
      setInterview(refreshed);
    } catch {
      setSubmitError("We couldn't submit your answer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed) return;
    void handleSubmit(trimmed);
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

  if (!interview) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-400">Loading your interview…</p>
      </main>
    );
  }

  const currentQuestion = latestInterviewerMessage(interview.messages);
  const state = interview.interviewState;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Senior Java Interview</h1>
          {state && (
            <p className="text-xs text-slate-500">
              Question {questionNumber(state.majorQuestionsAsked)} · Approx.{" "}
              {minutesRemaining(state.estimatedCompletion)} minutes remaining
            </p>
          )}
        </div>

        {paymentRequired ? (
          <Card className="mt-8">
            {/*
              Placeholder gate: Phase 11 (build-plan §20) owns the real free-limit copy
              ("You've survived the first round" + interim summary) and Phase 12 owns a
              working checkout CTA. This phase only needs `/answer`'s `paymentRequired`
              (or a `payment_required` interview status on load) to stop the interview
              from silently continuing.
            */}
            <h2 className="text-base font-semibold text-slate-100">Continue Full Interview</h2>
            <p className="mt-2 text-sm text-slate-400">
              You&apos;ve used your free interview questions. Payment is required to continue.
            </p>
            <div className="mt-4">
              <Button disabled>Continue Full Interview</Button>
            </div>
          </Card>
        ) : (
          <>
            <Card className="mt-8">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Interviewer</p>
              <p className="mt-2 text-base text-slate-100">{currentQuestion?.content}</p>
            </Card>

            <form onSubmit={handleSubmitForm} className="mt-6">
              <label htmlFor="answer" className="block text-sm font-medium text-slate-200">
                Your answer
              </label>
              <textarea
                id="answer"
                rows={8}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                disabled={isSubmitting}
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />

              {submitError && (
                <p role="alert" className="mt-4 text-sm text-red-400">
                  {submitError}
                </p>
              )}

              <div className="mt-4 flex gap-3">
                <Button type="submit" disabled={isSubmitting || !answer.trim()}>
                  {isSubmitting ? "Submitting…" : "Submit Answer"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={() => void handleSubmit(DONT_KNOW_ANSWER)}
                >
                  I don&apos;t know
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
