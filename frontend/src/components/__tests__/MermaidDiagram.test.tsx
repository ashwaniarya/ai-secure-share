import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import mermaid from "mermaid";
import { beforeEach, expect, test, vi } from "vitest";
import MermaidDiagram from "../MermaidDiagram";

// jsdom can't lay out real SVG, so mermaid is mocked to a deterministic stub.
// The zoom library is used for real (exercising the ResizeObserver polyfill).
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: vi.fn(async (_id: string, code: string) => ({
      svg: `<svg data-testid="rendered-svg"><text>${code}</text></svg>`,
    })),
  },
}));

const mockedMermaid = vi.mocked(mermaid, true);

beforeEach(() => {
  vi.clearAllMocks();
});

test("renders the diagram SVG from the source", async () => {
  render(<MermaidDiagram code={"graph TD\n  A-->B"} />);
  expect(await screen.findByTestId("rendered-svg")).toBeInTheDocument();
  expect(mockedMermaid.render).toHaveBeenCalledWith(
    expect.stringMatching(/^mermaid-/),
    "graph TD\n  A-->B",
  );
});

test("shows zoom and fullscreen controls", async () => {
  render(<MermaidDiagram code={"graph TD\n  A-->B"} />);
  await screen.findByTestId("rendered-svg");
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Fullscreen" })).toBeInTheDocument();
});

test("falls back to the original source when the diagram is invalid", async () => {
  mockedMermaid.parse.mockRejectedValueOnce(new Error("Parse error on line 1"));
  render(<MermaidDiagram code={"this is not a diagram"} />);
  expect(
    await screen.findByText("Diagram could not be rendered."),
  ).toBeInTheDocument();
  expect(screen.getByText("this is not a diagram")).toBeInTheDocument();
  expect(screen.queryByTestId("rendered-svg")).toBeNull();
});

test("opens a fullscreen dialog and closes on Escape, restoring focus", async () => {
  const user = userEvent.setup();
  render(<MermaidDiagram code={"graph TD\n  A-->B"} />);
  await screen.findByTestId("rendered-svg");

  const fullscreenButton = screen.getByRole("button", { name: "Fullscreen" });
  await user.click(fullscreenButton);

  expect(await screen.findByRole("dialog")).toBeInTheDocument();

  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(fullscreenButton);
});

test("renders without crashing under reduced motion", async () => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  try {
    render(<MermaidDiagram code={"graph TD\n  A-->B"} />);
    expect(await screen.findByTestId("rendered-svg")).toBeInTheDocument();
  } finally {
    window.matchMedia = original;
  }
});
