import { describe, it, expect, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { hostToolsInApp, useHostToolsInApp } from "@/lib/nativeApp";

// The app decides whether the hosting tools show inside it from "hostTools" in
// client/public/app-config.json, and tells the site through window.AppForge.
function setShell(inApp: boolean | undefined) {
  (window as any).AppForge = {
    native: true,
    platform: "android",
    ...(inApp === undefined ? {} : { hostToolsInApp: () => inApp }),
  };
}

afterEach(() => {
  delete (window as any).AppForge;
});

describe("hostToolsInApp", () => {
  it("is false in a normal browser", () => {
    expect(hostToolsInApp()).toBe(false);
  });

  it("is false in app builds that predate the setting", () => {
    setShell(undefined);
    expect(hostToolsInApp()).toBe(false);
  });

  it("follows the app's answer", () => {
    setShell(true);
    expect(hostToolsInApp()).toBe(true);
    setShell(false);
    expect(hostToolsInApp()).toBe(false);
  });

  it("updates React when the app reports a change", () => {
    setShell(false);
    const { result } = renderHook(() => useHostToolsInApp());
    expect(result.current).toBe(false);
    act(() => {
      setShell(true);
      window.dispatchEvent(new CustomEvent("appforge:host-tools", { detail: { inApp: true } }));
    });
    expect(result.current).toBe(true);
  });
});

describe("app-config.json", () => {
  it("sets hostTools to app or browser", () => {
    const file = path.resolve(__dirname, "../../public/app-config.json");
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(["app", "browser"]).toContain(config.hostTools);
    expect(config.tabBar.items.length).toBeGreaterThanOrEqual(2);
    expect(config.tabBar.items.length).toBeLessThanOrEqual(5);
  });
});
