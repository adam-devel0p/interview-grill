import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Interview from "../../src/client/routes/Interview";
import * as apiClient from "../../src/client/lib/apiClient";
import type { InterviewDetail } from "../../src/client/lib/apiClient";

vi.mock("../../src/client/lib/apiClient", () => ({
  getInterview: vi.fn(),
  submitAnswer: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function interviewAt(questionNumber: number, questionText: string): InterviewDetail {
  const messages: InterviewDetail["messages"] = [];
  for (let i = 1; i < questionNumber; i++) {
    messages.push({ id: `q${i}`, role: "interviewer", content: `Question ${i} text`, createdAt: "2026-01-01" });
    messages.push({ id: `a${i}`, role: "candidate", content: `Answer ${i}`, createdAt: "2026-01-01" });
  }
  messages.push({ id: `q${questionNumber}`, role: "interviewer", content: questionText, createdAt: "2026-01-01" });

  return {
    id: "interview-1",
    status: "in_progress",
    paid: false,
    freeAnswersUsed: questionNumber - 1,
    messages,
    interviewState: {
      candidateSeniority: "senior",
      testedClaimIds: [],
      topicScores: {},
      strongAreas: [],
      weakAreas: [],
      redFlags: [],
      contradictions: [],
      conceptsToProbe: [],
      candidatePatterns: {
        vagueAnswers: 0,
        strongConcreteAnswers: 0,
        excessiveWeLanguage: 0,
        buzzwordAnswers: 0,
      },
      majorQuestionsAsked: questionNumber - 1,
      estimatedCompletion: (questionNumber - 1) / 16,
      highRiskClaimIds: [],
    },
  };
}

function renderInterview() {
  return render(
    <MemoryRouter initialEntries={["/interview/interview-1"]}>
      <Routes>
        <Route path="/interview/:id" element={<Interview />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Interview", () => {
  beforeEach(() => {
    vi.mocked(apiClient.getInterview).mockReset();
    vi.mocked(apiClient.submitAnswer).mockReset();
    mockNavigate.mockReset();
  });

  it("renders the current question from a mocked GET", async () => {
    vi.mocked(apiClient.getInterview).mockResolvedValue(interviewAt(1, "Why did you choose Kafka?"));
    renderInterview();

    expect(await screen.findByText("Why did you choose Kafka?")).toBeInTheDocument();
    expect(screen.getByText(/question 1/i)).toBeInTheDocument();
  });

  it("submits an answer and renders the next question", async () => {
    vi.mocked(apiClient.getInterview)
      .mockResolvedValueOnce(interviewAt(1, "Why did you choose Kafka?"))
      .mockResolvedValueOnce(interviewAt(2, "What happens if the offset commit fails?"));
    vi.mocked(apiClient.submitAnswer).mockResolvedValue({
      completed: false,
      nextQuestion: { question: "What happens if the offset commit fails?", difficulty: "senior" },
    });

    renderInterview();
    await screen.findByText("Why did you choose Kafka?");

    fireEvent.change(screen.getByLabelText(/your answer/i), { target: { value: "It decoupled the services." } });
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    await waitFor(() => {
      expect(apiClient.submitAnswer).toHaveBeenCalledWith("interview-1", "It decoupled the services.");
    });
    expect(await screen.findByText("What happens if the offset commit fails?")).toBeInTheDocument();
    expect(screen.getByText(/question 2/i)).toBeInTheDocument();
  });

  it("navigates to the report route when the interview completes", async () => {
    vi.mocked(apiClient.getInterview).mockResolvedValue(interviewAt(1, "Why did you choose Kafka?"));
    vi.mocked(apiClient.submitAnswer).mockResolvedValue({ completed: true });

    renderInterview();
    await screen.findByText("Why did you choose Kafka?");

    fireEvent.change(screen.getByLabelText(/your answer/i), { target: { value: "Final answer." } });
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/interview/interview-1/report");
    });
  });

  it("submits a canned answer via 'I don't know' without requiring textarea content", async () => {
    vi.mocked(apiClient.getInterview)
      .mockResolvedValueOnce(interviewAt(1, "Why did you choose Kafka?"))
      .mockResolvedValueOnce(interviewAt(2, "Next question."));
    vi.mocked(apiClient.submitAnswer).mockResolvedValue({
      completed: false,
      nextQuestion: { question: "Next question.", difficulty: "basic" },
    });

    renderInterview();
    await screen.findByText("Why did you choose Kafka?");

    fireEvent.click(screen.getByRole("button", { name: /i don't know/i }));

    await waitFor(() => {
      expect(apiClient.submitAnswer).toHaveBeenCalledWith("interview-1", "I don't know.");
    });
  });

  it("resumes from server state on remount rather than restarting", async () => {
    vi.mocked(apiClient.getInterview).mockResolvedValue(interviewAt(3, "What breaks if the DB write succeeds first?"));

    renderInterview();

    expect(await screen.findByText("What breaks if the DB write succeeds first?")).toBeInTheDocument();
    expect(screen.getByText(/question 3/i)).toBeInTheDocument();
    expect(screen.queryByText("Why did you choose Kafka?")).not.toBeInTheDocument();
  });
});
