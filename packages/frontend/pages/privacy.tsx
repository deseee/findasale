import React from 'react';
import Head from 'next/head';

const PrivacyPage = () => {
  return (
    <>
      <Head>
        <title>Privacy Policy - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 mb-8">Privacy Policy</h1>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">Introduction</h2>
            <p className="text-warm-700 leading-relaxed">
              FindA.Sale ("we", "us", or "our") operates the FindA.Sale platform. This page informs you of our policies
              regarding the collection, use, and disclosure of personal data when you use our service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">Information Collection and Use</h2>
            <p className="text-warm-700 leading-relaxed mb-4">
              We collect several different types of information for various purposes to provide and improve our service:
            </p>
            <ul className="list-disc list-inside text-warm-700 space-y-2">
              <li><strong>Personal Data:</strong> Name, email address, phone number, location, payment information</li>
              <li><strong>Usage Data:</strong> Browser type, IP address, pages visited, time spent on pages</li>
              <li><strong>Cookies:</strong> We use cookies to enhance your experience</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">Security of Data</h2>
            <p className="text-warm-700 leading-relaxed">
              The security of your data is important to us but remember that no method of transmission over the Internet
              or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect
              your Personal Data, we cannot guarantee its absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">Changes to This Privacy Policy</h2>
            <p className="text-warm-700 leading-relaxed">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new
              Privacy Policy on this page and updating the "effective date" at the top of this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">Contact Us</h2>
            <p className="text-warm-700">
              If you have questions about this Privacy Policy, please contact us at privacy@findasale.com.
            </p>
          </section>
        </div>
      </div>
    </>
  );
};

export default PrivacyPage;
