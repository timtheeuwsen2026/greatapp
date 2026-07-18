import { eq } from "drizzle-orm";
import { emailPreferences } from "@shared/schema";
import { db } from "./db";

export type EmailCategory = "transactional" | "community" | "reminder" | "marketing";

export interface EmailPreferenceSettings {
  communityEmailsEnabled: boolean;
  reminderEmailsEnabled: boolean;
  marketingEmailsEnabled: boolean;
}

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferenceSettings = {
  communityEmailsEnabled: true,
  reminderEmailsEnabled: true,
  marketingEmailsEnabled: true,
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getEmailPreferenceSettings(email: string): Promise<EmailPreferenceSettings> {
  const normalizedEmail = normalizeEmail(email);
  const [preference] = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.email, normalizedEmail))
    .limit(1);

  if (!preference) return DEFAULT_EMAIL_PREFERENCES;
  return {
    communityEmailsEnabled: preference.communityEmailsEnabled,
    reminderEmailsEnabled: preference.reminderEmailsEnabled,
    marketingEmailsEnabled: preference.marketingEmailsEnabled,
  };
}

export async function updateEmailPreferenceSettings(
  email: string,
  settings: EmailPreferenceSettings,
): Promise<EmailPreferenceSettings> {
  const normalizedEmail = normalizeEmail(email);
  const allOptionalDisabled = !settings.communityEmailsEnabled
    && !settings.reminderEmailsEnabled
    && !settings.marketingEmailsEnabled;
  const values = {
    email: normalizedEmail,
    ...settings,
    unsubscribedAt: allOptionalDisabled ? new Date() : null,
    updatedAt: new Date(),
  };

  await db
    .insert(emailPreferences)
    .values(values)
    .onConflictDoUpdate({ target: emailPreferences.email, set: values });

  return settings;
}

export async function unsubscribeFromOptionalEmail(email: string): Promise<EmailPreferenceSettings> {
  return updateEmailPreferenceSettings(email, {
    communityEmailsEnabled: false,
    reminderEmailsEnabled: false,
    marketingEmailsEnabled: false,
  });
}

export async function isEmailCategoryEnabled(email: string, category: EmailCategory): Promise<boolean> {
  if (category === "transactional") return true;
  const settings = await getEmailPreferenceSettings(email);
  if (category === "community") return settings.communityEmailsEnabled;
  if (category === "reminder") return settings.reminderEmailsEnabled;
  return settings.marketingEmailsEnabled;
}
