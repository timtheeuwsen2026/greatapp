import { describe, expect, it } from "vitest";
import { renderMasterEmailTemplate } from "../emailTemplates";

const baseOptions = {
  appBaseUrl: "https://great.example",
  recipientEmail: "person@example.com",
  preferencesToken: "signed.preference-token",
  bodyText: "Hello from Great.",
};

describe("renderMasterEmailTemplate", () => {
  it("uses the shared purple gradient Great. header", () => {
    const rendered = renderMasterEmailTemplate(baseOptions);

    expect(rendered.html).toContain("linear-gradient(180deg, #765ff0 0%, #c35df6 100%)");
    expect(rendered.html).toContain('<div class="brand-word">great</div>');
    expect(rendered.html.match(/class="brand-dot"/g)).toHaveLength(4);
  });

  it("uses signed preference links without exposing the recipient address", () => {
    const rendered = renderMasterEmailTemplate(baseOptions);

    expect(rendered.html).toContain("/email-preferences?token=signed.preference-token");
    expect(rendered.html).toContain("/unsubscribe?token=signed.preference-token");
    expect(rendered.html).not.toContain("person%40example.com");
    expect(rendered.text).not.toContain("person@example.com");
  });

  it("escapes body, receipt, and CTA content", () => {
    const rendered = renderMasterEmailTemplate({
      ...baseOptions,
      bodyText: "Hello <script>alert('x')</script>",
      receiptRows: [{ label: "Deal <type>", value: "5 & 10" }],
      cta: { label: "Open <offer>", href: "https://great.example/?a=1&b=2" },
    });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("Deal &lt;type&gt;");
    expect(rendered.html).toContain("5 &amp; 10");
    expect(rendered.html).toContain("Open &lt;offer&gt;");
    expect(rendered.html).toContain("a=1&amp;b=2");
  });

  it("renders the pre-MVG participant footer with its dynamic perk and link", () => {
    const rendered = renderMasterEmailTemplate({
      ...baseOptions,
      growthFooterContext: "pre_mvg_participant",
      growthFooterData: {
        b2cPerk: "10% cashback",
        participantRefLink: "https://great.example/experience/event-1?ref=abc",
      },
    });

    expect(rendered.html).toContain("Don't let this experience get canceled!");
    expect(rendered.html).toContain("10% cashback");
    expect(rendered.html).toContain("ref=abc");
  });

  it("renders the confirmed participant footer with its tracking data", () => {
    const rendered = renderMasterEmailTemplate({
      ...baseOptions,
      growthFooterContext: "confirmed_participant",
      growthFooterData: {
        b2cPerk: "a free coffee",
        participantRefLink: "https://great.example/experience/event-1?ref=xyz",
      },
    });

    expect(rendered.html).toContain("Bring your squad &amp; unlock rewards!");
    expect(rendered.html).toContain("a free coffee");
    expect(rendered.html).toContain("ref=xyz");
  });

  it("renders the B2B partner footer with deal value and tracking link", () => {
    const rendered = renderMasterEmailTemplate({
      ...baseOptions,
      growthFooterContext: "partner",
      growthFooterData: {
        b2bDealValue: "12%",
        brandRefLink: "https://great.example/e/event-1?ref=partner",
      },
    });

    expect(rendered.html).toContain("Your Tracking Link is Live");
    expect(rendered.html).toContain("12%");
    expect(rendered.html).toContain("ref=partner");
  });

  it("renders the creator footer with the public event URL", () => {
    const rendered = renderMasterEmailTemplate({
      ...baseOptions,
      growthFooterContext: "creator_venue",
      growthFooterData: { mainEventUrl: "https://great.example/e/public-event" },
    });

    expect(rendered.html).toContain("Fill your capacity");
    expect(rendered.html).toContain("https://great.example/e/public-event");
  });
});
