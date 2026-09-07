import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "../../src/client/routes/Landing";
import { CV_MIN_LENGTH } from "../../src/shared/constants";
import * as apiClient from "../../src/client/lib/apiClient";

vi.mock("../../src/client/lib/apiClient", () => ({
  createInterview: vi.fn(),
  analyzeInterview: vi.fn(),
  trackEvent: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe("Landing", () => {
  beforeEach(() => {
    vi.mocked(apiClient.createInterview).mockReset();
    vi.mocked(apiClient.analyzeInterview).mockReset();
    mockNavigate.mockReset();
  });

  it("renders the hero, CTA, benefits and example interview", () => {
    renderLanding();
    expect(screen.getByRole("heading", { name: /will your java cv survive a senior engineer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grill my cv/i })).toBeInTheDocument();
    expect(screen.getByText("CV-specific")).toBeInTheDocument();
    expect(screen.getByText("Adaptive")).toBeInTheDocument();
    expect(screen.getByText("Senior-level")).toBeInTheDocument();
    expect(screen.getByText(/why did that system need asynchronous communication/i)).toBeInTheDocument();
  });

  it("submits valid CV text to the API and navigates to the scan screen", async () => {
    vi.mocked(apiClient.createInterview).mockResolvedValue({ interviewId: "interview-1" });
    vi.mocked(apiClient.analyzeInterview).mockResolvedValue({
      status: "ready",
      analysis: {
        estimatedSeniority: "senior",
        primaryStack: [],
        technologies: [],
        projects: [],
        claims: [],
        vagueClaims: [],
      },
    });
    renderLanding();

    const cvText = "a".repeat(CV_MIN_LENGTH + 10);
    fireEvent.change(screen.getByLabelText(/paste your cv/i), { target: { value: cvText } });
    fireEvent.click(screen.getByRole("button", { name: /analyze my cv/i }));

    await waitFor(() => {
      expect(apiClient.createInterview).toHaveBeenCalledWith({ cvText, jobDescription: undefined });
    });
    expect(apiClient.analyzeInterview).toHaveBeenCalledWith("interview-1");
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/interview/interview-1/scan");
    });
  });

  it("shows a validation message and does not call the API for a too-short CV", () => {
    renderLanding();

    fireEvent.change(screen.getByLabelText(/paste your cv/i), { target: { value: "too short" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze my cv/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/too short/i);
    expect(apiClient.createInterview).not.toHaveBeenCalled();
  });
});
