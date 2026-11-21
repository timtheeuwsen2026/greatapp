import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Tim, bug 1: search matches on the host, so the public event list carries the
// organiser's public name. Runs the real function out of routes.ts.

const source = ts.createSourceFile("routes.ts", readFileSync("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);

function loadPublicHostNames(storage: unknown) {
  let found: ts.FunctionDeclaration | undefined;
  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "loadPublicHostNames") found = node;
  });
  if (!found) throw new Error("loadPublicHostNames not found");
  const compiled = ts.transpileModule(`const run = ${found.getText(source).replace(/^async function\s+\w+/, "async function")};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function("storage", `${compiled}; return run;`)(storage);
}

describe("the host name on the public event list", () => {
  it("uses the organiser's public display name, else their first name, and never more", async () => {
    const storage = {
      getCreatorProfileByUserId: vi.fn(async (id: string) => (id === "tim" ? { displayName: "Good Soles " } : undefined)),
      getUser: vi.fn(async (id: string) => (id === "eva" ? { firstName: "Eva", lastName: "Private", email: "eva@example.com" } : undefined)),
    };
    const names: Map<string, string> = await loadPublicHostNames(storage)(["tim", "eva", "tim", null, "ghost"]);
    expect(Object.fromEntries(names)).toEqual({ tim: "Good Soles", eva: "Eva" });
    // One lookup per organiser, however many events they have.
    expect(storage.getCreatorProfileByUserId).toHaveBeenCalledTimes(3);
  });

  it("leaves an organiser unnamed when a lookup fails, without failing the list", async () => {
    const storage = {
      getCreatorProfileByUserId: vi.fn(async () => { throw new Error("db down"); }),
      getUser: vi.fn(),
    };
    const names: Map<string, string> = await loadPublicHostNames(storage)(["tim"]);
    expect(names.size).toBe(0);
  });
});
