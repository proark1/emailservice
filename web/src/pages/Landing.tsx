import { Link } from "react-router-dom";

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "For side projects and testing",
    cta: "Get Started",
    ctaLink: "/register",
    popular: false,
    features: [
      "100 emails/day",
      "1 domain",
      "API access",
      "Open & click tracking",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    description: "For growing products and teams",
    cta: "Start Free Trial",
    ctaLink: "/register",
    popular: true,
    features: [
      "10,000 emails/day",
      "Unlimited domains",
      "Templates & broadcasts",
      "Domain warmup",
      "Audience management",
      "Webhooks & analytics",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For high-volume senders",
    cta: "Contact Sales",
    ctaLink: "mailto:sales@mailnowapi.com",
    popular: false,
    features: [
      "Unlimited emails",
      "Unlimited everything",
      "Dedicated IP",
      "99.99% uptime SLA",
      "Custom integration",
      "Dedicated support engineer",
      "SSO & audit logs",
    ],
  },
];

const trustSignals = [
  {
    title: "Self-hosted",
    desc: "Full control of your data. Deploy on your own infrastructure — no third-party access to your emails.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7" />
      </svg>
    ),
  },
  {
    title: "Open Source",
    desc: "Inspect and modify the code. No black boxes, no surprises — full transparency in how your emails are handled.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    title: "MCP Native",
    desc: "Built for AI agents from day one. 49 MCP tools let your AI assistants manage email infrastructure directly.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
  },
];

const features = [
  {
    title: "Transactional Email API",
    desc: "Send emails with a single API call. Full support for HTML, plain text, attachments, CC/BCC, and custom headers.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    title: "SMTP Relay",
    desc: "Connect any mail client or server. Native SMTP support with STARTTLS on port 587 and implicit TLS on 465.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: "Domain Verification",
    desc: "Auto-generated SPF, DKIM, and DMARC records. One-click verification with real-time DNS polling.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: "Webhooks",
    desc: "Real-time event delivery for sent, delivered, bounced, opened, and clicked. HMAC-signed payloads with retry logic.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
  },
  {
    title: "Delivery Analytics",
    desc: "Open and click tracking with pixel injection and link rewriting. Bounce rates, complaint tracking, and more.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: "Inbound Email & Inbox",
    desc: "Receive emails on your domains with a built-in inbox. Star, archive, reply — all from the dashboard or API.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
      </svg>
    ),
  },
  {
    title: "Broadcasts & Campaigns",
    desc: "Send to entire audiences with one click. Track delivery stats, open rates, and failures per campaign.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
      </svg>
    ),
  },
  {
    title: "Audience Management",
    desc: "Contact lists, audience segments, and automatic suppression handling for bounces and complaints.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
];

