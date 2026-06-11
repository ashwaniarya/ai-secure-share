import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import useLocalStorage from "../useLocalStorage";

afterEach(() => localStorage.clear());

test("returns the fallback when nothing is stored", () => {
  const { result } = renderHook(() => useLocalStorage("k", "fallback"));
  expect(result.current[0]).toBe("fallback");
});

test("reads an existing stored JSON value", () => {
  localStorage.setItem("k", JSON.stringify("stored"));
  const { result } = renderHook(() => useLocalStorage("k", "fallback"));
  expect(result.current[0]).toBe("stored");
});

test("setter updates state and persists JSON", () => {
  const { result } = renderHook(() => useLocalStorage("k", 1));
  act(() => result.current[1](2));
  expect(result.current[0]).toBe(2);
  expect(localStorage.getItem("k")).toBe("2");
});

test("malformed stored JSON falls back without throwing", () => {
  localStorage.setItem("k", "{not json");
  const { result } = renderHook(() => useLocalStorage("k", "fallback"));
  expect(result.current[0]).toBe("fallback");
});

test("setter accepts a functional update based on the previous value", () => {
  const { result } = renderHook(() => useLocalStorage("k", 1));
  act(() => {
    result.current[1]((prev) => prev + 1);
    result.current[1]((prev) => prev + 1);
  });
  expect(result.current[0]).toBe(3);
  expect(localStorage.getItem("k")).toBe("3");
});
