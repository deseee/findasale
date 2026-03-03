import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const AboutPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>About FindA.Sale</title>
        <meta name="description" content="FindA.Sale connects estate sale shoppers with the best local sales — and gives organizers the tools to run them without the chaos." />
      </Head>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">

          {/* Hero */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Built for the Saturday Morning Rush</h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Estate sales move fast. FindA.Sale was built to keep up — for the shoppers hunting treasures
              and the organizers making it all happen.
            </p>
          </div>

          {/* Story */}
          <div className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">The Problem We Solve</h2>
            <p className="text-gray-700 mb-4 leading-relaxed">
              Estate sale organizers are some of the hardest-working people in the resale business. They
              photograph hundreds of items, field calls all week, manage door lines at 7am, and process
              payments on clipboards. Meanwhile, shoppers drive across town based on a blurry Facebook photo
              and a vague address.
            </p>
            <p className="text-gray-700 leading-relaxed">
              FindA.Sale changes that. Organizers get a single platform to list sales, upload inventory with
              photos and prices, manage digital line queues, and process payments — all from a phone. Shoppers
              get a clean, searchable view of what's happening nearby, with real item photos before they ever
              leave the driveway.
            </p>
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">For Shoppers</h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Browse sales and item photos before you go</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Save favorites and get notified about new sales near you</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Join a digital line queue — no more 5am curb camping</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Bid on online auction items from anywhere</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Pay securely without cash or checks</span>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">For Organizers</h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Create and publish sales in minutes, not hours</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>AI-assisted item tagging cuts photo time dramatically</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Manage your door line digitally — no more chaos at opening</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Reach more buyers with automated reminders and marketing tools</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">→</span>
                  <span>Accept card payments and track sales performance in one place</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Where we operate */}
          <div className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Where We Operate</h2>
            <p className="text-gray-700 leading-relaxed">
              FindA.Sale launched in Grand Rapids, Michigan — a city with one of the most active estate sale
              communities in the Midwest. We're expanding to serve organizers and shoppers across the region.
              If you're an organizer interested in bringing FindA.Sale to your area, we'd love to hear from you.
            </p>
          </div>

          {/* CTA */}
          <div className="bg-blue-600 rounded-lg p-8 text-center text-white">
            <h3 className="text-2xl font-semibold mb-3">Ready to get started?</h3>
            <p className="text-blue-100 mb-6">
              Join the organizers and shoppers already using FindA.Sale every weekend.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="bg-white text-blue-600 hover:bg-blue-50 font-bold py-3 px-6 rounded-lg inline-block transition-colors"
              >
                Create an Account
              </Link>
              <Link
                href="/contact"
                className="border border-white text-white hover:bg-blue-700 font-bold py-3 px-6 rounded-lg inline-block transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default AboutPage;
