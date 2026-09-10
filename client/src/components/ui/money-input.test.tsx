import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MoneyInput } from "./money-input";

/**
 * The reported bug: "Your margin" would not take a leading decimal point.
 * Typing ".50" failed, and the only way to reach €0.50 was to type "05" and
 * then reposition the caret to insert a "." in the middle. Margins are usually
 * small amounts, so this was on the hot path, not an edge case.
 */
function Harness({ initial = null }: { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <MoneyInput value={value} onValueChange={setValue} data-testid="money" />
      <output data-testid="value">{value === null ? "null" : String(value)}</output>
    </>
  );
}

describe("MoneyInput", () => {
  it("accepts a leading decimal point", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByTestId("money"), ".50");

    expect((screen.getByTestId("money") as HTMLInputElement).value).toBe(".50");
    expect(screen.getByTestId("value").textContent).toBe("0.5");
  });

  it("keeps the point while a number is still being typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByTestId("money") as HTMLInputElement;

    // "0." used to parse to 0, re-render as "0", and swallow the point.
    await user.type(input, "0.");
    expect(input.value).toBe("0.");

    await user.type(input, "5");
    expect(input.value).toBe("0.5");
    expect(screen.getByTestId("value").textContent).toBe("0.5");
  });

  it("reports a cleared field as cleared, not as zero", async () => {
    const user = userEvent.setup();
    render(<Harness initial={12} />);
    const input = screen.getByTestId("money") as HTMLInputElement;

    await user.clear(input);

    expect(screen.getByTestId("value").textContent).toBe("null");
  });

  it("refuses characters that could never be part of an amount", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByTestId("money") as HTMLInputElement;

    await user.type(input, "1a2");

    expect(input.value).toBe("12");
  });

  it("takes a comma as a decimal separator", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByTestId("money"), "3,50");

    expect(screen.getByTestId("value").textContent).toBe("3.5");
  });

  it("counts whole numbers only when asked to", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MoneyInput value={null} onValueChange={onValueChange} integer data-testid="count" />);

    await user.type(screen.getByTestId("count"), "3.5");

    expect((screen.getByTestId("count") as HTMLInputElement).value).toBe("35");
  });
});
