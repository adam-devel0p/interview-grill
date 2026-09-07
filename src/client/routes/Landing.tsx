import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import { analyzeInterview, createInterview, trackEvent } from "../lib/apiClient";
import { CV_MAX_LENGTH, CV_MIN_LENGTH, JOB_DESCRIPTION_MAX_LENGTH } from "../../shared/constants";

const PAGE_TITLE = "Java Interview Griller — Test Your CV Before the Interview";
const PAGE_DESCRIPTION =
  "Practice a realistic senior Java interview based on your CV. Get adaptive Spring Boot, microservices, Kafka and backend questions with detailed feedback.";

const BENEFITS = [
  {
    title: "CV-specific",
    description: "Questions come directly from your projects and technical claims.",
  },
  {
    title: "Adaptive",
    description: "Weak or vague answers trigger deeper follow-ups.",
  },
  {
    title: "Senior-level",
    description: 'Focus on architecture, production problems and tradeoffs — not "What is Java?"',
  },
];

function setSeoMetadata() {
  document.title = PAGE_TITLE;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", PAGE_DESCRIPTION);
}

export default function Landing() {
  const navigate = useNavigate();
  const [cvText, setCvText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSeoMetadata();
    trackEvent("landing_view");
  }, []);

  function validate(): string | null {
    const trimmed = cvText.trim();
    if (trimmed.length < CV_MIN_LENGTH) {
      return `Your CV looks too short — paste at least ${CV_MIN_LENGTH} characters so the interviewer has enough to work with.`;
    }
    if (trimmed.length > CV_MAX_LENGTH) {
      return `Your CV is too long — please trim it to ${CV_MAX_LENGTH.toLocaleString()} characters or fewer.`;
    }
    if (jobDescription.trim().length > JOB_DESCRIPTION_MAX_LENGTH) {
      return `The job description is too long — please trim it to ${JOB_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`;
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { interviewId } = await createInterview({
        cvText: cvText.trim(),
        jobDescription: jobDescription.trim() || undefined,
      });
      await analyzeInterview(interviewId);
      navigate(`/interview/${interviewId}/scan`);
    } catch {
      setSubmitError("We couldn't analyze your CV. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-3xl px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Will your Java CV survive a senior engineer?
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400">
          Paste your CV and get interviewed on the technical claims you&apos;ve actually made — not random Java
          trivia.
        </p>
        <div className="mt-8">
          <Button
            type="button"
            onClick={() => document.getElementById("cv-form")?.scrollIntoView?.({ behavior: "smooth" })}
          >
            Grill My CV
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-6 pb-16 sm:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <Card key={benefit.title}>
            <h2 className="text-sm font-semibold tracking-wide text-indigo-400 uppercase">{benefit.title}</h2>
            <p className="mt-2 text-sm text-slate-400">{benefit.description}</p>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-2xl px-6 pb-16">
        <Card>
          <p className="mb-4 text-xs font-medium tracking-wide text-slate-500 uppercase">Example interview</p>
          <div className="space-y-4 font-mono text-sm">
            <div>
              <p className="text-indigo-400">Interviewer</p>
              <p className="mt-1 text-slate-300">
                Your CV says you built event-driven microservices with Kafka. Why did that system need asynchronous
                communication?
              </p>
            </div>
            <div>
              <p className="text-slate-500">Candidate</p>
              <p className="mt-1 text-slate-300">It helped decouple the services.</p>
            </div>
            <div>
              <p className="text-indigo-400">Interviewer</p>
              <p className="mt-1 text-slate-300">
                That&apos;s the standard answer. What specific coupling problem existed in your system, and what
                failure mode did Kafka solve?
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section id="cv-form" className="mx-auto max-w-2xl px-6 pb-24">
        <Card>
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="cv-text" className="block text-sm font-medium text-slate-200">
              Paste your CV
            </label>
            <textarea
              id="cv-text"
              required
              rows={12}
              placeholder="Paste your CV here..."
              value={cvText}
              onChange={(event) => setCvText(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />

            <label htmlFor="job-description" className="mt-6 block text-sm font-medium text-slate-200">
              Job description — optional
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Adding the actual role lets the interviewer focus on the areas most likely to come up.
            </p>
            <textarea
              id="job-description"
              rows={6}
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />

            {validationError && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {validationError}
              </p>
            )}
            {submitError && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {submitError}
              </p>
            )}

            <p className="mt-6 text-xs text-slate-500">
              Your CV is used only to generate your interview and report.
            </p>

            <div className="mt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Analyzing…" : "Analyze My CV"}
              </Button>
            </div>
          </form>
        </Card>
      </section>
    </main>
  );
}
