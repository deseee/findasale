/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // FindA.Sale Design System — Phase 24
        warm: {
          50: '#FDFCFB',
          100: '#F9F7F4',  // primary background
          200: '#F0EBE3',
          300: '#E2D9CC',
          400: '#C4B69E',
          500: '#8B7355',  // secondary text / muted elements
          600: '#6B5A42',
          700: '#4A3F2F',
          800: '#2D261C',
          900: '#1A1A1A',  // primary text (17:1 contrast on warm-100)
        },
        amber: {
          DEFAULT: '#D97706',  // accent / CTA
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',  // primary accent
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        success: {
          DEFAULT: '#059669',  // sold / success states
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
        },
        // CD1: Brand sage-green — sustainability, calm, secondary accents
        sage: {
          DEFAULT: '#6B9E7F',
          50: '#F0F7F3',
          100: '#D9EDE3',
          200: '#B3DAC7',
          300: '#8DC6AB',
          400: '#6B9E7F',  // brand sage — taglines, secondary accents
          500: '#52876A',
          600: '#3E6E53',
          700: '#2D5440',
        },
      },
      fontFamily: {
        // CD1: Fraunces — serif headlines (heritage, premium feel)
        heading: ['Fraunces', 'Georgia', 'ui-serif', 'serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Mobile-first type scale
        'display': ['2rem', { lineHeight: '1.2', fontWeight: '700' }],      // 32px
        'display-sm': ['1.75rem', { lineHeight: '1.2', fontWeight: '700' }], // 28px (mobile)
        'h1': ['1.75rem', { lineHeight: '1.2', fontWeight: '700' }],        // 28px
        'h2': ['1.5rem', { lineHeight: '1.25', fontWeight: '600' }],        // 24px
        'h3': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],        // 20px
        'body-lg': ['1.125rem', { lineHeight: '1.7' }],                     // 18px
        'body': ['1rem', { lineHeight: '1.7' }],                            // 16px
        'body-sm': ['0.875rem', { lineHeight: '1.6' }],                     // 14px
        'caption': ['0.75rem', { lineHeight: '1.5' }],                      // 12px
      },
      spacing: {
        // 8px grid system
        '4.5': '1.125rem',  // 18px
        '13': '3.25rem',    // 52px
        '15': '3.75rem',    // 60px — bottom nav clearance
        '18': '4.5rem',     // 72px
      },
      borderRadius: {
        'card': '0.75rem',  // 12px — consistent card radius
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
        'nav': '0 -1px 3px rgba(0, 0, 0, 0.1)',
        'header': '0 1px 3px rgba(0, 0, 0, 0.08)',
      },
      minHeight: {
        'touch': '3rem',  // 48px — minimum touch target
      },
      minWidth: {
        'touch': '3rem',  // 48px
      },
      animation: {
        'slideIn': 'slideIn 0.3s ease-out',
        'fadeIn': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideIn: {
          from: { transform: 'translateX(400px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}