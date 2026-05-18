import React, { useState } from 'react';
import Head from 'next/head';

// --- Types ---

interface JsonLdCheck {
  present: boolean;
  count: number;
  types: string[];
  points: number;
}

interface SimpleCheck {
  present: boolean;
  points: number;
}

interface ImgAltCheck {
  ratio: number;
  points: number;
}

interface AiScoreChecks {
  jsonLd: JsonLdCheck;
  metaDescription: SimpleCheck;
  ogTitle: SimpleCheck;
  ogDescription: SimpleCheck;
  canonical: SimpleCheck;
  h1: SimpleCheck;
  title: SimpleCheck;
  imgAlt: ImgAltCheck;
}

interface AiScoreResult {
  url: string;
  score: number;
  grade: string;
  checks: AiScoreChecks;
  summary: string;
  error?: string;
}

// --- Demo data shown before first analysis ---

const DEMO_DATA: AiScoreResult = {
  url: 'https://finda.sale/sales/example',
  score: 72,
  grade: 'C',
  checks: {
    jsonLd: { present: true, count: 1, types: ['Event'], points: 40 },
    metaDescription: { present: true, points: 10 },
    ogTitle: { present: true, points: 8 },
    ogDescription: { present: false, points: 0 },
    canonical: { present: true, points: 8 },
    h1: { present: true, points: 7 },
    title: { present: false, points: 0 },
    imgAlt: { ratio: 0.6, points: 0 },
  },
  summary: 'Good foundation. Adding og:description and alt text on all images would improve AI visibility.',
};

// --- Helpers ---

function getScoreColor(score: number): string {
  if (score >= 80) return '#f59e0b'; // amber
  if (score >= 60) return '#eab308'; // yellow
  return '#ef4444'; // red
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'rgba(245,158,11,0.15)';
  if (score >= 60) return 'rgba(234,179,8,0.15)';
  return 'rgba(239,68,68,0.15)';
}

interface CheckRowProps {
  label: string;
  description: string;
  points: number;
  maxPoints: number;
  detail?: string;
  isDemo?: boolean;
}

function CheckRow({ label, description, detail, points, maxPoints, isDemo }: CheckRowProps) {
  const passed = points > 0;
  return (
    <tr style={{ opacity: isDemo ? 0.5 : 1 }}>
      <td style={{ padding: '10px 12px', fontSize: '14px' }}>
        <span style={{ marginRight: '8px' }}>{passed ? '✅' : '❌'}</span>
        <strong>{label}</strong>
        {detail && (
          <span style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginLeft: '24px', marginTop: '2px' }}>
            {detail}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 12px', fontSize: '13px', color: '#d1d5db' }}>{description}</td>
      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: passed ? '#f59e0b' : '#6b7280' }}>
          {points}/{maxPoints}
        </span>
      </td>
    </tr>
  );
}

// --- Main component ---

