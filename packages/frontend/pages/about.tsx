import React from 'react';
import Head from 'next/head';

const AboutPage = () => {
  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';
  const defaultState = process.env.NEXT_PUBLIC_DEFAULT_STATE || '';

  return (
    <>
      <Head>
        <title>About FindA.Sale</title>
        <meta name="description" content="Learn about FindA.Sale and our mission to simplify estate sales." />
        <meta property="og:title" content="About FindA.Sale" />
        <meta property="og:description" content="FindA.Sale is a digital platform for estate sale organizers and shoppers near you." />
        <meta property="og:url" content="https://finda.sale/about" />
        <meta property="og:image" content="https://finda.sale/og-default.png" />
        <meta name="twitter:card" content="summary" />
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-6">About FindA.Sale</h1>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">Our Mission</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              FindA.Sale connects estate sale organizers with shoppers in their communities,
              making it easier to discover and attend sales while reducing the administrative
              burden on organizers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">For Organizers</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              We provide tools to manage inventory, track bids, and connect with shoppers
              — without the need for expensive software or complex workflows.
            </p>
            <ul className="list-disc list-inside text-warm-700 dark:text-warm-300 space-y-2">
              <li>Easy inventory management</li>
              <li>Real-time bid tracking</li>
              <li>Built-in shopper communication</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">For Shoppers</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              Discover upcoming sales near you, place bids, and buy items online or in person.
            </p>
            <ul className="list-disc list-inside text-warm-700 dark:text-warm-300 space-y-2">
              <li>Browse sales by location</li>
              <li>Place bids on auction items</li>
              <li>Get notifications about new sales</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">Contact Us</h2>
            <p className="text-warm-700 dark:text-warm-300">
              Questions? <a href="/contact" className="text-amber-600 underline hover:text-amber-700">Get in touch</a>.
            </p>
          </section>
        </div>
      </div>
    </>
  );
};

export default AboutPage;
