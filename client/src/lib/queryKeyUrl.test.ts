import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import { urlForQueryKey } from "./queryClient";

describe("query key addresses", () => {
  it("joins the parts as before", () => {
    expect(urlForQueryKey(["/api/admin/drafts"])).toBe("/api/admin/drafts");
    expect(urlForQueryKey(["/api/experiences", "abc"])).toBe("/api/experiences/abc");
  });

  it("turns a closing object into the query string, for the admin city switch (66.24)", () => {
    expect(urlForQueryKey(["/api/admin/drafts", { city: "Amsterdam" }])).toBe("/api/admin/drafts?city=Amsterdam");
    expect(urlForQueryKey(["/api/admin/drafts", {}])).toBe("/api/admin/drafts");
    expect(urlForQueryKey(["/api/admin/x?page=2", { city: "Barcelona" }])).toBe("/api/admin/x?page=2&city=Barcelona");
  });
});
