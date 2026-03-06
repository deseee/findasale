import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'Estate Sale';
    const date = searchParams.get('date') || '';
    const location = searchParams.get('location') || '';
    const itemCount = searchParams.get('itemCount') || '';
    const organizer = searchParams.get('organizer') || '';
    const type = searchParams.get('type') || 'sale'; // 'sale' or 'item'

    if (type === 'item') {
      // Item card design
      const price = searchParams.get('price') || '';
      const condition = searchParams.get('condition') || '';

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
              backgroundColor: '#fef3c7',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              padding: '60px',
              position: 'relative',
            }}
          >
            {/* Branding corner */}
            <div
              style={{
                position: 'absolute',
                top: 30,
                right: 30,
                fontSize: 24,
                fontWeight: 'bold',
                color: '#D97706',
              }}
            >
              FindA.Sale
            </div>

            {/* Main content */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 'bold',
                  color: '#1a1a1a',
                  lineHeight: '1.2',
                  maxWidth: '100%',
                  wordWrap: 'break-word',
                }}
              >
                {title.substring(0, 60)}
              </div>

              {/* Price badge */}
              {price && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 44,
                      fontWeight: 'bold',
                      color: '#D97706',
                    }}
                  >
                    {price}
                  </div>
                </div>
              )}

              {/* Condition and location */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  fontSize: 20,
                  color: '#6B5A42',
                }}
              >
                {condition && <div>{condition}</div>}
                {location && condition && <div>•</div>}
                {location && <div>{location}</div>}
              </div>

              {/* Branding line */}
              <div
                style={{
                  width: '120px',
                  height: '2px',
                  backgroundColor: '#D97706',
                  marginTop: '20px',
                }}
              />
            </div>

            {/* Bottom tagline */}
            <div
              style={{
                position: 'absolute',
                bottom: 30,
                fontSize: 16,
                color: '#6B5A42',
              }}
            >
              Discover amazing items at estate sales
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
        }
      );
    }

    // Sale card design
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
            backgroundColor: '#fef3c7',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '60px',
            position: 'relative',
          }}
        >
          {/* Branding in top-right */}
          <div
            style={{
              position: 'absolute',
              top: 30,
              right: 30,
              fontSize: 28,
              fontWeight: 'bold',
              color: '#D97706',
            }}
          >
            FindA.Sale
          </div>

          {/* Main content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              textAlign: 'center',
              maxWidth: '900px',
            }}
          >
            {/* Sale title */}
            <div
              style={{
                fontSize: 56,
                fontWeight: 'bold',
                color: '#1a1a1a',
                lineHeight: '1.2',
                wordWrap: 'break-word',
              }}
            >
              {title.substring(0, 50)}
            </div>

            {/* Organizer name */}
            {organizer && (
              <div
                style={{
                  fontSize: 24,
                  color: '#6B5A42',
                  fontWeight: '500',
                }}
              >
                by {organizer.substring(0, 40)}
              </div>
            )}

            {/* Date and location row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                fontSize: 20,
                color: '#6B5A42',
              }}
            >
              {date && <div>{date.substring(0, 30)}</div>}
              {date && location && <div>•</div>}
              {location && <div>{location.substring(0, 30)}</div>}
            </div>

            {/* Item count badge */}
            {itemCount && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  backgroundColor: '#D97706',
                  color: '#fef3c7',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: 18,
                  fontWeight: 'bold',
                }}
              >
                📦 {itemCount} items
              </div>
            )}

            {/* Decorative line */}
            <div
              style={{
                width: '120px',
                height: '2px',
                backgroundColor: '#D97706',
                marginTop: '8px',
              }}
            />
          </div>

          {/* Bottom tagline */}
          <div
            style={{
              position: 'absolute',
              bottom: 30,
              fontSize: 16,
              color: '#6B5A42',
            }}
          >
            Browse & bid on estate sale treasures
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