const stats = [
  { value: "10M+", label: "Emails / month" },
  { value: "<200ms", label: "API latency" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "100%", label: "Open source" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <span className="font-semibold text-[15px] tracking-tight">MailNowAPI</span>
          </Link>
          <div className="flex items-center gap-2">
            <a href="/docs" className="hidden sm:inline-flex px-3 py-1.5 text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
              API Docs
            </a>
            <Link to="/login" className="px-3 py-1.5 text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              to="/register"
              className="px-4 py-1.5 text-[13px] font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Animated gradient background */}
      <style>{`
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .hero-gradient {
          background: linear-gradient(135deg, #f5f3ff 0%, #eef2ff 25%, #ecfeff 50%, #eef2ff 75%, #f5f3ff 100%);
          background-size: 400% 400%;
          animation: gradient-shift 15s ease infinite;
        }
      `}</style>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden hero-gradient">
        {/* Gradient orbs */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-100 rounded-full blur-[120px] pointer-events-none opacity-60" />
        <div className="absolute top-40 left-1/4 w-[400px] h-[400px] bg-indigo-100 rounded-full blur-[100px] pointer-events-none opacity-40" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-gray-200 bg-white text-[13px] text-gray-500 mb-4 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Self-hosted &middot; Open source &middot; Full control
          </div>
          <p className="text-[13px] text-gray-400 mb-8">Used by 2,000+ developers worldwide</p>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            The email platform
            <br />
            <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 bg-clip-text text-transparent">
              built for developers
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Send and receive emails through your own domains. Transactional API,
            SMTP relay, inbound inbox — self-hosted, no vendor lock-in.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-6 py-3 text-[15px] font-medium rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-all"
            >
              Start for free
              <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <a
              href="/docs"
              className="inline-flex items-center justify-center px-6 py-3 text-[15px] font-medium rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-all"
            >
              View documentation
            </a>
          </div>
        </div>
      </section>

      {/* Code block */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <div className="rounded-2xl border border-gray-200 bg-gray-900 overflow-hidden shadow-xl">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-800 bg-gray-900">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <span className="text-[11px] text-gray-500 ml-2 font-mono">Send your first email</span>
          </div>
          <pre className="p-5 text-[13px] leading-relaxed overflow-x-auto text-gray-300"><code>{`<span style="color:#a78bfa">curl</span> <span style="color:#67e8f9">-X POST</span> https://api.yourdomain.com/v1/emails \\
  <span style="color:#67e8f9">-H</span> <span style="color:#fbbf24">"Authorization: Bearer es_your_api_key"</span> \\
  <span style="color:#67e8f9">-H</span> <span style="color:#fbbf24">"Content-Type: application/json"</span> \\
  <span style="color:#67e8f9">-d</span> <span style="color:#fbbf24">'{
    "from": "hello@yourdomain.com",
    "to": ["user@example.com"],
    "subject": "Welcome aboard!",
    "html": "&lt;h1&gt;Welcome!&lt;/h1&gt;&lt;p&gt;Thanks for joining.&lt;/p&gt;"
  }'</span>`}</code></pre>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-200 bg-gray-50 py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-b from-gray-900 to-gray-500 bg-clip-text text-transparent">{s.value}</div>
                <div className="text-sm text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Built for developers</h2>
          <p className="text-gray-500 max-w-xl mx-auto text-lg">
            No vendor lock-in. No black boxes. Your infrastructure, your rules.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {trustSignals.map((t) => (
            <div key={t.title} className="text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 mx-auto mb-5">
                {t.icon}
              </div>
              <h3 className="font-semibold text-lg mb-2">{t.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 pt-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Everything you need to send email</h2>
          <p className="text-gray-500 max-w-xl mx-auto text-lg">
            A complete, production-ready email infrastructure you own and control.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative p-6 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm hover:shadow-md transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 mb-4 group-hover:bg-violet-100 transition-colors">
                {f.icon}
              </div>
              <h3 className="font-semibold text-[15px] mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="border-y border-gray-200 bg-gray-50 py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-500 max-w-xl mx-auto text-lg">
              Start free, scale as you grow. No hidden fees.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl p-8 bg-white shadow-sm transition-all duration-300 hover:shadow-md ${
                  tier.popular
                    ? "border-2 border-violet-500 ring-1 ring-violet-500/20"
                    : "border border-gray-200"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-violet-600 text-white shadow-sm">
                      Popular
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="font-semibold text-lg mb-1">{tier.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{tier.description}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
                    {tier.period && <span className="text-gray-500 text-sm">{tier.period}</span>}
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                {tier.ctaLink.startsWith("mailto:") ? (
                  <a
                    href={tier.ctaLink}
                    className={`block w-full text-center px-6 py-2.5 text-[14px] font-medium rounded-xl transition-colors ${
                      tier.popular
                        ? "bg-violet-600 text-white hover:bg-violet-700"
                        : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Link
                    to={tier.ctaLink}
                    className={`block w-full text-center px-6 py-2.5 text-[14px] font-medium rounded-xl transition-colors ${
                      tier.popular
                        ? "bg-violet-600 text-white hover:bg-violet-700"
                        : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-24">
        <div className="relative rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-12 sm:p-16 text-center overflow-hidden">
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Ready to start sending?</h2>
            <p className="text-gray-500 max-w-md mx-auto mb-8 text-lg">
              Create your account in seconds. No credit card required.
            </p>
            <Link
              to="/register"
              className="inline-flex items-center px-8 py-3.5 text-[15px] font-medium rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow-sm"
            >
              Create free account
              <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Pricing</a></li>
                <li><a href="/docs" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Documentation</a></li>
                <li><a href="/docs" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">API Reference</a></li>
              </ul>
            </div>
            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-3">
                <li><a href="/about" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">About</a></li>
                <li><a href="/blog" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Blog</a></li>
                <li><a href="/health" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Status</a></li>
              </ul>
            </div>
            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Legal</h4>
              <ul className="space-y-3">
                <li><a href="/privacy" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Terms of Service</a></li>
              </ul>
            </div>
            {/* Connect */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Connect</h4>
              <ul className="space-y-3">
                <li>
                  <a href="https://github.com/mailnowapi" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="https://x.com/mailnowapi" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                    X / Twitter
                  </a>
                </li>
              </ul>
            </div>
          </div>
          {/* Copyright */}
          <div className="pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-900">MailNowAPI</span>
            </div>
            <p className="text-[13px] text-gray-400">&copy; {new Date().getFullYear()} MailNowAPI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
