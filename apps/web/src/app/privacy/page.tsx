import Link from "next/link";
export default function Privacy() {
  return (
    <main className="holding" style={{ maxWidth: 850, paddingBlock: 48 }}>
      <Link href="/">Kinetexa</Link>
      <h1>Privacy policy</h1>
      <p>Draft for pre-release review. Updated 6 September 2026.</p>
      <p>
        Kinetexa is operated by Exponential Education SRL, Str. N. Istrati nr.
        6, 700460 Iași, Romania. Contact{" "}
        <a href="mailto:contact@exponentialeducation.ro">
          contact@exponentialeducation.ro
        </a>{" "}
        for privacy questions or requests.
      </p>
      <h2>Your training data</h2>
      <p>
        We process your account details, uploaded activity files, recorded
        routes, sensor measurements, training settings, goals, equipment, saved
        analyses and any optional AI conversations to provide the features you
        request. Activities and routes are private by default. Original files
        are preserved so you can export them and reproduce calculations.
      </p>
      <h2>Optional processing</h2>
      <p>
        AI processing requires separate consent. If enabled, relevant structured
        summaries and your question are sent through Vercel AI Gateway to the
        configured model provider. Exact route geometry and raw health histories
        are excluded from default context. Turning AI off prevents new requests.
        Product usage analytics require a separate choice and exclude precise
        location, sensor values, activity titles and question text.
      </p>
      <h2>Service providers</h2>
      <p>
        WorkOS provides authentication; Convex stores application data and runs
        jobs; Cloudflare R2 stores private originals and exports; Vercel hosts
        the website and AI Gateway; Stripe processes subscriptions; Resend
        delivers application email where configured; PostHog provides optional
        usage analytics. OpenFreeMap supplies background maps, and receives
        ordinary map requests including IP address and viewed map areas. These
        services may process data in their contracted regions or transfer it
        under their applicable safeguards.
      </p>
      <h2>Sharing</h2>
      <p>
        A public link exposes only the fields you select. Shared routes have
        privacy zones and endpoint trimming applied on the server. Anyone with a
        link can copy its visible contents. Revoking it stops future access
        through Kinetexa but cannot retrieve copies someone already saved.
      </p>
      <h2>Export, deletion and retention</h2>
      <p>
        You can request an export in Settings, including canonical records and
        original uploads. Account deletion locks access immediately and begins
        permanent removal after 15 minutes. It covers application data, raw
        objects, AI conversations and share links, and cancels subscriptions.
        Stripe may retain accounting records as legally required. Backup
        retention and the final operational retention schedule must be confirmed
        before public release.
      </p>
      <h2>Your rights</h2>
      <p>
        You can request access, correction, deletion, portability, restriction
        or objection where applicable, and withdraw optional consent in
        Settings. You may complain to the competent data protection authority.
        We do not sell your training data or use it for advertising.
      </p>
      <p>
        This draft must receive the recorded business and legal review before
        launch. Public registration remains closed while the release gates are
        pending.
      </p>
    </main>
  );
}
