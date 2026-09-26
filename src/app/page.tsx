"use client";

import { useMemo, useState } from "react";
import { fetchOptionsData } from "./data";
import { generatePricePdf, type PdfResult } from "./math";
import type { OptionDataResponse } from "./models";
import { PdfChart } from "./PdfChart";

const OCC_REGEX = /^([A-Z\s]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export default function Home() {
  const [symbolInput, setSymbolInput] = useState("");
  const [activeSymbol, setActiveSymbol] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [rateInput, setRateInput] = useState("4.5");
  const [optionsData, setOptionsData] = useState<OptionDataResponse | null>(
    null,
  );
  const [pdfResult, setPdfResult] = useState<PdfResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract available expiration dates from options data
  const availableExpiries = useMemo(() => {
    if (!optionsData?.data?.options) return [];
    const expiries = new Set<string>();
    for (const opt of optionsData.data.options) {
      const match = opt.option.match(OCC_REGEX);
      if (match) {
        const [, , yy, mm, dd] = match;
        expiries.add(`20${yy}-${mm}-${dd}`);
      }
    }
    return Array.from(expiries).sort();
  }, [optionsData]);

  const computePdf = (
    data: OptionDataResponse,
    expiry: string,
    rateStr: string,
  ) => {
    if (!expiry) {
      setPdfResult(null);
      return;
    }

    const parsedRate = parseFloat(rateStr);
    const r = Number.isFinite(parsedRate) ? parsedRate / 100 : 0.045;

    try {
      const pdf = generatePricePdf(data, expiry, { riskFreeRate: r });
      setPdfResult(pdf);
      setError(null);
    } catch (err) {
      console.error(err);
      setPdfResult(null);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate PDF for the selected date",
      );
    }
  };

  const handleFetchSymbol = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;

    setIsLoading(true);
    setError(null);
    setPdfResult(null);
    setSelectedDate("");
    setOptionsData(null);

    try {
      const data = await fetchOptionsData(symbol);
      setOptionsData(data);
      setActiveSymbol(symbol);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch options data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectExpiry = (expiry: string) => {
    setSelectedDate(expiry);
    if (!optionsData) return;
    computePdf(optionsData, expiry, rateInput);
  };

  const handleRateChange = (newRate: string) => {
    setRateInput(newRate);
    if (optionsData && selectedDate) {
      computePdf(optionsData, selectedDate, newRate);
    }
  };

  // Find peak strikes for Q and P distributions
  const peakStats = useMemo(() => {
    if (!pdfResult || pdfResult.distribution.length === 0) return null;
    let maxQ = -1;
    let maxQStrike = 0;
    let maxP = -1;
    let maxPStrike = 0;

    for (const pt of pdfResult.distribution) {
      if (pt.qDensity > maxQ) {
        maxQ = pt.qDensity;
        maxQStrike = pt.strike;
      }
      if (pt.pDensity > maxP) {
        maxP = pt.pDensity;
        maxPStrike = pt.strike;
      }
    }

    const minStrike = pdfResult.distribution[0]?.strike;
    const maxStrike =
      pdfResult.distribution[pdfResult.distribution.length - 1]?.strike;

    return {
      maxQStrike,
      maxPStrike,
      minStrike,
      maxStrike,
    };
  }, [pdfResult]);

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Area (Steps, Chart, Summary) */}
        <div className="lg:col-span-2 space-y-6">
          <h1 className="text-xl font-bold text-gray-900">
            Options PDF Analyzer
          </h1>

          {/* Step 1: Symbol Input */}
          <form onSubmit={handleFetchSymbol} className="space-y-2">
            <label
              htmlFor="symbol-input"
              className="block text-xs font-semibold text-gray-700 uppercase tracking-wider"
            >
              Step 1: Enter Stock Symbol
            </label>
            <div className="flex items-center gap-2">
              <input
                id="symbol-input"
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                placeholder="e.g. SPY, AAPL"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-medium"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isLoading ? "Fetching..." : "Fetch Expiries"}
              </button>
            </div>
          </form>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 2: Choose Expiry Date from Extracted List */}
          {optionsData && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {activeSymbol} Data Loaded
                </span>
                <span className="text-xs font-medium text-gray-500">
                  Spot: ${optionsData.data.current_price.toFixed(2)}
                </span>
              </div>

              <div>
                <label
                  htmlFor="expiry-select"
                  className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                >
                  Step 2: Choose Expiration Date ({availableExpiries.length}{" "}
                  available)
                </label>
                <select
                  id="expiry-select"
                  value={selectedDate}
                  onChange={(e) => handleSelectExpiry(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select an expiration date --</option>
                  {availableExpiries.map((date) => (
                    <option key={date} value={date}>
                      {date}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* PDF Chart Rendering */}
          {pdfResult && <PdfChart pdfResult={pdfResult} />}

          {/* PDF Summary Data */}
          {pdfResult && peakStats && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-blue-950 space-y-2">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider block">
                Generated PDF Data Summary
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">Spot Price</span>
                  <span className="font-semibold text-gray-900">
                    ${pdfResult.spotPrice.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">Target Expiry</span>
                  <span className="font-semibold text-gray-900">
                    {pdfResult.expiry}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">Time to Expiry</span>
                  <span className="font-semibold text-gray-900">
                    {(pdfResult.timeToExpiry * 365.25).toFixed(1)} days (
                    {pdfResult.timeToExpiry.toFixed(4)}y)
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">
                    Risk-Free Rate (r)
                  </span>
                  <span className="font-semibold text-purple-700">
                    {(pdfResult.riskFreeRate * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">Strike Range</span>
                  <span className="font-semibold text-gray-900">
                    ${peakStats.minStrike} - ${peakStats.maxStrike} (
                    {pdfResult.distribution.length} pts)
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">
                    Expected Value (Q)
                  </span>
                  <span className="font-semibold text-blue-700">
                    ${pdfResult.expectedQ.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">
                    Expected Value (P)
                  </span>
                  <span className="font-semibold text-emerald-700">
                    ${pdfResult.expectedP.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">
                    Peak Mode (Q Density)
                  </span>
                  <span className="font-semibold text-blue-700">
                    ${peakStats.maxQStrike.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 bg-white rounded border border-blue-100">
                  <span className="text-gray-500 block">
                    Peak Mode (P Density)
                  </span>
                  <span className="font-semibold text-emerald-700">
                    ${peakStats.maxPStrike.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend & Model Parameters Panel (Sits off from the main area) */}
        <aside className="lg:col-span-1 lg:sticky lg:top-6 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs space-y-4">
            <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-100 pb-2">
              Parameters & Legend
            </h2>

            {/* Risk-Free Rate Parameter Input */}
            <div>
              <label
                htmlFor="sidebar-rate-input"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Risk-Free Rate (r)
              </label>
              <div className="relative">
                <input
                  id="sidebar-rate-input"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={rateInput}
                  onChange={(e) => handleRateChange(e.target.value)}
                  placeholder="4.5"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8 font-medium"
                />
                <span className="absolute right-3 top-1.5 text-sm text-gray-400 font-medium">
                  %
                </span>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                Annual rate (defaults to 4.5%)
              </p>
            </div>

            {/* Visual Legend */}
            <div className="space-y-3 pt-2 border-t border-gray-100 text-xs">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Distribution Curves
              </span>

              <div className="flex items-start gap-2.5">
                <span className="w-3 h-3 rounded-full bg-blue-600 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-medium text-gray-900">
                    Risk-Neutral (Q)
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Implied market expectations
                  </p>
                  {pdfResult && (
                    <p className="font-semibold text-blue-700 text-xs">
                      E[Q]: ${pdfResult.expectedQ.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-600 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-medium text-gray-900">
                    Physical / Real-World (P)
                  </div>
                  <p className="text-[11px] text-gray-500">
                    With CRRA risk premium (γ = 2.5)
                  </p>
                  {pdfResult && (
                    <p className="font-semibold text-emerald-700 text-xs">
                      E[P]: ${pdfResult.expectedP.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-red-500 mt-2 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-medium text-gray-900">Spot Price</div>
                  {pdfResult && (
                    <p className="font-semibold text-red-600 text-xs">
                      ${pdfResult.spotPrice.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
