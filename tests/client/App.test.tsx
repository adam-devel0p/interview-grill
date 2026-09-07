import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../../src/client/App";

describe("App", () => {
  it("renders the landing page at the root route", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /will your java cv survive a senior engineer/i })).toBeInTheDocument();
  });
});
