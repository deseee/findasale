/**
 * CategoryBreakdownChart Component
 * Grouped bar chart: category, sellThroughRate + revenue
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface CategoryData {
  category: string;
  itemsListed: number;
  itemsSold: number;
  sellThroughRate: number;
  avgListPrice: number;
  avgSoldPrice: number;
  totalRevenue: number;
  healthScoreAvg: number;
}

interface CategoryBreakdownChartProps {
  data: CategoryData[];
}

const CategoryBreakdownChart: React.FC<CategoryBreakdownChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-warm-600">
        No category data available
      </div>
    );
  }

  const chartData = data.map((cat) => ({
    category: cat.category.charAt(0).toUpperCase() + cat.category.slice(1),
    'Sell-Through %': Math.round(cat.sellThroughRate * 100),
    'Revenue ($)': Math.round(cat.totalRevenue),
    healthScore: cat.healthScoreAvg,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d6" />
        <XAxis
          dataKey="category"
          angle={-45}
          textAnchor="end"
          height={100}
          tick={{ fill: '#5a4a3a', fontSize: 12 }}
        />
        <YAxis yAxisId="left" tick={{ fill: '#5a4a3a', fontSize: 12 }} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: '#5a4a3a', fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #d4c4b0',
            borderRadius: '8px',
          }}
          formatter={(value: any, name: string) => {
            if (name === 'Sell-Through %') return [`${value}%`, name];
            if (name === 'Revenue ($)') return [`$${value}`, name];
            return [value, name];
          }}
          labelStyle={{ color: '#5a4a3a' }}
        />
        <Legend wrapperStyle={{ paddingTop: '20px' }} />
        <Bar
          yAxisId="left"
          dataKey="Sell-Through %"
          fill="#fbbf24"
          radius={[8, 8, 0, 0]}
        />
        <Bar
          yAxisId="right"
          dataKey="Revenue ($)"
          fill="#92400e"
          radius={[8, 8, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default CategoryBreakdownChart;
