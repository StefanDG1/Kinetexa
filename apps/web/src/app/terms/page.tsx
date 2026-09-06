import Link from "next/link";
export default function Terms() {
  return (
    <main className="holding" style={{ maxWidth: 850, paddingBlock: 48 }}>
      <Link href="/">Kinetexa</Link>
      <h1>Terms of service</h1>
      <p>Draft for pre-release review. Updated 6 September 2026.</p>
      <p>
        Kinetexa is a training analytics service operated by Exponential
        Education SRL, Str. N. Istrati nr. 6, 700460 Iași, Romania. Support:{" "}
        <a href="mailto:contact@exponentialeducation.ro">
          contact@exponentialeducation.ro
        </a>
        .
      </p>
      <h2>Your account and data</h2>
      <p>
        Use an account you control and upload only data you have the right to
        use. You retain rights to your activity data. You authorize the
        processing needed to store, analyze, export and display it according to
        your settings. Keep your login secure and do not attempt to access
        another athlete's private data.
      </p>
      <h2>Training information</h2>
      <p>
        Metrics and AI explanations depend on recorded sensors, configured
        thresholds and model assumptions. Kinetexa is not a medical diagnostic
        service. It does not diagnose conditions or prescribe treatment. Use
        professional advice for medical concerns.
      </p>
      <h2>Free and Premium</h2>
      <p>
        Core personal analytics are available on Free. Premium is EUR 35 per
        month or EUR 180 per year, charged upfront for each billing period.
        Subscriptions renew until canceled. Stripe handles payment details. You
        can manage payment methods and cancel through the customer portal.
        Cancellation at the end of a paid period preserves access until that
        period ends. Downgrading does not delete your canonical training
        history.
      </p>
      <h2>Imports and third-party services</h2>
      <p>
        Resource limits protect service availability. Current limits are 32 MiB
        per activity file and 128 MiB per archive, with archive expansion and
        entry limits. File imports remain independent of provider access. Garmin
        connection is unavailable pending approval. Third-party availability and
        terms may change.
      </p>
      <h2>Open source and leaving</h2>
      <p>
        The personal core is published under AGPL-3.0-only. Hosted subscriptions
        provide managed services. You can export your records and request
        deletion in Settings. Public shares are your explicit choice and can be
        revoked.
      </p>
      <h2>Before public release</h2>
      <p>
        The final consumer cancellation/withdrawal terms, refund handling,
        liability language and business disclosures require the recorded
        business and legal review. This draft does not waive statutory consumer
        rights. Public registration remains closed while release gates are
        pending.
      </p>
    </main>
  );
}
