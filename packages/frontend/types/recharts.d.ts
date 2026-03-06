// Ambient declaration for recharts — works around pnpm workspace moduleResolution:"bundler" hoisting quirks
declare module 'recharts' {
  import * as React from 'react';

  export const LineChart: React.ComponentType<any>;
  export const Line: React.ComponentType<any>;
  export const BarChart: React.ComponentType<any>;
  export const Bar: React.ComponentType<any>;
  export const AreaChart: React.ComponentType<any>;
  export const Area: React.ComponentType<any>;
  export const PieChart: React.ComponentType<any>;
  export const Pie: React.ComponentType<any>;
  export const Cell: React.ComponentType<any>;
  export const XAxis: React.ComponentType<any>;
  export const YAxis: React.ComponentType<any>;
  export const CartesianGrid: React.ComponentType<any>;
  export const Tooltip: React.ComponentType<any>;
  export const Legend: React.ComponentType<any>;
  export const ResponsiveContainer: React.ComponentType<any>;
  export const ReferenceLine: React.ComponentType<any>;
  export const ReferenceArea: React.ComponentType<any>;
  export const Scatter: React.ComponentType<any>;
  export const ScatterChart: React.ComponentType<any>;
  export const ComposedChart: React.ComponentType<any>;
  export const RadarChart: React.ComponentType<any>;
  export const Radar: React.ComponentType<any>;
  export const RadialBarChart: React.ComponentType<any>;
  export const RadialBar: React.ComponentType<any>;
  export const Funnel: React.ComponentType<any>;
  export const FunnelChart: React.ComponentType<any>;
  export const Brush: React.ComponentType<any>;
  export const Label: React.ComponentType<any>;
  export const LabelList: React.ComponentType<any>;
  export const Customized: React.ComponentType<any>;
  export const Symbols: React.ComponentType<any>;
  export const DefaultLegendContent: React.ComponentType<any>;
  export const DefaultTooltipContent: React.ComponentType<any>;
  export const ErrorBar: React.ComponentType<any>;
  export const ZAxis: React.ComponentType<any>;
}
