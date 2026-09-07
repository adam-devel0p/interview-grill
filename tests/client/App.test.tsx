import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../../src/client/App";

describe("App", () => {
  it("renders the placeholder landing page", () => {
    render(<App />);
    expect(screen.getByText("Java Interview Griller")).toBeInTheDocument();
  });
});
