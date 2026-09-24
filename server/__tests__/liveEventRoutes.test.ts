import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { isActiveRegistration, ticketRegistrationCounts } from "@shared/ticketAvailability";
import { sumBookingTicketQuantity } from "@shared/ticketDeduction";

// Exercise the actual handlers without starting payments, mail or schedulers.
const source = ts.createSourceFile("routes.ts", readFileSync("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);
function handler(method: string, path: string, dependencies: Record<string, unknown>) {
  let callback: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === "app"
      && node.expression.name.text === method
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === path) callback = node.arguments.at(-1);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!callback) throw new Error(`Route not found: ${method} ${path}`);
  const compiled = ts.transpileModule(`const run = ${callback.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return run;`)(...Object.values(dependencies));
}

function response() {
  const res = { statusCode: 200, body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
  return res;
}

describe("Collab Idea moderation permissions", () => {
  it.each(["put", "delete"])("permits owners/admins and rejects other members for %s", async (method) => {
    for (const role of ["owner", "admin", "member"]) {
      const storage = {
        getCollabIdea: vi.fn(async () => ({ id: "idea", posterId: "owner" })),
        updateCollabIdea: vi.fn(async () => ({ id: "idea", title: "Edited" })),
        deleteCollabIdea: vi.fn(async () => {}),
      };
      const run = handler(method, "/api/collab/ideas/:id", {
        storage, resolveCurrentUserId: () => role,
        checkIsAdmin: async () => role === "admin",
        parseCollabIdeaBody: () => ({ values: { title: "Edited" } }),
        resolveCollabExpiry: () => null,
      });
      const res = response();
      await run({ params: { id: "idea" }, body: { title: "Edited" } }, res);
      expect(res.statusCode).toBe(role === "member" ? 403 : 200);
      expect(storage.updateCollabIdea.mock.calls.length + storage.deleteCollabIdea.mock.calls.length)
        .toBe(role === "member" ? 0 : 1);
    }
  });
});

it("returns actual ticket quantities for the event's short URL", async () => {
  const rows = [
    { ticketSkuId: "sprint", ticketQuantity: 25, status: "pending" },
    { ticketSkuId: "double", ticketQuantity: 25, status: "pending" },
    { ticketSkuId: "sprint", ticketQuantity: 5, status: "cancelled" },
  ];
  const storage = {
    getExperience: vi.fn(async () => undefined),
    getExperienceBySlug: vi.fn(async () => ({ id: "actual-id", maxParticipants: 80, ticketSkus: [
      { id: "sprint", ticketCapacity: 40 }, { id: "double", ticketCapacity: 40 },
    ] })),
    getBookingsByExperience: vi.fn(async () => rows),
  };
  const run = handler("get", "/api/experiences/:id/booking-stats", {
    storage, sumBookingTicketQuantity, isActiveRegistration, ticketRegistrationCounts,
  });
  const res = response();
  await run({ params: { id: "run-swim-run" } }, res);
  expect(storage.getBookingsByExperience).toHaveBeenCalledWith("actual-id");
  expect(res.body.currentBookings).toBe(50);
  expect(res.body.capacity).toBe(80);
  expect(res.body.ticketRegistrations.map((row: any) => row.remaining)).toEqual([15, 15]);
});
