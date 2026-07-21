export type GrowthFooterContext =
  | "none"
  | "account"
  | "security"
  | "participant"
  | "pre_mvg_participant"
  | "confirmed_participant"
  | "creator"
  | "creator_venue"
  | "partner";

export interface EmailCta {
  label: string;
  href: string;
}

export interface EmailReceiptRow {
  label: string;
  value: string;
}

export interface GrowthFooterData {
  b2cPerk?: string | null;
  participantRefLink?: string | null;
  b2bDealValue?: string | null;
  brandRefLink?: string | null;
  mainEventUrl?: string | null;
}

export interface MasterEmailTemplateOptions {
  recipientEmail?: string | null;
  preferencesToken?: string | null;
  preheader?: string;
  bodyText: string;
  receiptRows?: EmailReceiptRow[];
  cta?: EmailCta;
  growthFooterContext?: GrowthFooterContext;
  growthFooterData?: GrowthFooterData;
  appBaseUrl: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const growthFooterPartials: Record<Exclude<GrowthFooterContext, "none" | "security">, {
  html: (appBaseUrl: string, data: GrowthFooterData) => string;
  text: (appBaseUrl: string, data: GrowthFooterData) => string;
}> = {
  account: {
    html: (appBaseUrl) => `
      <div class="growth-footer">
        <p class="growth-title">Ready when you are</p>
        <p>Explore experiences, community hubs, and partner deals from your Great. account.</p>
        <a href="${escapeHtml(`${appBaseUrl}/experiences`)}">Browse experiences</a>
      </div>
    `,
    text: (appBaseUrl) => `Ready when you are\nExplore experiences, community hubs, and partner deals from your Great. account.\nBrowse experiences: ${appBaseUrl}/experiences`,
  },
  participant: {
    html: (appBaseUrl) => `
      <div class="growth-footer">
        <p class="growth-title">Find your next group</p>
        <p>See what is forming now and join the experiences that match your energy.</p>
        <a href="${escapeHtml(`${appBaseUrl}/experiences`)}">Explore trips</a>
      </div>
    `,
    text: (appBaseUrl) => `Find your next group\nSee what is forming now and join the experiences that match your energy.\nExplore trips: ${appBaseUrl}/experiences`,
  },
  pre_mvg_participant: {
    html: (_appBaseUrl, data) => `
      <div class="growth-footer">
        <p class="growth-title">Don't let this experience get canceled!</p>
        <p>We need a few more people to make this happen. Share your personal link to confirm the trip AND earn ${escapeHtml(data.b2cPerk || "your reward")} for every friend who joins.</p>
        ${data.participantRefLink ? `<a href="${escapeHtml(data.participantRefLink)}">${escapeHtml(data.participantRefLink)}</a>` : ""}
      </div>
    `,
    text: (_appBaseUrl, data) => `Don't let this experience get canceled!\nWe need a few more people to make this happen. Share your personal link to confirm the trip AND earn ${data.b2cPerk || "your reward"} for every friend who joins${data.participantRefLink ? `: ${data.participantRefLink}` : "."}`,
  },
  confirmed_participant: {
    html: (_appBaseUrl, data) => `
      <div class="growth-footer">
        <p class="growth-title">Bring your squad &amp; unlock rewards!</p>
        <p>Experiences are better with friends. Share your personal link and you'll earn ${escapeHtml(data.b2cPerk || "your reward")} directly to your account for every friend who books using your link.</p>
        ${data.participantRefLink ? `<a href="${escapeHtml(data.participantRefLink)}">${escapeHtml(data.participantRefLink)}</a>` : ""}
      </div>
    `,
    text: (_appBaseUrl, data) => `Bring your squad & unlock rewards!\nExperiences are better with friends. Share your personal link and you'll earn ${data.b2cPerk || "your reward"} directly to your account for every friend who books using your link${data.participantRefLink ? `: ${data.participantRefLink}` : "."}`,
  },
  creator: {
    html: (appBaseUrl) => `
      <div class="growth-footer">
        <p class="growth-title">Build something people can join</p>
        <p>Create an experience and let Great. help with discovery, bookings, and group momentum.</p>
        <a href="${escapeHtml(`${appBaseUrl}/event-builder`)}">Create an experience</a>
      </div>
    `,
    text: (appBaseUrl) => `Build something people can join\nCreate an experience and let Great. help with discovery, bookings, and group momentum.\nCreate an experience: ${appBaseUrl}/event-builder`,
  },
  creator_venue: {
    html: (appBaseUrl, data) => `
      <div class="growth-footer">
        <p class="growth-title">Fill your capacity</p>
        <p>Copy your event link to share on Instagram, WhatsApp, and your community channels to start driving bookings.</p>
        <a href="${escapeHtml(data.mainEventUrl || `${appBaseUrl}/creator-dashboard`)}">${escapeHtml(data.mainEventUrl || `${appBaseUrl}/creator-dashboard`)}</a>
      </div>
    `,
    text: (appBaseUrl, data) => `Fill your capacity\nCopy your event link to share on Instagram, WhatsApp, and your community channels to start driving bookings: ${data.mainEventUrl || `${appBaseUrl}/creator-dashboard`}`,
  },
  partner: {
    html: (appBaseUrl, data) => `
      <div class="growth-footer">
        <p class="growth-title">Your Tracking Link is Live</p>
        <p>Share this link with your audience to track your conversions and automatically earn your ${escapeHtml(data.b2bDealValue || "agreed")} commission.</p>
        <a href="${escapeHtml(data.brandRefLink || `${appBaseUrl}/promoter`)}">${escapeHtml(data.brandRefLink || `${appBaseUrl}/promoter`)}</a>
      </div>
    `,
    text: (appBaseUrl, data) => `Your Tracking Link is Live\nShare this link with your audience to track your conversions and automatically earn your ${data.b2bDealValue || "agreed"} commission: ${data.brandRefLink || `${appBaseUrl}/promoter`}`,
  },
};

export function renderMasterEmailTemplate(opts: MasterEmailTemplateOptions): RenderedEmail {
  const appBaseUrl = opts.appBaseUrl.replace(/\/$/, "");
  const brandLogoUrl = `${appBaseUrl}/email-assets/email_logo.png`;
  const unsubscribeUrl = buildFooterUrl(appBaseUrl, "/unsubscribe", opts.preferencesToken);
  const preferencesUrl = buildFooterUrl(appBaseUrl, "/email-preferences", opts.preferencesToken);
  const growthFooter = renderGrowthFooter(opts.growthFooterContext || "none", appBaseUrl, opts.growthFooterData || {});
  const bodyHtml = renderBodyText(opts.bodyText);
  const receiptHtml = renderReceiptRows(opts.receiptRows);
  const receiptText = renderReceiptText(opts.receiptRows);
  const ctaHtml = opts.cta
    ? `<div class="cta-wrap"><a class="button" href="${escapeHtml(opts.cta.href)}">${escapeHtml(opts.cta.label)}</a></div>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Great.</title>
    <style>
      body { margin: 0; padding: 0; background: #f7f5f0; color: #1f2933; font-family: Arial, Helvetica, sans-serif; }
      .preheader { display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; }
      .shell { width: 100%; padding: 32px 14px; }
      .container { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #ece7dc; border-radius: 8px; overflow: hidden; }
      .header { text-align: center; background: #955cf2; }
      .brand-logo { display: block; width: 100%; max-width: 580px; height: auto; margin: 0 auto; border: 0; }
      .content { padding: 34px 32px 12px; font-size: 16px; line-height: 1.68; color: #29323d; }
      .content p { margin: 0 0 18px; }
      .receipt { margin: 4px 32px 28px; border: 1px solid #e6e1d6; border-radius: 8px; overflow: hidden; background: #fffdf8; }
      .receipt-row { display: table; width: 100%; border-top: 1px solid #eee8dc; }
      .receipt-row:first-child { border-top: 0; }
      .receipt-label, .receipt-value { display: table-cell; padding: 13px 16px; font-size: 14px; line-height: 1.45; vertical-align: top; }
      .receipt-label { width: 44%; color: #667085; font-weight: 700; }
      .receipt-value { color: #1f2933; font-weight: 700; text-align: right; }
      .cta-wrap { padding: 8px 32px 30px; text-align: center; }
      .button { display: inline-block; padding: 13px 22px; border-radius: 6px; background: #111827; color: #ffffff !important; font-weight: 700; font-size: 15px; text-decoration: none; }
      .growth-footer { margin: 4px 32px 30px; padding: 18px; border-radius: 8px; background: #f8faf7; border: 1px solid #e4eadf; color: #364152; font-size: 14px; line-height: 1.55; }
      .growth-footer p { margin: 0 0 10px; }
      .growth-footer a { color: #155e75; font-weight: 700; text-decoration: none; }
      .growth-title { color: #111827; font-weight: 700; }
      .footer { padding: 24px 32px 32px; text-align: center; border-top: 1px solid #f0ece4; color: #687385; font-size: 12px; line-height: 1.6; }
      .footer a { color: #4b5563; text-decoration: underline; }
      @media screen and (max-width: 480px) {
        .shell { padding: 16px 8px; }
        .content, .cta-wrap, .footer { padding-left: 22px; padding-right: 22px; }
        .receipt { margin-left: 22px; margin-right: 22px; }
        .receipt-label, .receipt-value { display: block; width: auto; text-align: left; }
        .receipt-value { padding-top: 0; }
        .growth-footer { margin-left: 22px; margin-right: 22px; }
      }
    </style>
  </head>
  <body>
    <span class="preheader">${escapeHtml(opts.preheader || "")}</span>
    <div class="shell">
      <div class="container">
        <div class="header">
          <img class="brand-logo" src="${escapeHtml(brandLogoUrl)}" width="580" alt="Great">
        </div>
        <div class="content">
          ${bodyHtml}
        </div>
        ${receiptHtml}
        ${ctaHtml}
        ${growthFooter.html}
        <div class="footer">
          <p>You are receiving this email because of your account or activity with Great.</p>
          <p><a href="${escapeHtml(preferencesUrl)}">Manage email preferences</a> &nbsp;|&nbsp; <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const textParts = [
    opts.bodyText.trim(),
    receiptText,
    opts.cta ? `${opts.cta.label}: ${opts.cta.href}` : "",
    growthFooter.text,
    `Manage email preferences: ${preferencesUrl}`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].filter(Boolean);

  return {
    html,
    text: textParts.join("\n\n"),
  };
}

function renderReceiptRows(rows?: EmailReceiptRow[]): string {
  if (!rows?.length) return "";
  const renderedRows = rows
    .map((row) => `
      <div class="receipt-row">
        <div class="receipt-label">${escapeHtml(row.label)}</div>
        <div class="receipt-value">${escapeHtml(row.value)}</div>
      </div>
    `)
    .join("");
  return `<div class="receipt">${renderedRows}</div>`;
}

function renderReceiptText(rows?: EmailReceiptRow[]): string {
  if (!rows?.length) return "";
  return rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}

function renderGrowthFooter(context: GrowthFooterContext, appBaseUrl: string, data: GrowthFooterData): { html: string; text: string } {
  if (context === "none" || context === "security") {
    return { html: "", text: "" };
  }

  const partial = growthFooterPartials[context];
  return {
    html: partial.html(appBaseUrl, data),
    text: partial.text(appBaseUrl, data),
  };
}

function renderBodyText(bodyText: string): string {
  return bodyText
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function buildFooterUrl(appBaseUrl: string, path: string, preferencesToken?: string | null): string {
  const url = new URL(path, appBaseUrl);
  if (preferencesToken) {
    url.searchParams.set("token", preferencesToken);
  }
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
