# Kinetexa setup checklist

Prepared 6 September 2026. Historical setup handoff, now superseded where it conflicts with `docs/decisions.md`. The user has asked the agent to resume setup, has declined a Vercel upgrade, and wants a setup report before full implementation. Do not follow the Vercel Pro upgrade step below. Live setup status is recorded in `docs/delivery-status.md`.

The existing development setup is sufficient to continue coding. The remaining account work mainly prepares production sign-in, billing, maps and AI. A few integration settings need running code, so those are listed separately at the end.

## Already done

| Service | Current state | Your action |
| --- | --- | --- |
| Local project | `C:\Code\Kinetexa`, Git initialized; initial app and backend files exist | Keep this folder |
| GitHub | Public repository [StefanDG1/Kinetexa](https://github.com/StefanDG1/Kinetexa), initial foundation commit pushed | Nothing to create |
| Vercel | Project `kinetexa` exists and is linked to GitHub | Set up commercial billing below |
| Domain | `kinetexa.com` and `www.kinetexa.com` attached to Vercel | Check domain status below |
| Namecheap | Nameservers saved as `ns1.vercel-dns.com` and `ns2.vercel-dns.com`; public DNS now returns them | Do not change nameservers again |
| Convex | Project `kinetexa`; development deployment `earnest-gecko-916`; initial schema and authentication configuration deployed | Nothing needed to start coding |
| WorkOS | Kinetexa project created; staging credentials saved and localhost URLs configured | Finish production setup below |
| Cloudflare R2 | Private EU buckets `kinetexa-dev` and `kinetexa-prod`, separate bucket-scoped credentials saved | Nothing to recreate or make public |
| Stripe | Separate Romanian Kinetexa account created; onboarding unfinished, last seen in test mode | Finish activation and keys below |
| Resend | `kinetexa.com` added; DNS records added in Vercel; verification was pending; no Kinetexa API key created | Optional, free tier only |
| PostHog | Existing EU login available; no Kinetexa project created | Create a project below |
| AI and base maps | No Kinetexa credentials configured | Set up below |

There is no working hosted application yet. The new application files have not been pushed. Automatic deployments were disabled during setup to avoid deploying an incomplete app.

## 1. Save credentials locally

Use a text editor to open these existing files. They are excluded from Git.

- `C:\Code\Kinetexa\.env.local` for development and Stripe test credentials.
- `C:\Code\Kinetexa\.env.production.local` for production credentials.
- `C:\Code\Kinetexa\work\setup-notes.md` for completion notes and business information.

Keep the existing values. Add or replace the relevant `NAME=value` line, with one value per line and no duplicate names. Do not replace either whole file with the example file. Production R2 credentials are already saved.

Do not paste secrets into chat, the public repository, or this checklist. You only need to tell me which steps are done. I can read the local files and place each value in the correct deployment later. I will generate the production cookie secret.

## 2. Vercel hosting and domain

Open the [Kinetexa project](https://vercel.com/stefandg1s-projects/kinetexa).

1. Select team `stefandg1s-projects`, then open team **Settings > Billing**.
2. For the simplest setup, upgrade this existing team to **Pro**, with your single deploying seat. This is a team subscription shared by its projects. You do not need a second Vercel project or another domain.
3. Review the checkout total and add your company billing details. Pro currently starts at USD 20/month, with usage charges beyond its allowances. Commercial hosting requires Pro or Enterprise. [Pro pricing](https://vercel.com/docs/plans/pro-plan), [commercial-use rules](https://vercel.com/docs/limits/fair-use-guidelines).
4. In **Spend Management**, set an initial USD 50 usage alert. Use notification-only for this shared team so a Kinetexa limit does not pause your other sites. The alert is not a hard cap or a total invoice estimate.
5. Return to **Kinetexa > Settings > Domains**. Check that both domains show valid DNS configuration. Record any error in the private notes file. Do not move DNS back to Namecheap or Cloudflare.

All new DNS records, including WorkOS and email records, now belong in Vercel's DNS editor for `kinetexa.com`. Namecheap remains the registrar. An empty website or deployment error is expected until the app exists; DNS validity and application availability are separate checks.

Leave build commands, root directory and deployment switches for me. The intended app directory is `apps/web`.

## 3. WorkOS production sign-in

Open the [WorkOS dashboard](https://dashboard.workos.com), select project **Kinetexa**, then **Production**. Do not edit the Exponential Education or Vydero applications.

1. Add billing information if WorkOS asks you to unlock production. Select only the authentication features needed for Kinetexa; enterprise SSO and Directory Sync are unnecessary here.
2. Open **Applications**, select Kinetexa's application, and set these production values:

| Setting | Value |
| --- | --- |
| Application name | `Kinetexa` |
| Homepage | `https://kinetexa.com` |
| Redirect URI | `https://kinetexa.com/callback` |
| Initiate login URL | `https://kinetexa.com/sign-in` |
| Sign-out redirect | `https://kinetexa.com` |

3. Permit public signups and enable email/password authentication with email verification. Avoid an invitation-only or corporate-domain-only signup restriction.
4. Copy the **production client ID**, create a production API key named `Kinetexa production`, and save both:

```dotenv
WORKOS_CLIENT_ID=your_production_client_id
WORKOS_API_KEY=your_production_api_key
NEXT_PUBLIC_APP_URL=https://kinetexa.com
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://kinetexa.com/callback
```

5. Optionally configure **Domains > AuthKit domain** as `auth.kinetexa.com`. Add the exact CNAME WorkOS provides in Vercel DNS, then verify it. If this requires an unwanted paid add-on, keep the hosted AuthKit domain for launch and record that choice.

Leave staging's localhost configuration intact. Production has separate keys, users and settings. Google sign-in can be configured later if it requires a separate Google OAuth application. [Environment guide](https://workos.com/docs/authkit/environments), [custom domain guide](https://workos.com/docs/custom-domains/authkit).

## 4. Stripe business activation

Open the [new Kinetexa Stripe account](https://dashboard.stripe.com/acct_1UCUo9BtyFqbr9JK). Its account ID is `acct_1UCUo9BtyFqbr9JK`.

1. Finish the introductory wizard. It was last at the choice to enter a sandbox or get the live account. Testing uses sandbox/test mode; business verification belongs to the live account.
2. In the live account, choose **Activate account** or **Complete setup**.
3. Enter the existing company's exact registered details:
   - Legal entity: **Exponential Education SRL**, as shown on official records.
   - Country: **Romania**.
   - Customer-facing brand: **Kinetexa**.
   - Website: `https://kinetexa.com`.
   - Description: online training analytics software for runners and cyclists, with free access and optional monthly or annual subscriptions.
4. Complete representative, beneficial-owner, identity and payout-bank verification yourself. Reuse the company's valid details where applicable; a new account may still need its own checks.
5. Enter a monitored support email and an accurate statement descriptor, such as `KINETEXA` if accepted.
6. Keep ordinary subscription billing. **Managed Payments**, where Stripe becomes merchant of record, is unnecessary for the chosen setup.
7. Per your instruction, leave automatic tax collection off. Enter a VAT registration only if the company actually has one. This records your current configuration, not a determination of tax obligations.
8. If Stripe needs a working website or published policies, record the pending requirement. I will supply those pages after implementation, then you can finish that review.

Record whether payments and payouts are enabled, pending review, or awaiting information. [Stripe activation checklist](https://docs.stripe.com/get-started/account/checklist).

## 5. Stripe integration keys

You do not need to create payment links or manually subscribe yourself.

1. In the Kinetexa sandbox/test environment, open **Developers or Workbench > API keys**.
2. Create a restricted key named `Kinetexa development setup`. Grant the following resource permissions, using the closest matching names in Stripe's editor:

| Resource | Permission |
| --- | --- |
| Customers | Write |
| Products and prices | Write |
| Checkout Sessions | Write |
| Customer portal | Write |
| Subscriptions and invoices | Read |
| Webhook endpoints | Write |

3. Leave unrelated resources without access. Save the key as `STRIPE_SECRET_KEY` in `.env.local`. A restricted test key begins `rk_test_`.
4. Repeat in **live mode** with a key named `Kinetexa production setup`, saving it only in `.env.production.local`. It begins `rk_live_`.
5. Record the sandbox name and its account ID if Stripe created a separate sandbox account. Test keys and test catalog objects must belong to that same environment.

If Stripe's permission editor differs, record the missing permission name rather than granting every resource. I can identify the required scope during integration. Setup credentials will be narrowed or replaced with runtime credentials after catalog and webhook configuration. [Stripe API key guide](https://docs.stripe.com/keys).

I will create one **Kinetexa Premium** product with two recurring EUR prices, in both test and live environments:

- EUR 35 every month.
- EUR 180 every year, charged upfront.

The free plan will not require a card or a zero-price Stripe subscription. Catalog creation, portal rules and signed webhooks are implementation work, so you can leave their environment variables blank for now.

## 6. Maps

MapLibre draws the map, but we still need a licensed source for the background map tiles. I recommend MapTiler for the first release.

1. Create or sign in to [MapTiler Cloud](https://cloud.maptiler.com).
2. Create a key named `Kinetexa development`, allowing the HTTP origin `http://localhost:3000`.
3. Choose a standard outdoor map. Copy its **MapLibre style JSON URL**, including the key. Save it as `NEXT_PUBLIC_MAP_STYLE_URL` in `.env.local`.
4. Create a separate `Kinetexa production` key restricted to `https://kinetexa.com` and `https://www.kinetexa.com`. Save its style JSON URL under the same variable name in `.env.production.local`.
5. Free is suitable for development. Before public commercial launch, enable **Flex**, currently USD 30/month, and set a modest spending limit, initially USD 10 above the base subscription if the editor distinguishes extra usage. Read the displayed limit definition before saving.

MapTiler's free terms permit commercial research and development, but not the public commercial service. I will retain the required map attribution and configure preview origins during deployment. [Pricing](https://www.maptiler.com/cloud/pricing/), [terms](https://www.maptiler.com/terms/cloud/), [key restrictions](https://docs.maptiler.com/guides/maps-apis/maps-platform/how-to-protect-your-map-key/).

## 7. AI access through Vercel

This avoids creating another provider account before coding.

1. In your Vercel team, open **AI Gateway > API Keys**.
2. Create `Kinetexa development`. Enable **Spend Quota**, set USD 5, and choose monthly refresh.
3. Save it as `AI_GATEWAY_API_KEY` in `.env.local`.
4. Create a separate `Kinetexa production` key with an initial USD 20 monthly quota. Save it in `.env.production.local`.
5. Use available credits first. If credit purchase is required, start with the smallest useful prepaid amount shown. Leave automatic top-up off initially.

These quotas are my proposed starting limits. The request that crosses a quota may complete before later requests are blocked. I will choose the model after evaluating grounded answers, restrict data sent to it, and implement user consent and per-account limits. Leave `KINETEXA_AI_MODEL` blank for now. [Key budgets](https://vercel.com/changelog/budgets-for-api-keys-on-ai-gateway), [budget behavior](https://vercel.com/academy/ai-gateway/set-a-budget).

## 8. PostHog

1. Open [PostHog EU](https://eu.posthog.com).
2. Use project settings or the project selector to create **Kinetexa** in your existing organization.
3. In its project settings, copy the **project API key**, not a personal administration key.
4. Save these in `.env.production.local`:

```dotenv
NEXT_PUBLIC_POSTHOG_KEY=your_project_api_key
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

5. Keep session replay and automatic capture off wherever dashboard controls are offered. Use included/free capacity; no add-ons are needed. Leave local-development analytics unconfigured so test traffic stays out of production.

Do not run the installation wizard against the code. I will install explicit, consented events without activity titles, GPS coordinates or health measurements. [PostHog installation guide](https://posthog.com/docs/getting-started/install).

## 9. Resend, optional and free only

Resend currently advertises **3 domains, 3,000 emails/month and 100/day** on Free, so Kinetexa may fit alongside the existing domain. The account's actual quota remains the check. [Current pricing](https://resend.com/pricing).

1. Open the [existing Kinetexa domain](https://resend.com/domains/e62b9c5c-a972-40ee-857d-9e9ce3a182ab).
2. Check verification now that the nameserver change has propagated. The requested DNS records were already added in Vercel; do not create duplicates.
3. If it verifies on Free, create a **Sending access** API key scoped only to `kinetexa.com`.
4. Disable open and click tracking for Kinetexa messages.
5. Save `RESEND_API_KEY` in `.env.production.local` and set:

```dotenv
RESEND_FROM_EMAIL="Kinetexa <notifications@kinetexa.com>"
```

If any step requires an upgrade, stop this section and record **Resend deferred, free tier unavailable**. Keep the existing Exponential Education sender untouched. Authentication email comes through WorkOS's authentication flow; application notifications are a separate integration.

## 10. Business details and support

Fill in `C:\Code\Kinetexa\work\setup-notes.md` with the exact registered company name, registered address, company registration identifier, and the support/privacy contact email you want published. Bank and identity documents should stay in Stripe, not this file.

A working existing business inbox is enough initially. Use `support@kinetexa.com` only after you have configured a mailbox or forwarding with an email provider and checked receipt. Resend domain verification does not create a support inbox. Any mailbox provider's MX records must be added in Vercel DNS.

I will draft the site's policies from these details and the implemented behavior. You will need to review the business terms and any platform verification declarations before launch.

## What I will finish with the code

These items do not need manual setup now:

- Convex production deployment, production environment variables and deployment credentials. The current CLI login and project are already available.
- R2 upload permissions, CORS, signed object access and storage verification. Both buckets and scoped keys exist.
- Stripe products, prices, customer portal, test and live webhook endpoints, signature verification and entitlement tests.
- WorkOS callbacks tested against the running app, additional OAuth providers where needed, and account deletion integration.
- Vercel monorepo build configuration, environment separation, GitHub checks, deployments, HTTPS and redirects.
- AI model configuration, evaluations and limits; PostHog event consent.
- Optional Resend templates, bounce handling and delivery verification if Free works.
- Auth, import, analytics, map privacy, billing, export and deletion journeys.

Garmin approval remains an external dependency. No Garmin credentials are needed to start file imports. I will keep automatic Garmin connection unavailable until approval, and will not advertise it as working.

## When you are finished

Update the private notes file and send a message such as:

> Setup finished. Keys are in the local environment files. Stripe is [enabled/pending review]. WorkOS production is [ready/pending]. Resend is [free and verified/deferred]. These steps are still pending: [...].

Partial completion is useful. We can build while Stripe reviews the business or a DNS record verifies. No passwords, API keys or payment documents are needed in the message.
