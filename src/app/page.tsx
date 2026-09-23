"use client";

import { useState } from "react";
import { fetchOptionsData } from "./data";
import type { OptionDataResponse } from "./models";

export default function Home() {
  const [inputVal, setInputVal] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [optionsData, setOptionsData] = useState<OptionDataResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const symbol = inputVal.trim();
    if (!symbol) return; // Prevent empty submissions

    setSubmittedText(symbol); // Store the text to display
    setInputVal(""); // Clear input field
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchOptionsData(symbol);
      setOptionsData(data);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch options data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="p-8 max-w-sm mx-auto">
      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Enter text..."
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
        >
          {isLoading ? "Loading..." : "Submit"}
        </button>
      </form>

      {/* Conditionally rendered output: shows only after submission */}
      {submittedText && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Submitted Output:
          </span>
          <p className="mt-1 text-sm text-gray-800 wrap-break-word">
            {submittedText}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {optionsData && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
          <span className="text-xs font-semibold text-green-600 uppercase tracking-wider block">
            Options Data Loaded:
          </span>
          <p className="mt-1 font-medium">
            {optionsData.symbol} - ${optionsData.data.current_price.toFixed(2)}
          </p>
          <p className="text-xs text-green-700">
            {optionsData.data.options.length} options contracts found
          </p>
        </div>
      )}
    </main>
  );
}
