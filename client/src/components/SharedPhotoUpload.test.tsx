import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedPhotoUpload } from "@/components/SharedPhotoUpload";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/authToken", () => ({
  getAccessToken: () => "test-token",
}));

describe("SharedPhotoUpload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the file picker once without submitting its parent form", () => {
    const submit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    const inputClick = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <form onSubmit={submit}>
        <SharedPhotoUpload onUploadComplete={vi.fn()} />
      </form>,
    );

    fireEvent.click(screen.getByTestId("button-upload-image"));

    expect(inputClick).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
