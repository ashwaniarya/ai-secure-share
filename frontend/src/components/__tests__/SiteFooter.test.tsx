import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import SiteFooter from "../SiteFooter";
import { GITHUB_URL } from "../../lib/skill";

test("links to the GitHub repo", () => {
  render(<SiteFooter />);
  const link = screen.getByRole("link", { name: /github/i });
  expect(link).toHaveAttribute("href", GITHUB_URL);
});
