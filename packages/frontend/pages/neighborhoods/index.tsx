/**
 * Neighborhood Directory — Sprint U2
 * Static overview page listing all supported neighborhoods.
 * Each card links to /neighborhoods/[slug] for full SEO landing page.
 * Route: /neighborhoods
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';

export const GRAND_RAPIDS_NEIGHBORHOODS: Array<{
  slug: string;
  name: string;
  description: string;
}> = [
  { slug: 'downtown',       name: 'Downtown',         description: 'City center — lofts, condos, and eclectic finds.' },
  { slug: 'eastown',        name: 'Eastown',           description: 'Vibrant district known for mid-century gems and vintage décor.' },
  { slug: 'east-hills',     name: 'East Hills',        description: 'Historic neighborhood with antiques, art, and craftsman furniture.' },
  { slug: 'heritage-hill',  name: 'Heritage Hill',     description: 'Victorian homes full of heirloom pieces and estate jewelry.' },
  { slug: 'creston',        name: 'Creston',           description: 'North-side neighborhood with tools, collectibles, and garage finds.' },
  { slug: 'westside',       name: 'Westside',          description: 'Family-friendly area with furniture, clothing, and household goods.' },
  { slug: 'midtown',        name: 'Midtown',           description: 'Central district close to hospitals — diverse selection every week.' },
  { slug: 'fulton-heights', name: 'Fulton Heights',    description: 'Quiet residential area with frequent estate and moving sales.' },
  { slug: 'alger-heights',  name: 'Alger Heights',     description: 'Southeast neighborhood packed with estate auctions and collectibles.' },
  { slug: 'ada',            name: 'Ada Township',      description: 'Upscale suburb with high-end furniture and décor.' },
  { slug: 'cascade',        name: 'Cascade',           description: 'Southeast suburb known for quality appliances and electronics.' },
  { slug: 'kentwood',       name: 'Kentwood',          description: 'Large diverse suburb with clothing, books, and household items.' },
  { slug: 'wyoming',        name: 'Wyoming',           description: 'Busy working-class suburb with tools, vehicles, and outdoor equipment.' },
  { slug: 'grandville',     name: 'Grandville',        description: 'Southwest suburb with frequent family estate and downsizing sales.' },
];

const NeighborhoodsPage = () => {
  return (
    <Layout>
      <Head>
        <title>Estate Sales by Neighborhood | FindA.Sale</title>
        <meta
          name="description"
          content="Browse upcoming estate sales by neighborhood. Find estate sales near you on FindA.Sale."
        />
        <link rel="canonical" href="https://finda.sale/neighborhoods" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 pt-8 pb-24">

          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Sales by Neighborhood
            </h1>
            <p className="text-warm-500 dark:text-warm-400 text-sm">
              Browse sales events close to home
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 gap-3">
            {GRAND_RAPIDS_NEIGHBORHOODS.map(n => (
              <Link
                key={n.slug}
                href={`/neighborhoods/${n.slug}`}
                className="card p-4 flex items-start gap-3 hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-lg">📍</span>
                </div>
                <div>
                  <p className="font-semibold text-warm-900 dark:text-warm-100">{n.name}</p>
                  <p className="text-sm text-warm-500 dark:text-warm-400 mt-0.5">{n.description}</p>
                </div>
              </Link>
            ))}
          </div>

        </div>
      </div>
    </Layout>
  );
};

export default NeighborhoodsPage;
