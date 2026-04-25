import React, { useState } from 'react';

interface StarRatingProps {
  value: number;
  max?: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-7 h-7' };

const StarRating: React.FC<StarRatingProps> = ({
  value,
  max = 5,
  interactive = false,
  onChange,
  size = 'md',
  className = '',
}) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const displayValue = hovered !== null ? hovered : value;
  const sizeClass = SIZES[size];

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`Rating: ${value} out of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const starNum = i + 1;
        const filled = displayValue >= starNum;
        const halfFilled = !filled && displayValue >= starNum - 0.5;

        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onChange?.(starNum)}
            onMouseEnter={() => interactive && setHovered(starNum)}
            onMouseLeave={() => interactive && setHovered(null)}
            className={`${sizeClass} focus:outline-none ${
              interactive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'
            }`}
            aria-label={`${starNum} star${starNum !== 1 ? 's' : ''}`}
          >
            <svg viewBox="0 0 24 24" className={`${sizeClass}`} fill="none" xmlns="http://www.w3.org/2000/svg">
              {halfFilled ? (
                <>
                  <defs>
                    <linearGradient id={`half-${i}`} x1="0" x2="1" y1="0" y2="0">
                      <stop offset="50%" stopColor="#F97316" />
                      <stop offset="50%" stopColor="#D4C4A8" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M12 2l2.928 6.057L22 9.24l-5 4.956 1.18 6.996L12 18.02l-6.18 3.172L7 15.196 2 10.24l7.072-1.183z"
                    fill={`url(#half-${i})`}
                    stroke="#F97316"
                    strokeWidth="1"
                  />
                </>
              ) : (
                <path
                  d="M12 2l2.928 6.057L22 9.24l-5 4.956 1.18 6.996L12 18.02l-6.18 3.172L7 15.196 2 10.24l7.072-1.183z"
                  fill={filled ? '#F97316' : '#D4C4A8'}
                  stroke={filled ? '#F97316' : '#B8A88A'}
                  strokeWidth="1"
                />
              )}
            </svg>
          </button>
        );
      })}
    </div>
  );
};

export default StarRating;
