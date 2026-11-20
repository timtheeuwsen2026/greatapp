import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  describeDealPreferences,
  sanitiseDealPreferences,
  sanitiseSeekingTypes,
  sanitiseTypeDetails,
} from "@shared/collabIdeaOptions";
import { normalizeCityName } from "@shared/cities";

// Create flow point 26: the idea flow posts its open slots to the Collab board
// from the event draft. These run the real handlers out of routes.ts, without
// payments, mail or schedulers.

const source = ts.createSourceFile("routes.ts", readFileSync("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);

function compile(text: string, dependencies: Record<string, unknown>) {
  const compiled = ts.transpileModule(`const run = ${text};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return run;`)(...Object.values(dependencies));
}

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
  return compile(callback.getText(source), dependencies);
}

function fn(name: string, dependencies: Record<string, unknown>) {
  let found: ts.FunctionDeclaration | undefined;
  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
  });
  if (!found) throw new Error(`Function not found: ${name}`);
  const text = found.getText(source).replace(/^function\s+\w+/, "function").replace(/:\s*\{\s*error\?: string; values: Record<string, any> \}/, "");
  return compile(text, dependencies);
}

function response() {
  return {
    statusCode: 200, body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
}

const parseCollabIdeaBody = fn("parseCollabIdeaBody", {
  sanitiseSeekingTypes, sanitiseDealPreferences, sanitiseTypeDetails, describeDealPreferences, normalizeCityName,
});

describe("parseCollabIdeaBody — the listed flag", () => {
  const body = { title: "Coffee rave", seekingPartnerTypes: ["community"] };

  it("passes Post to board / invite-only through when it is said", () => {
    expect(parseCollabIdeaBody({ ...body, listed: false }).values.listed).toBe(false);
    expect(parseCollabIdeaBody({ ...body, listed: true }).values.listed).toBe(true);
  });

  it("leaves it out when nothing is said, so an edit from the old form keeps the posting where it was", () => {
    expect(parseCollabIdeaBody(body).values).not.toHaveProperty("listed");
    expect(parseCollabIdeaBody({ ...body, listed: "false" }).values).not.toHaveProperty("listed");
  });

  it("keeps how a community earns and what a sponsor gets back", () => {
    const parsed = parseCollabIdeaBody({
      title: "Coffee rave",
      seekingPartnerTypes: ["community", "sponsor"],
      typeDetails: {
        community: { earn: "€2.00 per person who checks in" },
        sponsor: { need: "Drinks", giveBack: "Logo on the flyer" },
      },
    });
    expect(parsed.values.typeDetails).toEqual({
      community: { earn: "€2.00 per person who checks in" },
      sponsor: { need: "Drinks", giveBack: "Logo on the flyer" },
    });
  });
});

function postRoute(overrides: { draft?: unknown; venues?: unknown[] } = {}) {
  const created: any[] = [];
  const storage = {
    getExperienceDraft: vi.fn(async (id: string, creatorId: string) =>
      "draft" in overrides ? overrides.draft : (id === "draft-1" && creatorId === "owner" ? { id } : undefined)),
    getUser: vi.fn(async () => ({ role: "creator", email: "someone@example.com" })),
    createCollabIdea: vi.fn(async (values: any) => {
      const idea = { id: "idea-1", listed: true, ...values };
      created.push(idea);
      return idea;
    }),
    getApprovedVenuesForMatching: vi.fn(async () => overrides.venues ?? []),
  };
  const run = handler("post", "/api/collab/ideas", {
    storage,
    resolveCurrentUserId: (req: any) => req.user,
    parseCollabIdeaBody,
    generatePartnerToken: () => "token",
    resolveCollabExpiry: () => null,
    venueMatchesCollabIdea: () => true,
    formatCollabPeriod: () => "",
    formatCollabGroupSize: () => "",
    notificationService: { sendCollabIdeaMatchEmail: vi.fn(async () => {}) },
    getAppBaseUrl: () => "https://great.test",
  });
  return { run, storage, created };
}

describe("POST /api/collab/ideas from the idea flow", () => {
  it("ties the posting to the organiser's own draft", async () => {
    const { run, created } = postRoute();
    const res = response();
    await run({ user: "owner", body: { title: "Coffee rave", seekingPartnerTypes: ["venue"], experienceDraftId: "draft-1", listed: true } }, res);
    expect(res.statusCode).toBe(201);
    expect(created[0]).toMatchObject({ experienceDraftId: "draft-1", listed: true });
  });

  it("refuses somebody else's draft and posts nothing", async () => {
    const { run, storage } = postRoute();
    const res = response();
    await run({ user: "stranger", body: { title: "Coffee rave", seekingPartnerTypes: ["venue"], experienceDraftId: "draft-1" } }, res);
    expect(res.statusCode).toBe(403);
    expect(storage.createCollabIdea).not.toHaveBeenCalled();
  });

  it("posts from the old form as before, with no draft", async () => {
    const { run, created } = postRoute();
    const res = response();
    await run({ user: "owner", body: { title: "Coffee rave", seekingPartnerTypes: ["venue"] } }, res);
    expect(res.statusCode).toBe(201);
    expect(created[0].experienceDraftId).toBeNull();
  });

  it("does not tell matching venues about an invite-only posting", async () => {
    const venues = [{ id: "v1", createdBy: "venue-owner", name: "Bar" }];
    const listed = postRoute({ venues });
    const res1 = response();
    await listed.run({ user: "owner", body: { title: "Rave", seekingPartnerTypes: ["venue"], listed: true } }, res1);
    expect(res1.body.notified).toBe(1);

    const unlisted = postRoute({ venues });
    const res2 = response();
    await unlisted.run({ user: "owner", body: { title: "Rave", seekingPartnerTypes: ["venue"], listed: false } }, res2);
    expect(res2.body.notified).toBe(0);
    expect(unlisted.storage.getApprovedVenuesForMatching).not.toHaveBeenCalled();
  });
});

describe("the Collab board feed", () => {
  it("only lists postings that were posted to the board", () => {
    const storageSource = readFileSync("server/storage.ts", "utf8");
    const feed = storageSource.slice(storageSource.indexOf("async getOpenCollabIdeas"), storageSource.indexOf("async getOpenCollabIdeas") + 900);
    expect(feed).toContain("eq(collabIdeas.listed, true)");
  });
});

describe("deleting an idea draft", () => {
  it("takes its posting off the Collab board", async () => {
    const storage = {
      deleteExperienceDraft: vi.fn(async () => {}),
      withdrawCollabIdeasForDraft: vi.fn(async () => {}),
    };
    const run = handler("delete", "/api/experience-drafts/:id", { storage });
    const res = response();
    await run({ user: { claims: { sub: "owner" } }, params: { id: "draft-1" } }, res);
    expect(storage.deleteExperienceDraft).toHaveBeenCalledWith("draft-1", "owner");
    expect(storage.withdrawCollabIdeasForDraft).toHaveBeenCalledWith("draft-1");
  });

  it("does not withdraw anything when the draft was not theirs", async () => {
    const storage = {
      deleteExperienceDraft: vi.fn(async () => { throw new Error("Draft not found or access denied"); }),
      withdrawCollabIdeasForDraft: vi.fn(async () => {}),
    };
    const run = handler("delete", "/api/experience-drafts/:id", { storage });
    const res = response();
    await run({ user: { claims: { sub: "stranger" } }, params: { id: "draft-1" } }, res);
    expect(res.statusCode).toBe(500);
    expect(storage.withdrawCollabIdeasForDraft).not.toHaveBeenCalled();
  });
});

describe("publishing an idea", () => {
  it("links the posting to the event instead of withdrawing it", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    const publishes = routes.split("await storage.deleteExperienceDraft(draftId,").length - 1;
    expect(publishes).toBe(2);
    expect(routes.split("linkCollabIdeasToExperience(draftId, experience.id)").length - 1).toBe(2);
    const storageSource = readFileSync("server/storage.ts", "utf8");
    const del = storageSource.slice(storageSource.indexOf("async deleteExperienceDraft"), storageSource.indexOf("async withdrawCollabIdeasForDraft"));
    expect(del).not.toContain("collabIdeas");
  });
});