export default function AiScorePage() {
  const [inputUrl, setInputUrl] = useState('https://finda.sale/');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiScoreResult | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFetchError(null);
    setResult(null);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/ai-score?url=${encodeURIComponent(inputUrl)}`);
      const data: AiScoreResult = await res.json();
      if (data.error) {
        setFetchError(data.error);
      } else {
        setResult(data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setFetchError(`Could not reach the scoring service: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const display = result ?? DEMO_DATA;
  const isDemo = result === null;
  const scoreColor = getScoreColor(display.score);
  const scoreBg = getScoreBg(display.score);

  return (
    <>
      <Head>
        <title>Search Visibility Score | FindA.Sale</title>
        <meta
          name="description"
          content="Check how visible your sale listing is to AI search assistants like ChatGPT, Perplexity, and Claude. Free GEO analysis tool."
        />
        <meta property="og:title" content="Search Visibility Score | FindA.Sale" />
        <meta
          property="og:description"
          content="Check how visible any FindA.Sale page is to AI search assistants. Free GEO analysis tool."
        />
        <meta property="og:url" content="https://finda.sale/ai-score" />
        <link rel="canonical" href="https://finda.sale/ai-score" />
        <meta name="robots" content="index, follow" />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0f0f0f',
          color: '#f3f4f6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '40px 16px 80px',
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', color: '#f59e0b', fontWeight: 600, letterSpacing: '0.08em', marginBottom: '12px', textTransform: 'uppercase' }}>
              GEO Tool
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.2 }}>
              Search Visibility Score
            </h1>
            <p style={{ fontSize: '16px', color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
              Check how visible any FindA.Sale page is to AI search assistants like ChatGPT, Perplexity, and Google AI.
            </p>
          </div>

          {/* Input form */}
          <form onSubmit={handleAnalyze} style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://finda.sale/sales/..."
                required
                style={{
                  flex: 1,
                  minWidth: '200px',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '15px',
                  color: '#f3f4f6',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  backgroundColor: loading ? '#4b5563' : '#f59e0b',
                  color: loading ? '#9ca3af' : '#000',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 28px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {loading ? 'Analyzing…' : 'Analyze'}
              </button>
            </div>
          </form>

          {/* Error state */}
          {fetchError && (
            <div
              style={{
                backgroundColor: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '10px',
                padding: '16px 20px',
                marginBottom: '32px',
                color: '#fca5a5',
                fontSize: '14px',
              }}
            >
              <strong>Error:</strong> {fetchError}
            </div>
          )}

          {/* Demo banner */}
          {isDemo && !fetchError && (
            <div
              style={{
                backgroundColor: 'rgba(99,102,241,0.1)',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '24px',
                fontSize: '13px',
                color: '#a5b4fc',
                textAlign: 'center',
              }}
            >
              Example preview — enter a URL above and click Analyze to see real results
            </div>
          )}

          {/* Score card */}
          <div
            style={{
              backgroundColor: '#161616',
              border: '1px solid #1f2937',
              borderRadius: '14px',
              padding: '32px',
              marginBottom: '24px',
              opacity: isDemo ? 0.7 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap' }}>
              {/* Circular badge */}
              <div
                style={{
                  width: '104px',
                  height: '104px',
                  borderRadius: '50%',
                  backgroundColor: scoreBg,
                  border: `3px solid ${scoreColor}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: '30px', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                  {display.score}
                </span>
                <span style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>/ 100</span>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '40px', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                    {display.grade}
                  </span>
                  <span style={{ fontSize: '14px', color: '#9ca3af' }}>Grade</span>
                </div>
                <p style={{ margin: 0, fontSize: '15px', color: '#d1d5db', lineHeight: 1.5 }}>
                  {display.summary}
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>
                  {display.url}
                </p>
              </div>
            </div>
          </div>

          {/* Breakdown table */}
          <div
            style={{
              backgroundColor: '#161616',
              border: '1px solid #1f2937',
              borderRadius: '14px',
              overflow: 'hidden',
              marginBottom: '24px',
              opacity: isDemo ? 0.7 : 1,
            }}
          >
            <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #1f2937' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Score Breakdown</h2>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f2937' }}>
                  <th style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280', textAlign: 'left', fontWeight: 500 }}>Signal</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280', textAlign: 'left', fontWeight: 500 }}>Why it matters</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280', textAlign: 'right', fontWeight: 500 }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                <CheckRow
                  label="JSON-LD Structured Data"
                  description="AI assistants extract facts from structured data first"
                  detail={
                    display.checks.jsonLd.present && display.checks.jsonLd.types.length > 0
                      ? `Types: ${display.checks.jsonLd.types.join(', ')} (${display.checks.jsonLd.count} block${display.checks.jsonLd.count !== 1 ? 's' : ''})`
                      : undefined
                  }
                  points={display.checks.jsonLd.points}
                  maxPoints={50}
                  isDemo={isDemo}
                />
                <CheckRow
                  label="Meta Description"
                  description="Displayed in AI search summaries and previews"
                  points={display.checks.metaDescription.points}
                  maxPoints={10}
                  isDemo={isDemo}
                />
                <CheckRow
                  label="Open Graph Title"
                  description="Used when AI tools cite or share your page"
                  points={display.checks.ogTitle.points}
                  maxPoints={8}
                  isDemo={isDemo}
                />
                <CheckRow
                  label="Open Graph Description"
                  description="Secondary description used by AI citation engines"
                  points={display.checks.ogDescription.points}
                  maxPoints={7}
                  isDemo={isDemo}
                />
                <CheckRow
                  label="Canonical URL"
                  description="Prevents duplicate content confusion in AI indexes"
                  points={display.checks.canonical.points}
                  maxPoints={8}
                  isDemo={isDemo}
                />
                <CheckRow
                  label="H1 Heading"
                  description="Primary topic signal for AI content understanding"
                  points={display.checks.h1.points}
                  maxPoints={7}
                  isDemo={isDemo}
                />
                <CheckRow
                  label="Page Title Tag"
                  description="Foundational signal for all search engines"
                  points={display.checks.title.points}
                  maxPoints={5}
                  isDemo={isDemo}
                />
                <CheckRow
                  label="Image Alt Text"
                  description={`Alt text coverage: ${Math.round((display.checks.imgAlt.ratio ?? 0) * 100)}% of images`}
                  points={display.checks.imgAlt.points}
                  maxPoints={5}
                  isDemo={isDemo}
                />
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid #1f2937', backgroundColor: '#0f0f0f' }}>
                  <td colSpan={2} style={{ padding: '12px', fontSize: '13px', fontWeight: 600, color: '#d1d5db' }}>Total Score</td>
                  <td style={{ padding: '12px', fontSize: '15px', fontWeight: 700, textAlign: 'right', color: scoreColor }}>
                    {display.score}/100
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* What this means */}
          <div
            style={{
              backgroundColor: '#161616',
              border: '1px solid #1f2937',
              borderRadius: '14px',
              padding: '24px',
            }}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>What this measures</h2>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#9ca3af', lineHeight: 1.7 }}>
              This tool measures <strong style={{ color: '#f3f4f6' }}>Generative Engine Optimization (GEO)</strong> — how well a
              page communicates its content to AI-powered search tools. Unlike traditional search engines that rank pages
              by links and keywords, AI assistants like ChatGPT, Perplexity, and Google AI Overviews extract structured
              facts from your page to generate direct answers.
            </p>
            <p style={{ margin: 0, fontSize: '14px', color: '#9ca3af', lineHeight: 1.7 }}>
              A higher score means more of your sale's details — dates, location, categories, pricing — will appear when
              someone asks an AI assistant about sales in your area.
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
