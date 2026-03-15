/**
 * DateRangeSelector Component
 * Reusable date range picker for performance dashboard
 */

import React, { useState } from 'react';
import { subDays, format } from 'date-fns';

interface DateRange {
  range: string;
  from?: Date;
  to?: Date;
}

interface DateRangeSelectorProps {
  onRangeChange: (range: string, from?: Date, to?: Date) => void;
  selectedRange: string;
}

const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ onRangeChange, selectedRange }) => {
  const [showCustom, setShowCustom] = useState(selectedRange === 'custom');
  const [customFrom, setCustomFrom] = useState<string>(
    format(subDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [customTo, setCustomTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const handleQuickSelect = (range: '7d' | '30d' | '90d') => {
    onRangeChange(range);
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    const from = new Date(customFrom);
    const to = new Date(customTo);
    onRangeChange('custom', from, to);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {['7d', '30d', '90d'].map((range) => (
          <button
            key={range}
            onClick={() => handleQuickSelect(range as '7d' | '30d' | '90d')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedRange === range && !showCustom
                ? 'bg-amber-600 text-white'
                : 'bg-warm-100 text-warm-900 hover:bg-warm-200'
            }`}
          >
            Last {range === '7d' ? '7 days' : range === '30d' ? '30 days' : '90 days'}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            selectedRange === 'custom' || showCustom
              ? 'bg-amber-600 text-white'
              : 'bg-warm-100 text-warm-900 hover:bg-warm-200'
          }`}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex flex-col gap-3 p-4 bg-warm-50 rounded-lg border border-warm-200">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-warm-700 mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 rounded-lg text-warm-900"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-warm-700 mb-1">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 rounded-lg text-warm-900"
              />
            </div>
          </div>
          <button
            onClick={handleCustomApply}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

export default DateRangeSelector;
