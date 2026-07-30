import { ArrowRight, Mail, MapPin, Clock, MessageSquare } from 'lucide-react';
import { LinkedinIcon } from '../../components/marketing/Footer';
import { useState } from 'react';
import { TopNav } from '../../components/marketing/TopNav';
import { Footer } from '../../components/marketing/Footer';

function nav(hash: string) { window.location.href = hash; }

export function ContactPage({ currentHash }: { currentHash: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // In production: call edge function to send email
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-white">
      <TopNav currentHash={currentHash} />

      <section className="bg-gradient-to-b from-primary-50 to-white pt-28 pb-14 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Get in Touch</p>
          <h1 className="text-5xl font-extrabold text-slate-900 mb-4">Let's talk</h1>
          <p className="text-lg text-slate-500">Whether you want a demo, have a question, or just want to know if LLND Automate is right for your RTO — we'd love to hear from you.</p>
        </div>
      </section>

      <section className="py-16 px-4 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Contact form */}
          <div>
            {sent ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-success-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Message sent!</h2>
                <p className="text-slate-500 max-w-xs">Thanks for reaching out. We'll be in touch within one business day.</p>
                <button onClick={() => nav('#/')} className="mt-4 text-primary-600 font-semibold hover:text-primary-800 flex items-center gap-1">
                  Back to home <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h2 className="text-2xl font-extrabold text-slate-900 mb-6">Send us a message</h2>
                {[
                  { label: 'Full Name', value: name, setter: setName, type: 'text', placeholder: 'Jane Smith', required: true },
                  { label: 'Work Email', value: email, setter: setEmail, type: 'email', placeholder: 'jane@yourrto.edu.au', required: true },
                  { label: 'Organisation', value: org, setter: setOrg, type: 'text', placeholder: 'Your RTO name', required: false },
                ].map(({ label, value, setter, type, placeholder, required }) => (
                  <div key={label}>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</label>
                    <input
                      type={type} value={value} onChange={(e) => setter(e.target.value)}
                      placeholder={placeholder} required={required}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Message <span className="text-rose-500">*</span></label>
                  <textarea
                    value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your RTO and what you need..."
                    rows={5} required
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-slate-400 resize-none"
                  />
                </div>
                <button type="submit" className="w-full py-3.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-md inline-flex items-center justify-center gap-2">
                  Send Message <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            )}
          </div>

          {/* Contact info */}
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-6">Other ways to reach us</h2>
              <div className="space-y-4">
                {[
                  { icon: Mail, label: 'Email', value: 'hello@llnd.com.au', href: 'mailto:hello@llnd.com.au' },
                  { icon: LinkedinIcon, label: 'LinkedIn', value: 'linkedin.com/company/llnd', href: 'https://linkedin.com' },
                  { icon: MapPin, label: 'Location', value: 'Australia (Remote-first)', href: null },
                  { icon: Clock, label: 'Response time', value: 'Within 1 business day', href: null },
                ].map(({ icon: Icon, label, value, href }) => (
                  <div key={label} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                    <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">{label}</p>
                      {href ? (
                        <a href={href} className="text-sm font-semibold text-primary-600 hover:text-primary-800">{value}</a>
                      ) : (
                        <p className="text-sm font-semibold text-slate-800">{value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-primary-50 border border-primary-100 rounded-2xl p-6">
              <h3 className="font-bold text-slate-900 mb-2">Want a live demo?</h3>
              <p className="text-sm text-slate-500 mb-4">We'll walk you through the platform, answer your questions, and help you figure out the right plan for your RTO.</p>
              <button onClick={() => nav('#/signup')} className="w-full py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all text-sm">
                Or start a free trial yourself
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
