import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Terms of Service · Marne",
  description: "The terms for using Marne, a free calibration journal.",
};

const CONTACT = "demouser4132+privacy@gmail.com";

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">
      {CONTACT}
    </a>
  );
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 24, 2026">
      <p>
        By using Marne you agree to these terms. If you don&apos;t agree, please don&apos;t use it.
        Marne is a free, non-commercial personal project operated by an individual.
      </p>

      <LegalSection heading="What Marne is — and isn't">
        <p>
          Marne is a tool for logging real-life predictions, resolving them when the date arrives,
          and tracking how well-calibrated your confidence is over time. It is a self-reflection and
          journaling tool. It is{" "}
          <span className="text-ink">
            not financial, investment, medical, legal, psychological, or other professional advice
          </span>
          , and nothing it shows you — including AI-generated insights and post-mortems — should be
          relied on as such. The decisions you make are your own.
        </p>
      </LegalSection>

      <LegalSection heading="Eligibility">
        <p>You must be at least 16 years old to use Marne.</p>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          You keep ownership of everything you write, and you&apos;re responsible for what you log. By
          using Marne you give us permission to store and process your content in order to operate the
          app, including sharing limited data with the service providers described in our{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          . You agree not to log content that is unlawful or that you don&apos;t have the right to
          submit.
        </p>
      </LegalSection>

      <LegalSection heading="AI-generated content">
        <p>
          Marne uses AI to narrate patterns in your own data. Your calibration scores are calculated
          by deterministic code, but AI-written insights and post-mortems can be incomplete or wrong.
          Treat them as prompts for reflection, not as facts or advice.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Don&apos;t attempt to access other users&apos; data, disrupt or reverse-engineer the
          service, or use it to break the law. We may suspend or remove access that does.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          Marne is provided free of charge, &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; We may
          change, suspend, or discontinue any part of it at any time, and we don&apos;t guarantee it
          will be uninterrupted, error-free, or that your data will never be lost — please keep your
          own records of anything important.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty">
        <p>
          To the fullest extent permitted by law, Marne is provided without warranties of any kind,
          whether express or implied, including warranties of merchantability, fitness for a
          particular purpose, accuracy, and non-infringement.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, the operator of Marne will not be liable for any
          indirect, incidental, special, or consequential damages, or for any loss of data, profits,
          or goodwill, arising out of or relating to your use of (or inability to use) Marne. Because
          Marne is provided free of charge, our total liability to you for any claim is limited to
          zero.
        </p>
      </LegalSection>

      <LegalSection heading="Deleting your account">
        <p>
          You can delete your account and all associated data at any time from Account → Delete
          account. This is permanent and irreversible.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these terms; material changes will be reflected on this page with a new
          &ldquo;last updated&rdquo; date. Continuing to use Marne after a change means you accept the
          updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms: <Mail />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
