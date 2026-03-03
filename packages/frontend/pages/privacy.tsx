import React from 'react';
import Head from 'next/head';

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Privacy Policy - FindA.Sale</title>
        <meta name="description" content="Privacy Policy for FindA.Sale" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
          
          <div className="prose prose-lg text-gray-700">
            <p className="mb-4"><strong>Last Updated:</strong> April 5, 2025</p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">1. Information We Collect</h2>
            <p className="mb-4">
              We collect information you provide directly to us, such as when you create an account, 
              participate in auctions, make purchases, or contact us for support. This may include your name, 
              email address, phone number, payment information, and other personal details.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">2. How We Use Your Information</h2>
            <p className="mb-4">
              We use your information to provide, maintain, and improve our services, including:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Processing transactions and sending transaction confirmations</li>
              <li>Communicating with you about your account and our services</li>
              <li>Providing customer support</li>
              <li>Analyzing usage patterns to improve our platform</li>
            </ul>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">3. Information Sharing</h2>
            <p className="mb-4">
              We do not sell, trade, or rent your personal information to third parties. We may share 
              information with trusted third parties who assist us in operating our website, conducting 
              business, or servicing you, as long as those parties agree to keep this information confidential.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">4. Data Security</h2>
            <p className="mb-4">
              We implement a variety of security measures to maintain the safety of your personal information. 
              These measures include encryption, secure server hosting, and regular security audits.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">5. Cookies</h2>
            <p className="mb-4">
              We use cookies and similar tracking technologies to track activity on our service and hold 
              certain information. You can instruct your browser to refuse all cookies or to indicate when 
              a cookie is being sent.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">6. Your Rights</h2>
            <p className="mb-4">
              Depending on your location, you may have certain rights regarding your personal information, 
              including the right to access, correct, or delete your personal information.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">7. Changes to This Privacy Policy</h2>
            <p className="mb-4">
              We may update our Privacy Policy from time to time. We will notify you of any changes by 
              posting the new Privacy Policy on this page.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">8. Contact Us</h2>
            <p className="mb-4">
              If you have any questions about this Privacy Policy, please contact us at:
              privacy@finda.sale
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicyPage;
