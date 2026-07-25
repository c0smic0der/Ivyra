import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Privacy Policy · Marne",
  description: "What Marne collects, where it's stored, and who processes it.",
};

const CONTACT = "demouser4132+privacy@gmail.com";

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">
      {CONTACT}
    </a>
  );
}

function Ext({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
      {children}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 24, 2026">
      <p>
        Marne is a free, non-commercial personal project operated by an individual. This policy
        explains what data Marne collects, where it&apos;s stored, who processes it, and the choices
        you have. It describes what the app actually does today — if that changes, this page changes
        with it. Questions: <Mail />.
      </p>

      <LegalSection heading="What we collect">
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <span className="text-ink">Your email address</span> — used to sign you in (via a magic
            link) and to send you prediction reminders. It&apos;s the only contact detail we hold.
          </li>
          <li>
            <span className="text-ink">What you write</span> — the text of your predictions, the
            reasoning and plans you record, your confidence and resolution dates, and the notes you
            add when you resolve a prediction.
          </li>
          <li>
            <span className="text-ink">Data we derive from that</span> — a category and
            reasoning-type label, your calibration scores (computed by our own code, never by AI),
            AI-written post-mortems and insights, and aggregate statistics such as how many
            predictions you&apos;ve resolved.
          </li>
          <li>
            <span className="text-ink">Basic technical data</span> — standard server request
            information such as IP address and timestamps, processed by our hosting provider.
          </li>
        </ul>
        <p>
          Marne is free, so we don&apos;t collect payment details, and we don&apos;t use third-party
          advertising or analytics trackers.
        </p>
      </LegalSection>

      <LegalSection heading="Where your data is stored">
        <p>
          Your account and everything you log are stored in a PostgreSQL database hosted by Supabase
          in Amazon Web Services&apos; US West region (Oregon, <span className="text-ink">us-west-2</span>),
          in the United States. Access is restricted, and database-level row security scopes each
          user&apos;s rows to their own account.
        </p>
      </LegalSection>

      <LegalSection heading="Who processes your data">
        <p>
          To run the app we share limited data with a few service providers. They process it only to
          provide their service to us. We do not sell your data, and we do not permit these providers
          to use it to train AI models.
        </p>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <span className="text-ink">Anthropic (Claude)</span> — AI narration. When you request a
            post-mortem or an insight, or when a new prediction is automatically categorized, the
            text of the relevant prediction(s), your reasoning, plans, and outcome notes are sent to
            Anthropic&apos;s API to generate the response. For a post-mortem or insight this can
            include related past predictions of yours, used as context. Your email address is never
            sent. Under Anthropic&apos;s API terms, data submitted through the API is not used to
            train its models.{" "}
            <Ext href="https://www.anthropic.com/legal/privacy">Anthropic&apos;s privacy policy</Ext>.
          </li>
          <li>
            <span className="text-ink">Resend</span> — email delivery. We use Resend to send your
            prediction reminder emails. Because a reminder lists the predictions that are due, Resend
            receives your email address and the text of those predictions.{" "}
            <Ext href="https://resend.com/legal/privacy-policy">Resend&apos;s privacy policy</Ext>.
          </li>
          <li>
            <span className="text-ink">Supabase</span> — database and authentication. Beyond storing
            your data (above), Supabase&apos;s authentication service sends your magic-link sign-in
            emails, which requires your email address.{" "}
            <Ext href="https://supabase.com/privacy">Supabase&apos;s privacy policy</Ext>.
          </li>
          <li>
            <span className="text-ink">Vercel</span> — hosting. Vercel runs the app and processes
            standard request logs such as IP address and timestamps.{" "}
            <Ext href="https://vercel.com/legal/privacy-policy">Vercel&apos;s privacy policy</Ext>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="What's in our logs">
        <p>
          Our application logs deliberately exclude your content and identity: they record error
          types and counts only — never the text of your predictions and never your email address.
          Prediction content never appears in web addresses. Our hosting and database providers keep
          their own standard operational logs.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          We keep your data for as long as your account exists. We don&apos;t automatically delete or
          expire it. When you delete your account, your data is removed (see below).
        </p>
      </LegalSection>

      <LegalSection heading="Your choices and rights">
        <p>Wherever you live, you can:</p>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <span className="text-ink">Access your data</span> — view your predictions, resolutions,
            scores, and insights in the app at any time.
          </li>
          <li>
            <span className="text-ink">Get a copy</span> — email <Mail /> to request an export of
            your data.
          </li>
          <li>
            <span className="text-ink">Delete everything</span> — go to Account → Delete account, or
            email us. Deleting your account permanently removes every prediction, resolution, AI
            insight, post-mortem, and statistic tied to it, along with your sign-in. It is immediate
            and cannot be undone.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          Marne isn&apos;t intended for anyone under 16. Please don&apos;t use it if you&apos;re
          younger (see our Terms).
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          If we change what we collect or who processes it, we&apos;ll update this page and its
          &ldquo;last updated&rdquo; date so it keeps matching what the app actually does.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy or your data: <Mail />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
