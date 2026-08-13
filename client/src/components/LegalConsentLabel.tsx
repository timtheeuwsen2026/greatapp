/**
 * The single source of truth for the mandatory consent wording used by the
 * account creation, Event Builder, and Venue Builder flows. Keeping the
 * sentence and both links here means a change to the legal copy or to where
 * the policies live only has to happen once.
 */
export default function LegalConsentLabel() {
  return (
    <>
      I agree to the{" "}
      <a
        href="/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4"
        data-testid="link-terms"
      >
        Terms and Conditions
      </a>{" "}
      and{" "}
      <a
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4"
        data-testid="link-privacy"
      >
        Privacy Policy
      </a>
    </>
  );
}
