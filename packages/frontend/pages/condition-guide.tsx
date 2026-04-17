import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const ConditionGuide: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to FAQ page (condition guide content is now integrated there)
    router.replace('/faq');
  }, [router]);

  return (
    <>
      <Head>
        <title>Item Condition Guide - FindA.Sale</title>
        <meta
          name="description"
          content="Learn about FindA.Sale item condition ratings. Redirecting to FAQ..."
        />
      </Head>
      <div />
    </>
  );
};

export default ConditionGuide;
