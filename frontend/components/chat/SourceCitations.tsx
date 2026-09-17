"use client";

import { useState } from "react";
import { ExternalLink, FileText, X } from "lucide-react";
import type { Source } from "@/types";

interface SourceCitationsProps {
  sources: Source[];
}

interface DocPreviewModalProps {
  source: Source;
  onClose: () => void;
}

function DocPreviewModal({ source, onClose }: DocPreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-semibold text-foreground text-sm leading-tight">
                {source.filename}
              </p>
              {source.pageNumber && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Page {source.pageNumber}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-accent/50 rounded-xl p-4 border border-border">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {source.chunkText}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          This is the relevant excerpt retrieved from your document.
        </p>
      </div>
    </div>
  );
}

function getDisplayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}

export default function SourceCitations({ sources }: SourceCitationsProps) {
  const [previewSource, setPreviewSource] = useState<Source | null>(null);

  if (!sources || sources.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {sources.map((source, i) => {
          const isWeb = Boolean(source.url);

          if (isWeb && source.url) {
            return (
              <a
                key={i}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs
                           bg-emerald-500/10 border border-emerald-500/20 text-emerald-400
                           hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all duration-150
                           cursor-pointer"
              >
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                <span className="truncate max-w-[180px]">
                  {getDisplayDomain(source.url)}
                </span>
              </a>
            );
          }

          return (
            <button
              key={i}
              onClick={() => setPreviewSource(source)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs
                         bg-blue-500/10 border border-blue-500/20 text-blue-400
                         hover:bg-blue-500/20 hover:border-blue-500/40 transition-all duration-150
                         cursor-pointer"
            >
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[180px]">
                {source.filename}
                {source.pageNumber ? ` · p${source.pageNumber}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {previewSource && (
        <DocPreviewModal
          source={previewSource}
          onClose={() => setPreviewSource(null)}
        />
      )}
    </>
  );
}
