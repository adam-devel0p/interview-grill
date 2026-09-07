import type { ReactNode } from "react";

type BadgeTone = "neutral" | "safe" | "warning" | "danger";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border border-slate-700 bg-slate-800 text-slate-300",
  safe: "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  warning: "border border-amber-500/30 bg-amber-500/10 text-amber-400",
  danger: "border border-red-500/30 bg-red-500/10 text-red-400",
};

export default function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide uppercase ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Maps a `TechnicalClaim.riskLevel` / claim-risk status to the badge tone + label used across the UI. */
export function riskTone(riskLevel: "low" | "medium" | "high"): { tone: BadgeTone; label: string } {
  switch (riskLevel) {
    case "high":
      return { tone: "danger", label: "Risk: High" };
    case "medium":
      return { tone: "warning", label: "Risk: Medium" };
    case "low":
      return { tone: "safe", label: "Risk: Low" };
  }
}

/** Maps a report `claimRisk[].status` (Section 4.6) to the badge tone + label used in the report. */
export function claimRiskStatusTone(status: "SAFE" | "NEEDS_PRACTICE" | "HIGH_RISK"): {
  tone: BadgeTone;
  label: string;
} {
  switch (status) {
    case "SAFE":
      return { tone: "safe", label: "Safe" };
    case "NEEDS_PRACTICE":
      return { tone: "warning", label: "Needs Practice" };
    case "HIGH_RISK":
      return { tone: "danger", label: "High Risk" };
  }
}

/** Maps a report `verdict.status` (Section 4.6) to the badge tone + label used in the report. */
export function verdictTone(
  status: "STRONG" | "INTERVIEW_READY" | "MOSTLY_READY" | "NEEDS_PREPARATION" | "HIGH_RISK",
): { tone: BadgeTone; label: string } {
  switch (status) {
    case "STRONG":
      return { tone: "safe", label: "Strong" };
    case "INTERVIEW_READY":
      return { tone: "safe", label: "Interview Ready" };
    case "MOSTLY_READY":
      return { tone: "warning", label: "Mostly Ready" };
    case "NEEDS_PREPARATION":
      return { tone: "warning", label: "Needs Preparation" };
    case "HIGH_RISK":
      return { tone: "danger", label: "High Risk" };
  }
}
