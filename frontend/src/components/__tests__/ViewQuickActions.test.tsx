import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import ViewQuickActions from "../ViewQuickActions";

afterEach(() => {
  localStorage.clear();
  document.body.classList.remove("view-full");
  document.body.style.removeProperty("--view-font-scale");
});

test("defaults to compact: no body class, Expand button not pressed", () => {
  render(<ViewQuickActions />);
  const toggle = screen.getByRole("button", { name: "Expand" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(document.body.classList.contains("view-full")).toBe(false);
});

test("toggle expands: body class, persisted value, label flips to Compact", async () => {
  const user = userEvent.setup();
  render(<ViewQuickActions />);

  await user.click(screen.getByRole("button", { name: "Expand" }));

  expect(document.body.classList.contains("view-full")).toBe(true);
  expect(localStorage.getItem("ars:view-width")).toBe('"full"');
  const toggle = screen.getByRole("button", { name: "Compact" });
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(toggle).toHaveAttribute("data-tooltip", "Compact");
});

test("stored full mode applies on mount", () => {
  localStorage.setItem("ars:view-width", '"full"');
  render(<ViewQuickActions />);
  expect(document.body.classList.contains("view-full")).toBe(true);
  expect(screen.getByRole("button", { name: "Compact" })).toBeInTheDocument();
});

test("font buttons scale the CSS variable and persist", async () => {
  const user = userEvent.setup();
  render(<ViewQuickActions />);

  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("1");

  await user.click(screen.getByRole("button", { name: "Increase font" }));
  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("1.1");
  expect(localStorage.getItem("ars:view-font-scale")).toBe("1.1");

  await user.click(screen.getByRole("button", { name: "Decrease font" }));
  await user.click(screen.getByRole("button", { name: "Decrease font" }));
  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("0.9");
  expect(localStorage.getItem("ars:view-font-scale")).toBe("0.9");
});

test("font scale clamps at the maximum and disables the button", async () => {
  localStorage.setItem("ars:view-font-scale", "1.4");
  const user = userEvent.setup();
  render(<ViewQuickActions />);

  const increase = screen.getByRole("button", { name: "Increase font" });
  await user.click(increase);
  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("1.5");
  expect(increase).toBeDisabled();
});

test("font scale clamps at the minimum and disables the button", async () => {
  localStorage.setItem("ars:view-font-scale", "0.8");
  const user = userEvent.setup();
  render(<ViewQuickActions />);

  const decrease = screen.getByRole("button", { name: "Decrease font" });
  await user.click(decrease);
  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("0.7");
  expect(decrease).toBeDisabled();
});

test("corrupted stored values normalize: bad scale to 1, out-of-range clamped", () => {
  localStorage.setItem("ars:view-font-scale", '"garbage"');
  const { unmount } = render(<ViewQuickActions />);
  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("1");
  unmount();

  localStorage.setItem("ars:view-font-scale", "99");
  render(<ViewQuickActions />);
  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("1.5");
});

test("unmount cleans up the body class and CSS variable", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<ViewQuickActions />);
  await user.click(screen.getByRole("button", { name: "Expand" }));
  await user.click(screen.getByRole("button", { name: "Increase font" }));

  unmount();

  expect(document.body.classList.contains("view-full")).toBe(false);
  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("");
});

test("burst clicks within one task accumulate instead of using stale state", () => {
  render(<ViewQuickActions />);
  const increase = screen.getByRole("button", { name: "Increase font" });
  // two raw DOM clicks in the same task — no re-render between them
  act(() => {
    increase.click();
    increase.click();
  });
  expect(document.body.style.getPropertyValue("--view-font-scale")).toBe("1.2");
  expect(localStorage.getItem("ars:view-font-scale")).toBe("1.2");
});

test("all buttons expose tooltips matching their accessible names", () => {
  render(<ViewQuickActions />);
  for (const name of ["Expand", "Decrease font", "Increase font"]) {
    expect(screen.getByRole("button", { name })).toHaveAttribute(
      "data-tooltip",
      name,
    );
  }
});
