"use client";

import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "#02080f", color: "#e8f4f8" }}
      >
        <svg width="48" height="48" viewBox="0 0 32 32" fill="none" aria-hidden className="mb-4 opacity-60">
          <path d="M16 2 L28 7 L28 18 C28 25 22 29.5 16 32 C10 29.5 4 25 4 18 L4 7 Z"
            fill="#0e3a58" stroke="#2ad4ff" strokeWidth="1.5"/>
          <path d="M16 8 L22 11 L22 18 C22 22 19.5 25 16 26.5 C12.5 25 10 22 10 18 L10 11 Z"
            fill="rgba(42,212,255,0.18)"/>
          <circle cx="16" cy="18" r="3.5" fill="#2ad4ff"/>
        </svg>
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-sm mb-1" style={{ color: "rgba(180,210,240,.55)" }}>
          An unexpected error occurred. Please refresh the page.
        </p>
        <p className="text-xs font-mono mb-6" style={{ color: "rgba(120,160,200,.35)" }}>
          {error.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: "rgba(42,212,255,.15)", color: "#2ad4ff", border: "1px solid rgba(42,212,255,.25)" }}
        >
          Reload
        </button>
      </div>
    );
  }
}
