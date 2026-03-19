import { Link } from "react-router-dom";

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
    <div className="min-h-screen bg-[#09090b] text-white antialiased">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <span className="font-semibold text-[15px] tracking-tight">MailStride</span>
          </Link>
          <div className="flex items-center gap-2">
            <a href="/docs" className="hidden sm:inline-flex px-3 py-1.5 text-[13px] text-zinc-400 hover:text-white transition-colors">
              API Docs
            </a>
            <Link to="/login" className="px-3 py-1.5 text-[13px] text-zinc-400 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link
              to="/register"
              className="px-4 py-1.5 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-zinc-200 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[400px] h-[400px] bg-indigo-500/8 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[13px] text-zinc-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Self-hosted &middot; Open source &middot; Full control
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            The email platform
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              built for developers
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Send transactional emails, verify domains, track delivery — all through
            a powerful API or SMTP relay. Self-hosted, no vendor lock-in.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-6 py-3 text-[15px] font-medium rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/20 transition-all hover:shadow-violet-500/30"
            >
              Start for free
              <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <a
              href="/docs"
              className="inline-flex items-center justify-center px-6 py-3 text-[15px] font-medium rounded-xl border border-white/[0.08] text-zinc-300 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
            >
              View documentation
            </a>
          </div>
        </div>
      </section>

      {/* Code block */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
              <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
              <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
            </div>
            <span className="text-[11px] text-zinc-500 ml-2 font-mono">Send your first email</span>
          </div>
          <pre className="p-5 text-[13px] leading-relaxed overflow-x-auto"><code>{`<span style="color:#a78bfa">curl</span> <span style="color:#67e8f9">-X POST</span> https://api.yourdomain.com/v1/emails \\
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
      <section className="border-y border-white/[0.06] bg-white/[0.01] py-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">{s.value}</div>
                <div className="text-sm text-zinc-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Everything you need to send email</h2>
          <p className="text-zinc-400 max-w-xl mx-auto text-lg">
            A complete, production-ready email infrastructure you own and control.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/10 flex items-center justify-center text-violet-400 mb-4 group-hover:border-violet-500/20 transition-colors">
                {f.icon}
              </div>
              <h3 className="font-semibold text-[15px] mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="relative rounded-3xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.07] to-indigo-500/[0.04] p-12 sm:p-16 text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Ready to start sending?</h2>
            <p className="text-zinc-400 max-w-md mx-auto mb-8 text-lg">
              Create your account in seconds. No credit card required.
            </p>
            <Link
              to="/register"
              className="inline-flex items-center px-8 py-3.5 text-[15px] font-medium rounded-xl bg-white text-black hover:bg-zinc-200 transition-colors shadow-lg"
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
      <footer className="border-t border-white/[0.06] py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-zinc-500">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            MailStride
          </div>
          <div className="flex gap-6">
            <a href="/docs" className="hover:text-zinc-300 transition-colors">API Docs</a>
            <a href="/health" className="hover:text-zinc-300 transition-colors">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
