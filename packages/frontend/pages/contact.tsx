import React, { useState } from 'react';
import api from '../lib/api';
import Head from 'next/head';

const ContactPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await api.post('/contact/submit', { name, email, message });
      setSubmitted(true);
      setName('');
      setEmail('');
      setMessage('');
      setTimeout(() => setSubmitted(false), 5000);
    } catch (error) {
      console.error('Failed to submit contact form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Contact Support | FindA.Sale</title>
        <meta property="og:title" content="Contact FindA.Sale" />
        <meta property="og:description" content="Get in touch with the FindA.Sale support team. We're here to help organizers and shoppers in Grand Rapids, Michigan." />
        <meta property="og:url" content="https://finda.sale/contact" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta name="twitter:card" content="summary" />
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 mb-4">Contact Support</h1>
          <p className="text-warm-600 mb-8 text-lg">
            We're here to help organizers and shoppers. Reach out with any questions or feedback.
          </p>

          {/* Quick contact options */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="bg-white border border-warm-200 rounded-lg p-6">
              <div className="text-2xl mb-2">📧</div>
              <h2 className="text-lg font-bold text-warm-900 mb-2">Email Support</h2>
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:text-amber-700 font-medium">
                support@finda.sale
              </a>
              <p className="text-sm text-warm-600 mt-3">
                We typically respond within 4 hours during business hours.
              </p>
            </div>

            <div className="bg-white border border-warm-200 rounded-lg p-6">
              <div className="text-2xl mb-2">📋</div>
              <h2 className="text-lg font-bold text-warm-900 mb-2">Use This Form</h2>
              <p className="text-sm text-warm-600">
                Fill out the contact form below and we'll respond promptly to your inquiry.
              </p>
            </div>
          </div>

          {submitted && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 font-medium">
              ✓ Thanks for reaching out! We'll get back to you within 4 hours.
            </div>
          )}

          <div className="bg-white border border-warm-200 rounded-lg p-8">
            <h2 className="text-2xl font-bold text-warm-900 mb-6">Send us a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-warm-700 mb-1">
                Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-warm-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-warm-700 mb-1">
                Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={6}
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Sending...' : 'Send Message'}
            </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default ContactPage;
