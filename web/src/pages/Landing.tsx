import { Link } from "react-router-dom";

const features = [
  { title: "Email API", desc: "Send transactional emails with a simple REST API. HTML, text, attachments, and more.", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { title: "SMTP Relay", desc: "Native SMTP support on ports 587/465. Connect any email client or server.", icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" },
  { title: "Domain Verification", desc: "Automatic SPF, DKIM, and DMARC record generation. One-click DNS verification.", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { title: "Webhooks", desc: "Real-time event notifications for delivery, bounces, opens, clicks, and more.", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { title: "Analytics", desc: "Track open rates, click-through rates, bounce rates, and delivery metrics.", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { title: "Audience Management", desc: "Manage contacts, audiences, and suppression lists. Unsubscribe handling built in.", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-sm">MS</div>
            <span className="font-semibold text-lg">MailStride</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/docs" className="text-sm text-gray-400 hover:text-white transition">API Docs</a>
            <Link to="/login" className="text-sm text-gray-400 hover:text-white transition">Sign in</Link>
            <Link to="/register" className="text-sm bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg transition">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-sm font-medium mb-6 border border-indigo-500/20">
          Self-hosted email infrastructure
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          Email for developers
          <br />
          <span className="text-indigo-400">that just works</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          The complete email platform. Send transactional emails, manage domains,
          track delivery — all through a simple API or SMTP. Self-hosted, open source.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/register" className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3 rounded-lg text-lg font-medium transition">
            Start Sending
          </Link>
          <a href="/docs" className="border border-gray-700 hover:border-gray-500 text-gray-300 px-8 py-3 rounded-lg text-lg font-medium transition">
            View API Docs
          </a>
        </div>
      </section>

      {/* Code example */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
            <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
            <span className="text-xs text-gray-500 ml-2">Send your first email</span>
          </div>
          <pre className="p-6 text-sm overflow-x-auto"><code className="text-gray-300">{`curl -X POST https://your-domain.com/v1/emails \\
  -H "Authorization: Bearer es_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "hello@yourdomain.com",
    "to": ["user@example.com"],
    "subject": "Welcome!",
    "html": "<h1>Hello World</h1>"
  }'`}</code></pre>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-3xl font-bold text-center mb-4">Everything you need</h2>
        <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">A complete email infrastructure platform with all the tools to send, receive, and manage email at scale.</p>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition">
              <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={f.icon} />
                </svg>
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <span>MailStride — Self-hosted email service</span>
          <div className="flex gap-6">
            <a href="/docs" className="hover:text-gray-300 transition">API Docs</a>
            <a href="/health" className="hover:text-gray-300 transition">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
