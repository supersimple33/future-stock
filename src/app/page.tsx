"use client";

import { useState } from "react";

export default function Home() {
  const [inputVal, setInputVal] = useState("");
  const [submittedText, setSubmittedText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return; // Prevent empty submissions

    setSubmittedText(inputVal); // Store the text to display
    setInputVal(""); // Clear input field
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
          className="px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition"
        >
          Submit
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
    </main>
  );
}
