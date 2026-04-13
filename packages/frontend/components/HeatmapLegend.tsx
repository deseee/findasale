interface HeatmapLegendProps {
  legend?: Record<string, { color: string; label: string }>;
  cacheAge?: number; // seconds since last refresh
}

/**
 * HeatmapLegend — displays color swatches and density labels
 * Shows how many seconds since data was refreshed
 */
const HeatmapLegend = ({
  legend,
  cacheAge = 0,
}: HeatmapLegendProps) => {
  const defaultLegend = {
    '1-2': { color: '#fff3e0', label: 'Very Low (1–2)' },
    '3-5': { color: '#ffb74d', label: 'Low (3–5)' },
    '6-10': { color: '#f57c00', label: 'Medium (6–10)' },
    '11-20': { color: '#e64a19', label: 'High (11–20)' },
    '21+': { color: '#d32f2f', label: 'Very High (21+)' },
  };

  const displayLegend = legend || defaultLegend;

  // Format cache age for display
  const formatCacheAge = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-[999] pointer-events-auto max-w-xs">
      <h3 className="text-sm font-bold text-gray-800 mb-3">Sale Density</h3>

      <div className="space-y-2">
        {Object.entries(displayLegend).map(([key, { color, label }]) => (
          <div key={key} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border border-gray-300"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-gray-700">{label}</span>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-500 mt-3 border-t border-gray-200 pt-2">
        Data {formatCacheAge(cacheAge)}
      </div>
    </div>
  );
};

export default HeatmapLegend;
