/**
 * Share Card API Route — S522
 *
 * Generates ready-to-post social media images using @vercel/og (Satori)
 * Supports 6 themes × 4 formats = 24 combinations
 *
 * GET /api/share-card
 *   ?saleId=xxx
 *   &theme=classic|vintage|bold|branded|photo-fullbleed|haul
 *   &format=square|landscape|story|flyer
 *   &type=sale|item
 *   &itemId=xxx (required when type=item)
 *
 * Returns: PNG image (Content-Type: image/png)
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getSession } from 'next-auth/react';

export const config = {
  runtime: 'edge',
};

// XP thresholds for theme locks
const THEME_XP_THRESHOLDS: Record<string, number> = {
  classic: 0,
  vintage: 500,
  bold: 1500,
  branded: 2500,
  'photo-fullbleed': 1000,
  haul: 500,
};

// Format dimensions
const DIMENSIONS: Record<string, [number, number]> = {
  square: [1080, 1080],
  landscape: [1200, 630],
  story: [1080, 1920],
  flyer: [816, 1056],
};

// Fetch image as data URI (required for Satori)
async function fetchImageAsDataUri(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return '';
  }
}

// Classic theme renderer
function renderClassic(
  saleTitle: string,
  address: string,
  city: string,
  startDate: string,
  endDate: string,
  itemCount: number,
  photoUrl: string | null,
  format: string
) {
  const [width, height] = DIMENSIONS[format];

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fef3c7',
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background photos or warm background */}
      {format === 'story' && photoUrl && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url(${photoUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.4,
          }}
        />
      )}

      {/* Amber line */}
      <div
        style={{
          height: 4,
          backgroundColor: '#d97706',
          width: '100%',
        }}
      />

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: format === 'story' ? '40px' : '60px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Sale type pill */}
        <div
          style={{
            display: 'inline-block',
            backgroundColor: '#d97706',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 'bold',
            marginBottom: '20px',
            width: 'fit-content',
          }}
        >
          SALE
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: format === 'story' ? '32px' : '48px',
            fontWeight: 'bold',
            color: '#1a1a1a',
            margin: '0 0 20px 0',
            lineHeight: '1.2',
          }}
        >
          {saleTitle.substring(0, 50)}
        </h1>

        {/* Details */}
        <div
          style={{
            fontSize: '18px',
            color: '#4b5563',
            lineHeight: '1.6',
            marginBottom: '20px',
          }}
        >
          <div>📍 {address}</div>
          <div>📅 {startDate} - {endDate}</div>
          {itemCount > 0 && <div>📦 {itemCount} items</div>}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 40px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#d97706',
        }}
      >
        <span>finda.sale</span>
      </div>
    </div>
  );
}

// Vintage theme renderer
function renderVintage(
  saleTitle: string,
  address: string,
  city: string,
  startDate: string,
  endDate: string,
  itemCount: number,
  photoUrl: string | null,
  format: string
) {
  const [width, height] = DIMENSIONS[format];

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f5ede0',
        fontFamily: 'Georgia, serif',
        padding: '40px',
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Outer border */}
      <div
        style={{
          border: '8px solid #d97706',
          padding: '30px',
          maxWidth: '500px',
          textAlign: 'center',
          backgroundColor: 'white',
        }}
      >
        {/* Decorative line */}
        <div style={{ height: '2px', backgroundColor: '#d97706', marginBottom: '20px' }} />

        {/* Title */}
        <h1
          style={{
            fontSize: '36px',
            fontWeight: 'normal',
            color: '#2d1a0e',
            margin: '0 0 15px 0',
            fontStyle: 'italic',
          }}
        >
          {saleTitle.substring(0, 40)}
        </h1>

        {/* Decorative line */}
        <div style={{ height: '2px', backgroundColor: '#d97706', marginBottom: '20px' }} />

        {/* Details */}
        <div
          style={{
            fontSize: '14px',
            color: '#2d1a0e',
            lineHeight: '1.8',
            marginBottom: '15px',
          }}
        >
          <div>{startDate.toUpperCase()}</div>
          <div>{address}</div>
          {itemCount > 0 && <div>{itemCount} quality items</div>}
        </div>

        {/* Decorative line */}
        <div style={{ height: '2px', backgroundColor: '#d97706' }} />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: '20px',
          fontSize: '12px',
          color: '#2d1a0e',
        }}
      >
        finda.sale
      </div>
    </div>
  );
}

// Bold theme renderer
function renderBold(
  saleTitle: string,
  address: string,
  city: string,
  startDate: string,
  endDate: string,
  itemCount: number,
  photoUrl: string | null,
  format: string
) {
  const [width, height] = DIMENSIONS[format];

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a2e',
        fontFamily: 'system-ui, sans-serif',
        padding: '60px',
        position: 'relative',
        justifyContent: 'center',
      }}
    >
      {/* Main content */}
      <div>
        {/* Title - ALL CAPS */}
        <h1
          style={{
            fontSize: '56px',
            fontWeight: 900,
            color: 'white',
            margin: '0 0 30px 0',
            lineHeight: '1.1',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          {saleTitle.substring(0, 40).toUpperCase()}
        </h1>

        {/* Amber horizontal rule */}
        <div
          style={{
            height: '3px',
            backgroundColor: '#d97706',
            width: '100px',
            marginBottom: '30px',
          }}
        />

        {/* Details */}
        <div
          style={{
            fontSize: '20px',
            color: '#fbbf24',
            lineHeight: '1.8',
            marginBottom: '20px',
            letterSpacing: '1px',
          }}
        >
          <div>{startDate.toUpperCase()} – {endDate.toUpperCase()}</div>
          <div>📍 {address}</div>
        </div>

        {/* Amber dots */}
        <div style={{ fontSize: '20px', color: '#d97706', marginBottom: '20px' }}>
          ● ● ●
        </div>

        {/* FindA.Sale */}
        <div
          style={{
            fontSize: '14px',
            color: 'white',
            fontWeight: 'bold',
          }}
        >
          FINDA.SALE
        </div>
      </div>
    </div>
  );
}

