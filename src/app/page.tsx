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
    if (!optionsData || !expiry) {
      setPdfResult(null);
      return;
    }

    try {
      const pdf = generatePricePdf(optionsData, expiry);
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
    <main className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Options PDF Analyzer</h1>

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
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
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
              <span className="text-gray-500 block">Strike Range</span>
              <span className="font-semibold text-gray-900">
                ${peakStats.minStrike} - ${peakStats.maxStrike} (
                {pdfResult.distribution.length} pts)
              </span>
            </div>
            <div className="p-2 bg-white rounded border border-blue-100">
              <span className="text-gray-500 block">Peak Mode (Q Density)</span>
              <span className="font-semibold text-blue-700">
                ${peakStats.maxQStrike.toFixed(2)}
              </span>
            </div>
            <div className="p-2 bg-white rounded border border-blue-100">
              <span className="text-gray-500 block">Peak Mode (P Density)</span>
              <span className="font-semibold text-green-700">
                ${peakStats.maxPStrike.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
