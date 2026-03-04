import React from 'react';
import Head from 'next/head';

const TermsPage = () => {
  return (
    <>
      <Head>
        <title>Terms of Service - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 mb-8">Terms of Service</h1>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">1. Acceptance of Terms</h2>
            <p className="text-warm-700 leading-relaxed">
              By using FindA.Sale, you agree to these Terms of Service and our Privacy Policy. If you do not agree, do
              not use the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">2. User Responsibilities</h2>
            <p className="text-warm-700 leading-relaxed mb-4">Users agree to:</p>
            <ul className="list-disc list-inside text-warm-700 space-y-2">
              <li>Provide accurate information when creating an account</li>
              <li>Maintain the confidentiality of their account credentials</li>
              <li>Use the platform only for lawful purposes</li>
              <li>Respect the intellectual property rights of others</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">3. Platform Policies</h2>
            <p className="text-warm-700 leading-relaxed mb-4">
              FindA.Sale reserves the right to:
            </p>
            <ul className="list-disc list-inside text-warm-700 space-y-2">
              <li>Modify the platform and these terms at any time</li>
              <li>Suspend or terminate accounts that violate these terms</li>
              <li>Remove content that violates our policies</li>
              <li>Refuse service to anyone for any reason</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">4. Limitation of Liability</h2>
            <p className="text-warm-700 leading-relaxed">
              FindA.Sale is provided "as is" without warranties. We are not liable for indirect, incidental, or
              consequential damages arising from your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-warm-800 mb-4">5. Contact</h2>
            <p className="text-warm-700">
              For questions about these terms, contact us at support@findasale.com.
            </p>
          </section>
        </div>
      </div>
    </>
  );
};

export default TermsPage;
