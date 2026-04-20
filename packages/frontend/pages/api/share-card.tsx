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

export const config = { runtime: 'edge' };

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
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
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
            display: 'flex',
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
          display: 'flex',
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
            display: 'flex',
            alignSelf: 'flex-start',
            backgroundColor: '#d97706',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 'bold',
            marginBottom: '20px',
          }}
        >
          SALE
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: format === 'story' ? '32px' : '48px',
            fontWeight: 'bold',
            color: '#1a1a1a',
            margin: '0 0 20px 0',
            lineHeight: '1.2',
          }}
        >
          {saleTitle.substring(0, 50)}
        </div>

        {/* Details */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '18px',
            color: '#4b5563',
            lineHeight: '1.6',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex' }}>Location: {address}</div>
          <div style={{ display: 'flex' }}>Date: {startDate} - {endDate}</div>
          {itemCount > 0 && <div style={{ display: 'flex' }}>Items: {itemCount}</div>}
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
        <div style={{ display: 'flex' }}>finda.sale</div>
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
          display: 'flex',
          flexDirection: 'column',
          border: '8px solid #d97706',
          padding: '30px',
          maxWidth: '500px',
          textAlign: 'center',
          backgroundColor: 'white',
        }}
      >
        {/* Decorative line */}
        <div style={{ display: 'flex', height: '2px', backgroundColor: '#d97706', marginBottom: '20px' }} />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '36px',
            fontWeight: 'normal',
            color: '#2d1a0e',
            margin: '0 0 15px 0',
            fontStyle: 'italic',
          }}
        >
          {saleTitle.substring(0, 40)}
        </div>

        {/* Decorative line */}
        <div style={{ display: 'flex', height: '2px', backgroundColor: '#d97706', marginBottom: '20px' }} />

        {/* Details */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '14px',
            color: '#2d1a0e',
            lineHeight: '1.8',
            marginBottom: '15px',
          }}
        >
          <div style={{ display: 'flex' }}>{startDate.toUpperCase()}</div>
          <div style={{ display: 'flex' }}>{address}</div>
          {itemCount > 0 && <div style={{ display: 'flex' }}>{itemCount} quality items</div>}
        </div>

        {/* Decorative line */}
        <div style={{ display: 'flex', height: '2px', backgroundColor: '#d97706' }} />
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
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
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Title - ALL CAPS */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
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
        </div>

        {/* Amber horizontal rule */}
        <div
          style={{
            display: 'flex',
            height: '3px',
            backgroundColor: '#d97706',
            width: '100px',
            marginBottom: '30px',
          }}
        />

        {/* Details */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '20px',
            color: '#fbbf24',
            lineHeight: '1.8',
            marginBottom: '20px',
            letterSpacing: '1px',
          }}
        >
          <div style={{ display: 'flex' }}>{startDate.toUpperCase()} – {endDate.toUpperCase()}</div>
          <div style={{ display: 'flex' }}>Location: {address}</div>
        </div>

        {/* Amber dots */}
        <div style={{ display: 'flex', fontSize: '20px', color: '#d97706', marginBottom: '20px' }}>
          ● ● ●
        </div>

        {/* FindA.Sale */}
        <div
          style={{
            display: 'flex',
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
          display: 'flex',
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
      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 2 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '48px',
            fontWeight: 'bold',
            color: 'white',
            margin: '0 0 15px 0',
          }}
        >
          {saleTitle.substring(0, 40)}
        </div>

        <div style={{ display: 'flex', fontSize: '18px', color: 'white', marginBottom: '10px' }}>
          {startDate} - {endDate}
        </div>

        <div style={{ display: 'flex', fontSize: '16px', color: '#fbbf24' }}>finda.sale</div>
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: '32px',
          fontWeight: 'bold',
          color: '#1a1a2e',
          margin: '0 0 30px 0',
          textAlign: 'center',
        }}
      >
        Finds from {saleTitle.substring(0, 30)}
      </div>

      {/* Item grid — flexbox rows (Satori does not support CSS Grid) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', gap: '20px', flex: 1 }}>
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
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
        <div style={{ display: 'flex', gap: '20px', flex: 1 }}>
          {[3, 4].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
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
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
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

export default async function handler(req: Request) {
  // Parse URL and get query parameters
  const url = new URL(req.url);
  const saleId = url.searchParams.get('saleId') || undefined;
  const theme = url.searchParams.get('theme') || 'classic';
  const format = url.searchParams.get('format') || 'square';

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

  if (!(theme in THEME_XP_THRESHOLDS)) {
    return new Response(JSON.stringify({ error: 'Invalid theme' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Authenticate via Authorization header (same pattern as all other frontend API routes)
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch sale data from backend API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const saleRes = await fetch(`${apiUrl}/sales/${saleId}`, {
      headers: {
        Authorization: authHeader,
      },
    });

    if (!saleRes.ok) {
      return new Response(JSON.stringify({ error: 'Sale not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sale = await saleRes.json();

    // XP gate deferred — guildXp not available via Authorization header auth
    // TODO: fetch user XP from backend when endpoint is available

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
        jsxContent = renderVintage(sale.title, address, sale.city, startDate, endDate, itemCount, photoDataUri, format);
        break;
      case 'bold':
        jsxContent = renderBold(sale.title, address, sale.city, startDate, endDate, itemCount, photoDataUri, format);
        break;
      case 'photo-fullbleed':
        jsxContent = renderPhotoFullBleed(sale.title, address, sale.city, startDate, endDate, itemCount, photoDataUri, format);
        break;
      case 'haul':
        jsxContent = renderHaul(sale.title, address, sale.city, startDate, endDate, itemCount, photoDataUri, format);
        break;
      case 'classic':
      default:
        jsxContent = renderClassic(sale.title, address, sale.city, startDate, endDate, itemCount, photoDataUri, format);
    }

    // Generate image using ImageResponse (Edge Runtime)
    return new ImageResponse(jsxContent, { width, height });
  } catch (error) {
    console.error('Share card generation error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate share card' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
