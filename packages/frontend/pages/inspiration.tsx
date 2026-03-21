/**
 * Inspiration Page (#78)
 * Browseable masonry grid of best item photos from published sales
 * ISR with 300s revalidation
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { GetStaticProps } from 'next';
import InspirationGrid from '../components/InspirationGrid';
import Layout from '../components/Layout';
import api from '../lib/api';

interface InspirationItem {
  id: string;
  title: string;
  photoUrls: string[];
  price?: number;
  aiConfidence: number;
  category?: string;
  sale: {
    id: string;
    title: string;
    organizer: {
      businessName: string;
    };
  };
}

interface InspirationPageProps {
  initialItems: InspirationItem[];
  error?: string;
}

const InspirationPage: React.FC<InspirationPageProps> = ({ initialItems = [], error }) => {
  const [items, setItems] = useState<InspirationItem[]>(initialItems);
  const [isLoading, setIsLoading] = useState(false);

  // Client-side refresh for fresh items
  useEffect(() => {
    const fetchItems = async () => {
      setIsLoading(true);
      try {
        const response = await api.get('/items/inspiration?limit=48');
        setItems(response.data.items || []);
      } catch (err) {
        console.error('Failed to fetch inspiration items:', err);
        // Keep initial items on error
      } finally {
        setIsLoading(false);
      }
    };

    // Fetch on client to keep fresh (ISR baseline from build)
    if (typeof window !== 'undefined') {
      fetchItems();
    }
  }, []);

  return (
    <Layout>
      <Head>
        <title>Inspiration Gallery | FindA.Sale</title>
        <meta
          name="description"
          content="Browse beautiful items from estate sales near you. Discover unique finds curated by AI."
        />
        <meta property="og:title" content="Inspiration Gallery | FindA.Sale" />
        <meta
          property="og:description"
          content="Browse beautiful items from estate sales. Discover unique finds."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
            Inspiration Gallery
          </h1>
          <p className="text-warm-600 dark:text-warm-400">
            Discover the best items from upcoming estate sales in your area
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
            <p className="text-red-700 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Grid */}
        <InspirationGrid items={items} isLoading={isLoading} />

        {/* Empty State */}
        {!isLoading && items.length === 0 && !error && (
          <div className="text-center py-16">
            <p className="text-warm-600 dark:text-warm-400 text-lg">
              No items available yet. Check back soon!
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export const getStaticProps: GetStaticProps<InspirationPageProps> = async () => {
  try {
    const response = await api.get('/items/inspiration?limit=48');
    return {
      props: {
        initialItems: response.data.items || [],
      },
      revalidate: 300, // ISR: revalidate every 5 minutes
    };
  } catch (err) {
    console.error('Failed to fetch inspiration items at build time:', err);
    return {
      props: {
        initialItems: [],
        error: 'Failed to load inspiration items',
      },
      revalidate: 60, // Retry in 1 minute on error
    };
  }
};

export default InspirationPage;
