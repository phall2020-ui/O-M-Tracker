'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

interface ContractStatusChartProps {
  contracted: number;
  nonContracted: number;
}

export function ContractStatusChart({ contracted, nonContracted }: ContractStatusChartProps) {
  const data = [
    { name: 'Contracted', value: contracted, color: '#10b981' },
    { name: 'Awaiting PAC', value: nonContracted, color: '#e5e7eb' },
  ];

  const total = contracted + nonContracted;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={70}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
          formatter={(value: number, name: string) => [
            `${value} sites (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`,
            name,
          ]}
        />
        <Legend 
          verticalAlign="bottom" 
          height={36}
          formatter={(value) => <span style={{ color: '#374151', fontSize: 12 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
