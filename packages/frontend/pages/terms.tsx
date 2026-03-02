import React from 'react';
import Head from 'next/head';

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Terms of Service - SaleScout</title>
        <meta name="description" content="Terms of Service for SaleScout" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>
          
          <div className="prose prose-lg text-gray-700">
            <p className="mb-4"><strong>Last Updated:</strong> April 5, 2025</p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="mb-4">
              By accessing or using the SaleScout platform, you agree to be bound by these Terms of Service 
              and all applicable laws and regulations. If you do not agree with any part of these terms, 
              you may not access the service.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">2. Description of Service</h2>
            <p className="mb-4">
              SaleScout provides an online marketplace connecting estate sale organizers with potential buyers. 
              We offer tools for organizing sales, listing items, bidding, and purchasing items through our platform.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">3. User Accounts</h2>
            <p className="mb-4">
              To access certain features of the service, you may be required to create an account. You agree to 
              provide accurate and complete information when creating your account and to keep your account 
              information updated.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">4. User Conduct</h2>
            <p className="mb-4">
              You agree not to use the service for any unlawful purposes or in any way that could damage 
              SaleScout or interfere with other users' enjoyment of the service.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">5. Intellectual Property</h2>
            <p className="mb-4">
              The content, features, and functionality of SaleScout are owned by SaleScout and are protected 
              by international copyright, trademark, patent, trade secret, and other intellectual property laws.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">6. Limitation of Liability</h2>
            <p className="mb-4">
              In no event shall SaleScout be liable for any indirect, incidental, special, consequential, 
              or punitive damages arising out of or related to your use of the service.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">7. Changes to Terms</h2>
            <p className="mb-4">
              We reserve the right to modify these terms at any time. We will notify users of any material 
              changes to the terms.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">8. Refund Policy</h2>
            <p className="mb-4">
              <strong>All sales are final.</strong> Once a purchase is completed through SaleScout,
              it cannot be reversed or refunded except in cases of fraud or platform error.
              If you believe you have been charged in error or have a dispute with a purchase,
              please <a href="/contact" className="text-blue-600 hover:underline">contact our support team</a> within
              7 days of the transaction date. We will review each case individually and work with the
              relevant organizer to resolve legitimate disputes.
            </p>
            <p className="mb-4">
              Estate sale organizers are responsible for accurately representing the items they list.
              SaleScout acts as a payment facilitator and is not the seller of record for individual items.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">9. Contact Information</h2>
            <p className="mb-4">
              If you have any questions about these Terms of Service, please contact us at:
              support@salescout.app
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TermsPage;
