import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'Estate Sale';
    const date = searchParams.get('date') || 'Upcoming Sale';
    const location = searchParams.get('location') || 'Location TBD';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f3f4f6',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 60,
              fontWeight: 'bold',
              color: '#1e40af',
              marginBottom: 20,
            }}
          >
            FindA.Sale
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 40,
              fontWeight: 'bold',
              color: '#374151',
              textAlign: 'center',
              maxWidth: '80%',
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#6b7280',
              marginTop: 20,
            }}
          >
            {date}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#6b7280',
              marginTop: 10,
            }}
          >
            {location}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: '#1e40af',
              marginTop: 40,
            }}
          >
            Check it out on FindA.Sale!
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    console.error(`OG image generation error: ${e.message}`);
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
