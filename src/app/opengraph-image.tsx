import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Dynasty League Hub';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const FRAUNCES_URL =
  'https://fonts.gstatic.com/s/fraunces/v38/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib1603gg7S2nfgRYIcaRyjDg.ttf';

export default async function OpenGraphImage() {
  // Serif display face for the wordmark; falls back to the built-in font
  // if the fetch ever fails so link previews never break.
  let fonts: { name: string; data: ArrayBuffer; weight: 600 }[] | undefined;
  try {
    const data = await fetch(FRAUNCES_URL).then(res => res.arrayBuffer());
    fonts = [{ name: 'Fraunces', data, weight: 600 }];
  } catch {
    fonts = undefined;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0e0d11',
          backgroundImage:
            'radial-gradient(circle at 50% -20%, rgba(212,178,106,0.25), rgba(14,13,17,0) 55%)',
        }}
      >
        {/* Crown mark */}
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundImage: 'linear-gradient(180deg, #e2c987, #b89347)',
            boxShadow: '0 0 60px rgba(212,178,106,0.45)',
            marginBottom: 44,
          }}
        >
          <svg viewBox="0 0 24 24" width="64" height="64" fill="#0e0d11">
            <path d="M3 7.5l4.6 4.1L12 4.5l4.4 7.1L21 7.5l-1.7 9.7a1 1 0 01-1 .8H5.7a1 1 0 01-1-.8L3 7.5z" />
          </svg>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 92,
            fontFamily: fonts ? 'Fraunces' : undefined,
            color: '#ffffff',
            letterSpacing: '-1px',
          }}
        >
          <span style={{ marginRight: 24 }}>Dynasty</span>
          <span style={{ color: '#d4b26a' }}>League Hub</span>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 28,
            color: '#8e8a7e',
          }}
        >
          Standings · Trade Grades · Draft Analysis · League History
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
