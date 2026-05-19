'use client';

import { formatNumber } from '@/lib/calculations';

interface CmDaysPositionChartProps {
  data: {
    label: string;
    allowance: number;
    approvedUsed: number;
    pendingUsed: number;
    balance: number;
  }[];
}

function clampPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export function CmDaysPositionChart({ data }: CmDaysPositionChartProps) {
  return (
    <div className="cm-position-list">
      {data.map((row) => {
        const approvedUsed = Math.abs(row.approvedUsed);
        const pendingUsed = Math.abs(row.pendingUsed);
        const totalUsed = approvedUsed + pendingUsed;
        const overrun = Math.max(0, totalUsed - row.allowance);
        const remaining = Math.max(0, row.allowance - totalUsed);
        const scale = Math.max(row.allowance, totalUsed, 1);

        return (
          <div className="cm-position-row" key={row.label}>
            <div className="cm-position-header">
              <div>
                <strong>{row.label}</strong>
                <span>{formatNumber(totalUsed, 2)} of {formatNumber(row.allowance, 2)} days used</span>
              </div>
              <span className={`status-badge ${overrun > 0 ? 'status-no' : 'status-yes'}`}>
                {overrun > 0 ? `${formatNumber(overrun, 2)} over` : `${formatNumber(remaining, 2)} remaining`}
              </span>
            </div>

            <div className="cm-position-scale">
              <div className="cm-position-track">
                <div className="cm-position-allowance" style={{ width: `${clampPercent(row.allowance, scale)}%` }} />
                <div className="cm-position-used" style={{ width: `${clampPercent(approvedUsed, scale)}%` }} />
                <div
                  className="cm-position-pending"
                  style={{
                    left: `${clampPercent(approvedUsed, scale)}%`,
                    width: `${clampPercent(pendingUsed, scale)}%`,
                  }}
                />
                {overrun > 0 && (
                  <div
                    className="cm-position-overrun"
                    style={{
                      left: `${clampPercent(row.allowance, scale)}%`,
                      width: `${clampPercent(overrun, scale)}%`,
                    }}
                  />
                )}
              </div>
              <div className="cm-position-axis">
                <span>0d</span>
                <span>Allowance {formatNumber(row.allowance, 0)}d</span>
                <span>{formatNumber(scale, 0)}d</span>
              </div>
            </div>

            <div className="cm-position-legend">
              <span><i className="legend-dot allowance" /> Allowance</span>
              <span><i className="legend-dot used" /> Approved</span>
              <span><i className="legend-dot pending" /> Pending</span>
              {overrun > 0 ? <span><i className="legend-dot overrun" /> Overrun</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
