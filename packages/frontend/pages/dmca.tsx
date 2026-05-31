import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const DmcaPage = () => {
  const lastUpdated = 'May 2026';

  return (
    <>
      <Head>
        <title>DMCA Policy – FindA.Sale</title>
        <meta name="description" content="DMCA Policy for FindA.Sale — Digital Millennium Copyright Act compliance, takedown requests, and counter-notice procedures." />
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">DMCA Policy</h1>
          <p className="text-warm-500 dark:text-warm-400 mb-2">Digital Millennium Copyright Act Compliance</p>
          <p className="text-warm-500 dark:text-warm-400 mb-10">Last updated: {lastUpdated}</p>

          <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-8">
            FindA.Sale LLC respects the intellectual property rights of others and expects users of the Platform to do
            the same. We respond to valid notices of copyright infringement in accordance with the Digital Millennium
            Copyright Act (17 U.S.C. § 512).
          </p>

          {/* 1 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">1. Designated Agent</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              To submit a DMCA takedown request, contact our designated copyright agent by email at{' '}
              <a href="mailto:support@finda.sale?subject=DMCA%20Takedown%20Request" className="text-amber-600 hover:underline">
                support@finda.sale
              </a>{' '}
              with the subject line <strong>"DMCA Takedown Request"</strong>. We will respond to valid notices
              as promptly as practicable.
            </p>
          </section>

          {/* 2 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">2. Takedown Request Requirements</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              To be valid under the DMCA, your written takedown request must include all of the following:
            </p>
            <ol className="list-decimal list-inside text-warm-700 dark:text-warm-300 space-y-3">
              <li className="leading-relaxed">
                Identification of the copyrighted work claimed to have been infringed (or, if multiple works at a single
                site are covered by a single notification, a representative list of such works).
              </li>
              <li className="leading-relaxed">
                The URL or a sufficiently specific description of the location of the allegedly infringing material on
                FindA.Sale, so that we can locate it.
              </li>
              <li className="leading-relaxed">
                Your contact information, including your full legal name, mailing address, telephone number, and email
                address.
              </li>
              <li className="leading-relaxed">
                A statement that you have a good faith belief that use of the material in the manner complained of is
                not authorized by the copyright owner, its agent, or the law.
              </li>
              <li className="leading-relaxed">
                A statement that the information in the notification is accurate and, under penalty of perjury, that
                you are the copyright owner or are authorized to act on behalf of the copyright owner.
              </li>
              <li className="leading-relaxed">
                Your physical or electronic signature.
              </li>
            </ol>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mt-4">
              Incomplete notices may not receive a response. We reserve the right to ignore notices that do not comply
              with the DMCA's requirements.
            </p>
          </section>

          {/* 3 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">3. Counter-Notice Procedure</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mb-4">
              If you believe that content you posted was removed or disabled as a result of mistake or
              misidentification, you may submit a counter-notice to{' '}
              <a href="mailto:support@finda.sale" className="text-amber-600 hover:underline">support@finda.sale</a>.
              A valid counter-notice must include:
            </p>
            <ol className="list-decimal list-inside text-warm-700 dark:text-warm-300 space-y-3">
              <li className="leading-relaxed">
                Identification of the material that has been removed or disabled and the location (URL) where it
                appeared before it was removed or disabled.
              </li>
              <li className="leading-relaxed">
                Your contact information, including your full legal name, mailing address, telephone number, and email
                address.
              </li>
              <li className="leading-relaxed">
                A statement under penalty of perjury that you have a good faith belief that the material was removed
                or disabled as a result of mistake or misidentification.
              </li>
              <li className="leading-relaxed">
                A statement that you consent to the jurisdiction of the Federal District Court for the Western District
                of Michigan, and that you will accept service of process from the complainant who submitted the
                original takedown request (or their agent).
              </li>
              <li className="leading-relaxed">
                Your physical or electronic signature.
              </li>
            </ol>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed mt-4">
              Upon receipt of a valid counter-notice, we will forward it to the original complainant. If the complainant
              does not notify us within ten (10) business days that they have filed a lawsuit against you, we may, at
              our discretion, restore the removed content.
            </p>
          </section>

          {/* 4 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">4. Repeat Infringer Policy</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              In accordance with the DMCA and other applicable laws, FindA.Sale has adopted a policy of terminating, in
              appropriate circumstances, the accounts of users who are repeat copyright infringers. We may also, at our
              sole discretion, limit access to the Platform or terminate accounts of users who infringe the intellectual
              property rights of others, even where no repeat infringement has occurred.
            </p>
          </section>

          {/* 5 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-warm-800 dark:text-warm-200 mb-4">5. No Legal Advice</h2>
            <p className="text-warm-700 dark:text-warm-300 leading-relaxed">
              Nothing in this policy constitutes legal advice. If you are uncertain whether particular material
              infringes your copyright, we recommend consulting a qualified attorney before submitting a takedown notice.
              Knowingly submitting a materially false DMCA notification may expose you to liability under 17 U.S.C.
              § 512(f).
            </p>
          </section>

          <div className="border-t border-warm-200 dark:border-gray-700 pt-6 text-sm text-warm-500 dark:text-warm-400">
            <p>
              See also our{' '}
              <Link href="/terms" className="text-amber-600 hover:underline">Terms of Service</Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-amber-600 hover:underline">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export const getStaticProps = async () => {
  return { props: {} };
};

export default DmcaPage;
