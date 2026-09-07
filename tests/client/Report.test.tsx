import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Report from "../../src/client/routes/Report";
import * as apiClient from "../../src/client/lib/apiClient";
import type { Report as ReportData } from "../../src/shared/types";

vi.mock("../../src/client/lib/apiClient", () => ({
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(status: number, body: { code: string; message: string }) {
      super(body.message);
      this.status = status;
    }
  },
  getReport: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const baseReport: ReportData = {
  overallReadiness: 74,
  categoryScores: { JAVA: 84, MESSAGING: 58 },
  verdict: {
    status: "MOSTLY_READY",
    summary: "You present as a genuine senior Java developer with strong Spring experience.",
  },
  claimRisk: [
    {
      claimId: "claim-1",
      label: "Kafka",
      status: "NEEDS_PRACTICE",
      explanation: "Duplicate-processing handling was vague.",
      likelyQuestions: ["How did you handle duplicate events?"],
      suggestedCvFraming: { current: "Strong Kafka experience.", suggested: "Worked with Kafka-based messaging." },
    },
  ],
  redFlags: [
    {
      title: "Kafka duplicate processing",
      description: "Struggled to explain offset-commit failure handling.",
      interviewerConclusion: "Candidate may not have owned production reliability concerns.",
      conceptsToRevise: ["idempotent consumers", "offset commits"],
    },
  ],
  strongAreas: [
    {
      title: "Microservice migration",
      evidence: ["concrete service boundary reasoning"],
      interviewerImpression: "Likely genuine hands-on experience.",
    },
  ],
  betterAnswers: [
    {
      question: "Why did you choose Kafka?",
      candidateAnswer: "It decoupled the services.",
      whyWeak: "Generic architectural justification, no specifics.",
      strongerAnswerStructure: ["explain the coupling problem", "explain the failure mode solved"],
      isExample: true,
    },
  ],
  likelyFollowUpQuestions: ["How did you handle duplicate messages?"],
  studyPriorities: [
    {
      priority: 1,
      topic: "Kafka reliability",
      estimatedMinutes: "45-60 minutes",
      reviewItems: ["offsets", "idempotency"],
      note: "Focus on production failure modes.",
    },
  ],
  roleFit: {
    estimatedFitPercent: 78,
    strongMatch: ["Java", "Spring Boot"],
    partialMatch: ["Kafka"],
    concerns: ["AWS"],
    likelyCompanyQuestions: ["What AWS services did you personally configure?"],
  },
};

function renderReport() {
  return render(
    <MemoryRouter initialEntries={["/interview/interview-1/report"]}>
      <Routes>
        <Route path="/interview/:id/report" element={<Report />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Report", () => {
  beforeEach(() => {
    vi.mocked(apiClient.getReport).mockReset();
    mockNavigate.mockReset();
  });

  it("renders every report section, including role fit when present", async () => {
    vi.mocked(apiClient.getReport).mockResolvedValue({ report: baseReport });
    renderReport();

    expect(await screen.findByRole("heading", { name: /interview result/i })).toBeInTheDocument();
    expect(screen.getByText("74 / 100")).toBeInTheDocument();
    expect(screen.getByText("Mostly Ready")).toBeInTheDocument();
    expect(screen.getByText(/you present as a genuine senior java developer/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kafka" })).toBeInTheDocument();
    expect(screen.getByText("Needs Practice")).toBeInTheDocument();
    expect(screen.getByText(/questions that could hurt you/i)).toBeInTheDocument();
    expect(screen.getByText("Kafka duplicate processing")).toBeInTheDocument();
    expect(screen.getByText(/strong areas/i)).toBeInTheDocument();
    expect(screen.getByText("Microservice migration")).toBeInTheDocument();
    expect(screen.getByText(/better answers/i)).toBeInTheDocument();
    expect(screen.getByText(/\(example\)/i)).toBeInTheDocument();
    expect(screen.getByText(/questions you're likely to get/i)).toBeInTheDocument();
    expect(screen.getByText("How did you handle duplicate messages?")).toBeInTheDocument();
    expect(screen.getByText(/before your interview/i)).toBeInTheDocument();
    expect(screen.getByText(/priority 1 — kafka reliability/i)).toBeInTheDocument();
    expect(screen.getByText(/fit for this role/i)).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
  });

  it("omits the role fit section when not present in the report", async () => {
    const { roleFit: _roleFit, ...withoutRoleFit } = baseReport;
    vi.mocked(apiClient.getReport).mockResolvedValue({ report: withoutRoleFit });
    renderReport();

    await screen.findByRole("heading", { name: /interview result/i });
    expect(screen.queryByText(/fit for this role/i)).not.toBeInTheDocument();
  });

  it("redirects to the interview route when the report isn't ready yet (409)", async () => {
    vi.mocked(apiClient.getReport).mockRejectedValue(
      new apiClient.ApiClientError(409, { code: "INVALID_STATE", message: "Not completed" }),
    );
    renderReport();

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/interview/interview-1");
    });
  });
});
