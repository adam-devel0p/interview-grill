import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Scan from "../../src/client/routes/Scan";
import * as apiClient from "../../src/client/lib/apiClient";
import type { InterviewDetail } from "../../src/client/lib/apiClient";

vi.mock("../../src/client/lib/apiClient", () => ({
  getInterview: vi.fn(),
  analyzeInterview: vi.fn(),
  startInterview: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockInterview: InterviewDetail = {
  id: "interview-1",
  status: "ready",
  paid: false,
  freeAnswersUsed: 0,
  messages: [],
  analysis: {
    estimatedSeniority: "senior",
    primaryStack: ["Java", "Spring Boot"],
    technologies: ["Kafka", "PostgreSQL"],
    projects: [],
    vagueClaims: [],
    claims: [
      {
        id: "claim-1",
        text: "Designed Kafka-based communication between microservices.",
        sourceExcerpt: "Designed Kafka-based communication between microservices.",
        category: "MESSAGING",
        riskLevel: "high",
        confidence: 0.8,
        reasoning: "Senior interviewers are likely to ask about offset handling and duplicate processing.",
        likelyQuestions: [
          "What happens if processing succeeds but offset commit fails?",
          "How did you handle duplicate events?",
        ],
        requiredDepth: "senior",
      },
      {
        id: "claim-2",
        text: "Implemented monitoring with Prometheus and Grafana.",
        sourceExcerpt: "Implemented technical monitoring with Prometheus and Grafana.",
        category: "OBSERVABILITY",
        riskLevel: "medium",
        confidence: 0.6,
        reasoning: "Interviewers may probe which metrics and alerts actually existed.",
        likelyQuestions: ["Which application metrics did you expose?"],
        requiredDepth: "intermediate",
      },
      {
        id: "claim-3",
        text: "Wrote unit tests with JUnit.",
        sourceExcerpt: "Wrote unit tests with JUnit.",
        category: "TESTING",
        riskLevel: "low",
        confidence: 0.9,
        reasoning: "Standard practice, unlikely to be challenged deeply.",
        likelyQuestions: [],
        requiredDepth: "basic",
      },
    ],
  },
};

function renderScan() {
  return render(
    <MemoryRouter initialEntries={["/interview/interview-1/scan"]}>
      <Routes>
        <Route path="/interview/:id/scan" element={<Scan />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Scan", () => {
  beforeEach(() => {
    vi.mocked(apiClient.getInterview).mockReset().mockResolvedValue(mockInterview);
    vi.mocked(apiClient.analyzeInterview).mockReset();
    vi.mocked(apiClient.startInterview).mockReset().mockResolvedValue({
      question: { question: "Why Kafka?", difficulty: "senior" },
      messageId: "message-1",
    });
    mockNavigate.mockReset();
  });

  it("renders summary counts and claim cards from the fetched interview", async () => {
    renderScan();

    expect(await screen.findByRole("heading", { name: /your cv risk scan/i })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // claims found
    expect(screen.getByText(/designed kafka-based communication/i)).toBeInTheDocument();
    expect(screen.getByText("Risk: High")).toBeInTheDocument();
    expect(screen.getByText(/what happens if processing succeeds but offset commit fails/i)).toBeInTheDocument();
  });

  it("starts the interview and navigates on 'Start My Interview'", async () => {
    renderScan();

    const startButton = await screen.findByRole("button", { name: /start my interview/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(apiClient.startInterview).toHaveBeenCalledWith("interview-1");
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/interview/interview-1");
    });
  });
});
