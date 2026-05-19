'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatNumber } from '@/lib/calculations';

interface ContractedCapacityTrendChartProps {
  data: {
    month: string;
    contractedCapacityKwp: number;
    contractedCapacityMw: number;
    sites: number;
  }[];
}

export function ContractedCapacityTrendChart({ data }: ContractedCapacityTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="contractedCapacityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="month" 
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickLine={{ stroke: '#e5e7eb' }}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis 
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickLine={{ stroke: '#e5e7eb' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickFormatter={(value) => `${Number(value).toFixed(0)} MW`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
          formatter={(value: number, name: string) => {
            if (name === 'contractedCapacityMw') {
              return [`${formatNumber(value, 2)} MW`, 'Contracted capacity'];
            }
            return [formatNumber(value, 0), 'Contracted sites'];
          }}
          labelStyle={{ fontWeight: 600, marginBottom: 4 }}
        />
        <Area
          type="monotone"
          dataKey="contractedCapacityMw"
          stroke="#10b981"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#contractedCapacityGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
