// What Stripe still needs before an account can be paid, in plain words.

const REQUIREMENT_WORDS: Array<[RegExp, string]> = [
  [/external_account/, "a bank account"],
  [/individual\.(id_number|ssn)/, "your ID number"],
  [/verification\.document|document/, "an ID document"],
  [/individual\.(dob|first_name|last_name|address)/, "your personal details"],
  [/business_profile/, "your business details"],
  [/tos_acceptance/, "accepting Stripe's terms"],
];

export function describeStripeRequirements(due: string[]): string | null {
  if (due.length === 0) return null;
  const words = Array.from(new Set(due.map((item) =>
    REQUIREMENT_WORDS.find(([pattern]) => pattern.test(item))?.[1] ?? "more information")));
  return `Stripe needs ${words.join(", ")}.`;
}
