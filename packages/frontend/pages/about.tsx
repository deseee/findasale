import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import api from '../lib/api'; // Use local API client

const AboutPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>About SaleScout</title>
        <meta name="description" content="Learn more about SaleScout" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-gray-900 mb-8">About SaleScout</h1>
          
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
            <p className="text-gray-700 mb-4">
              SaleScout was created to revolutionize the estate sale industry by connecting buyers 
              with exceptional estate sales and providing organizers with powerful tools to manage 
              their events efficiently.
            </p>
            <p className="text-gray-700">
              Our platform makes it easy for shoppers to discover unique treasures and for organizers 
              to reach a wider audience, ultimately creating a better experience for everyone involved.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold mb-3">For Shoppers</h3>
              <ul className="list-disc pl-5 space-y-2 text-gray-700">
                <li>Discover estate sales near you</li>
                <li>Browse items before visiting</li>
                <li>Get directions to sale locations</li>
                <li>Save favorite sales and items</li>
                <li>Participate in online auctions</li>
              </ul>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold mb-3">For Organizers</h3>
              <ul className="list-disc pl-5 space-y-2 text-gray-700">
                <li>Create and manage estate sales</li>
                <li>List items with photos and descriptions</li>
                <li>Track sales performance</li>
                <li>Engage with customers</li>
                <li>Process payments seamlessly</li>
              </ul>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-6 text-center">
            <h3 className="text-2xl font-semibold text-blue-800 mb-3">Join Our Community</h3>
            <p className="text-gray-700 mb-4">
              Whether you're looking for unique treasures or organizing estate sales, 
              SaleScout is here to help you succeed.
            </p>
            <div className="space-x-4">
              <Link 
                href="/register" 
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-block"
              >
                Get Started
              </Link>
              <Link 
                href="/contact" 
                className="bg-white hover:bg-gray-100 text-blue-600 font-bold py-2 px-4 rounded border border-blue-600 inline-block"
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