// Photo Full-Bleed theme renderer
function renderPhotoFullBleed(
  saleTitle: string,
  address: string,
  city: string,
  startDate: string,
  endDate: string,
  itemCount: number,
  photoUrl: string | null,
  format: string
) {
  const [width, height] = DIMENSIONS[format];

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a2e',
        backgroundImage: photoUrl ? `url(${photoUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        justifyContent: 'flex-end',
        padding: '40px',
      }}
    >
      {/* Gradient overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <h1
          style={{
            fontSize: '48px',
            fontWeight: 'bold',
            color: 'white',
            margin: '0 0 15px 0',
          }}
        >
          {saleTitle.substring(0, 40)}
        </h1>

        <div style={{ fontSize: '18px', color: 'white', marginBottom: '10px' }}>
          {startDate} - {endDate}
        </div>

        <div style={{ fontSize: '16px', color: '#fbbf24' }}>finda.sale</div>
      </div>
    </div>
  );
}

// Haul collage theme (4-6 items grid)
function renderHaul(
  saleTitle: string,
  address: string,
  city: string,
  startDate: string,
  endDate: string,
  itemCount: number,
  photoUrl: string | null,
  format: string
) {
  const [width, height] = DIMENSIONS[format];

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fef3c7',
        fontFamily: 'system-ui, sans-serif',
        padding: '40px',
        position: 'relative',
      }}
    >
      {/* Header */}
      <h1
        style={{
          fontSize: '32px',
          fontWeight: 'bold',
          color: '#1a1a2e',
          margin: '0 0 30px 0',
          textAlign: 'center',
        }}
      >
        Finds from {saleTitle.substring(0, 30)}
      </h1>

      {/* Placeholder grid */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#d97706',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Item {i}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: '20px',
          fontSize: '12px',
          color: '#1a1a2e',
          textAlign: 'center',
        }}
      >
        finda.sale
      </div>
    </div>
  );
}

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Get parameters
  const saleId = searchParams.get('saleId');
  const theme = searchParams.get('theme') || 'classic';
  const format = searchParams.get('format') || 'square';
  const type = searchParams.get('type') || 'sale';
  const itemId = searchParams.get('itemId');

  // Validate parameters
  if (!saleId) {
    return new Response(JSON.stringify({ error: 'saleId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!DIMENSIONS[format]) {
    return new Response(JSON.stringify({ error: 'Invalid format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!THEME_XP_THRESHOLDS[theme]) {
    return new Response(JSON.stringify({ error: 'Invalid theme' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get session to verify authentication
    const session = await getSession({ req });
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch sale data from backend API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const saleRes = await fetch(`${apiUrl}/sales/${saleId}`, {
      headers: {
        Authorization: `Bearer ${(session as any).backendJwt}`,
      },
    });

    if (!saleRes.ok) {
      return new Response(JSON.stringify({ error: 'Sale not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sale = await saleRes.json();

    // Check XP gate (user must have sufficient XP)
    const requiredXp = THEME_XP_THRESHOLDS[theme] || 0;
    if ((session as any).guildXp === undefined || (session as any).guildXp < requiredXp) {
      return new Response(
        JSON.stringify({ error: 'xp_required', threshold: requiredXp }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Format dates
    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const address = `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}`;
    const itemCount = sale.itemCount || 0;

    // Fetch and convert photo to data URI if available
    let photoDataUri = null;
    if (sale.photos && sale.photos.length > 0) {
      const photoUrl = sale.photos[0];
      // Add watermark if Cloudinary URL
      const watermarkedUrl = photoUrl.includes('cloudinary')
        ? `${photoUrl}/l_text:Arial_20:FindA.Sale,co_white,o_50,g_south_east,x_10,y_10`
        : photoUrl;
      photoDataUri = await fetchImageAsDataUri(watermarkedUrl);
    }

    // Get dimensions for selected format
    const [width, height] = DIMENSIONS[format];

    // Render based on theme
    let jsxContent;
    switch (theme) {
      case 'vintage':
        jsxContent = renderVintage(
          sale.title,
          address,
          sale.city,
          startDate,
          endDate,
          itemCount,
          photoDataUri,
          format
        );
        break;
      case 'bold':
        jsxContent = renderBold(
          sale.title,
          address,
          sale.city,
          startDate,
          endDate,
          itemCount,
          photoDataUri,
          format
        );
        break;
      case 'photo-fullbleed':
        jsxContent = renderPhotoFullBleed(
          sale.title,
          address,
          sale.city,
          startDate,
          endDate,
          itemCount,
          photoDataUri,
          format
        );
        break;
      case 'haul':
        jsxContent = renderHaul(
          sale.title,
          address,
          sale.city,
          startDate,
          endDate,
          itemCount,
          photoDataUri,
          format
        );
        break;
      case 'classic':
      default:
        jsxContent = renderClassic(
          sale.title,
          address,
          sale.city,
          startDate,
          endDate,
          itemCount,
          photoDataUri,
          format
        );
    }

    // Generate image using ImageResponse
    const image = new ImageResponse(jsxContent, {
      width,
      height,
    });

    // Return as image
    const buffer = await image.arrayBuffer();
    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Share card generation error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate share card' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
