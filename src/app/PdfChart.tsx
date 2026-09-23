"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PdfResult } from "./math";

interface PdfChartProps {
  pdfResult: PdfResult;
}

export function PdfChart({ pdfResult }: PdfChartProps) {
  const { spotPrice, distribution, expiry, timeToExpiry } = pdfResult;

  // Find peak modes for labeling
  let maxQStrike = distribution[0]?.strike ?? 0;
  let maxQVal = -1;
  let maxPStrike = distribution[0]?.strike ?? 0;
  let maxPVal = -1;

  for (const pt of distribution) {
    if (pt.qDensity > maxQVal) {
      maxQVal = pt.qDensity;
      maxQStrike = pt.strike;
    }
    if (pt.pDensity > maxPVal) {
      maxPVal = pt.pDensity;
      maxPStrike = pt.strike;
    }
  }

  const daysToExpiry = (timeToExpiry * 365.25).toFixed(0);

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg p-4 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Implied Probability Density Function (PDF)
          </h2>
          <p className="text-xs text-gray-500">
            Expiry: <span className="font-medium text-gray-700">{expiry}</span>{" "}
            (~{daysToExpiry} days)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-1 bg-red-50 text-red-700 rounded-md border border-red-200 font-medium">
            Spot: ${spotPrice.toFixed(2)}
          </span>
          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-200 font-medium">
            Peak Q: ${maxQStrike.toFixed(2)}
          </span>
          <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200 font-medium">
            Peak P: ${maxPStrike.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={distribution}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="qDensityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="pDensityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />

            <XAxis
              dataKey="strike"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(tick) => `$${Number(tick).toFixed(0)}`}
              stroke="#9ca3af"
              tick={{ fontSize: 11 }}
            />

            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 11 }}
              tickFormatter={(val) => Number(val).toFixed(3)}
              width={50}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const strikeVal = Number(label).toFixed(2);
                return (
                  <div className="bg-gray-900 text-white p-2 rounded text-xs shadow-lg space-y-1">
                    <p className="font-semibold border-b border-gray-700 pb-1">
                      Strike: ${strikeVal}
                    </p>
                    {payload.map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-center justify-between gap-3"
                      >
                        <span style={{ color: entry.color }}>
                          {entry.name}:
                        </span>
                        <span className="font-mono">
                          {Number(entry.value).toFixed(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />

            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            />

            {/* Current Spot Price Reference Line */}
            <ReferenceLine
              x={spotPrice}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{
                value: `Spot $${spotPrice.toFixed(2)}`,
                fill: "#dc2626",
                position: "top",
                fontSize: 11,
                fontWeight: 600,
              }}
            />

            {/* Risk-Neutral (Q) Distribution */}
            <Area
              type="monotone"
              dataKey="qDensity"
              name="Risk-Neutral (Q)"
              stroke="#2563eb"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#qDensityGrad)"
              dot={false}
              isAnimationActive={false}
            />

            {/* Physical (P) Distribution */}
            <Area
              type="monotone"
              dataKey="pDensity"
              name="Physical / Real-World (P)"
              stroke="#059669"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#pDensityGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
