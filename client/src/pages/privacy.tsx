import Navigation from "@/components/navigation";
import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";

/**
 * Placeholder Privacy Policy page.
 *
 * The mandatory consent checkboxes on account creation, the Event Builder, and
 * the Venue Builder all link here, so this route has to resolve rather than
 * 404. Replace the placeholder body below with the finalised policy text the
 * moment Legal supplies it — the route, links, and layout stay as they are.
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <header className="mb-10 border-b border-gray-200 pb-8 dark:border-gray-700" data-testid="privacy-header">
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-gray-900 dark:text-white md:text-5xl">
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            How Great Lifestyle B.V. handles your personal data.
          </p>
        </header>

        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950"
          data-testid="privacy-placeholder-notice"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <p className="mb-1 font-medium text-amber-900 dark:text-amber-100">
                Our full Privacy Policy is being finalised
              </p>
              <p className="text-amber-800 dark:text-amber-200">
                We are publishing the complete text here shortly. In the meantime, the summary below explains how we
                handle your data, and you can reach us at any time with questions or a data request.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 space-y-4 text-[15px] leading-7 text-gray-600 dark:text-gray-300">
          <p>
            We are Great Lifestyle B.V., doing business as Great App, a company registered in the Netherlands at
            Rietgors 6, IJsselstein, Utrecht 3403ZJ. We are the controller of the personal data you provide when you use
            the Great App website and mobile application (the 'Services').
          </p>

          <h2 className="!mt-10 text-xl font-bold uppercase tracking-tight text-gray-900 dark:text-white">
            What we collect
          </h2>
          <p>
            We collect the account details you give us (such as your name, email address, and the role you sign up
            under), the content you publish on the Services (such as experiences, venue listings, photos, and messages),
            and the transaction details needed to process bookings and revenue splits. Payments are processed by Stripe;
            we do not store your full card details.
          </p>

          <h2 className="!mt-10 text-xl font-bold uppercase tracking-tight text-gray-900 dark:text-white">
            Why we use it
          </h2>
          <p>
            We use your data to operate your account, deliver and support the Services, process ticket sales and
            payouts, keep the platform secure, and send you service messages about bookings and experiences you are
            involved in. You can manage marketing and notification preferences from your{" "}
            <Link href="/email-preferences" className="font-medium text-primary underline underline-offset-4">
              email preferences
            </Link>{" "}
            page.
          </p>

          <h2 className="!mt-10 text-xl font-bold uppercase tracking-tight text-gray-900 dark:text-white">
            Where it is held
          </h2>
          <p>
            The Services are hosted in the Netherlands. If you access the Services from another region, you are
            transferring your data to the Netherlands, where it is processed under Dutch and EU law, including the
            GDPR.
          </p>

          <h2 className="!mt-10 text-xl font-bold uppercase tracking-tight text-gray-900 dark:text-white">
            Your rights
          </h2>
          <p>
            Under the GDPR you can request access to, correction of, or deletion of your personal data, object to
            certain processing, and request a copy of your data in a portable format. To exercise any of these rights,
            email us at{" "}
            <a href="mailto:hello@greatexperiences.ai" className="font-medium text-primary underline underline-offset-4">
              hello@greatexperiences.ai
            </a>
            .
          </p>

          <h2 className="!mt-10 text-xl font-bold uppercase tracking-tight text-gray-900 dark:text-white">Contact us</h2>
          <address className="not-italic leading-7">
            Great Lifestyle B.V.
            <br />
            Rietgors 6
            <br />
            IJsselstein, Utrecht 3403ZJ
            <br />
            Netherlands
            <br />
            <a href="mailto:hello@greatexperiences.ai" className="font-medium text-primary underline underline-offset-4">
              hello@greatexperiences.ai
            </a>
          </address>

          <p className="!mt-10 border-t border-gray-200 pt-6 text-sm dark:border-gray-700">
            This policy sits alongside our{" "}
            <Link href="/terms" className="font-medium text-primary underline underline-offset-4">
              Terms and Conditions
            </Link>
            , which govern your use of the Services.
          </p>
        </div>
      </div>
    </div>
  );
}
