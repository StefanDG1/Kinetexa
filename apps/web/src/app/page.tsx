export default function SetupPage() {
  return (
    <main className="holding">
      <header className="masthead">
        <a href="/" aria-label="Kinetexa home">
          kinetexa<span aria-hidden="true">/</span>
        </a>
        <span className="status">In development</span>
      </header>
      <section className="intro">
        <h1>
          Your training,
          <br />
          understood.
        </h1>
        <p>
          A private place for your activities, training history and maps. Built
          for runners and cyclists who want to understand the work they put in.
        </p>
        <p className="notice">
          We’re building Kinetexa. Signups and subscriptions will open after the
          app is ready.
        </p>
        <a className="source-link" href="https://github.com/StefanDG1/Kinetexa">
          Follow the build on GitHub
        </a>
      </section>
      <section className="plans" aria-labelledby="plans-title">
        <div>
          <h2 id="plans-title">Planned membership</h2>
          <p>
            Core personal analytics will be free. Premium adds managed services
            and higher usage allowances.
          </p>
        </div>
        <div className="plan">
          <h3>Free</h3>
          <p className="price">€0</p>
          <p>No payment card required.</p>
        </div>
        <div className="plan">
          <h3>Premium</h3>
          <p className="price">
            €35 <span>/ month</span>
          </p>
          <p>
            Or €180 per year, paid annually.
            <br />
            Subscriptions are not yet available.
          </p>
        </div>
      </section>
      <footer>
        <span>A product of Exponential Education S.R.L., Romania.</span>
        <a href="https://github.com/StefanDG1/Kinetexa/blob/main/LICENSE">
          Open source under AGPL-3.0
        </a>
      </footer>
    </main>
  );
}
