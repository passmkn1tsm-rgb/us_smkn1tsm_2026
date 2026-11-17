import React, { useEffect, useState } from 'react';
import { Maximize2, RefreshCw, X } from 'lucide-react';
import { QuestionMediaItem, QuestionMediaLayout } from '../types/exam';

interface QuestionMediaViewerProps {
  items?: QuestionMediaItem[];
  layout?: QuestionMediaLayout;
  compact?: boolean;
}

export const QuestionMediaViewer: React.FC<QuestionMediaViewerProps> = ({
  items = [],
  layout = 'top',
  compact = false
}) => {
  const [zoomItem, setZoomItem] = useState<QuestionMediaItem | null>(null);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [retryVersions, setRetryVersions] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!zoomItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomItem(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomItem]);

  const validItems = items.filter((item) => item && item.url && item.url.trim().length > 0);
  if (!validItems.length) return null;

  const isMultiColumn =
    layout === 'compare_ab' || layout === 'gallery' || validItems.length > 1;

  const gridClass =
    layout === 'compare_ab'
      ? 'grid grid-cols-1 gap-4 md:grid-cols-2'
      : isMultiColumn
      ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
      : 'space-y-3';

  const getSrcWithRetry = (item: QuestionMediaItem) => {
    const v = retryVersions[item.id];
    if (!v || item.url.startsWith('data:')) return item.url;
    const sep = item.url.includes('?') ? '&' : '?';
    return `${item.url}${sep}retry=${v}`;
  };

  return (
    <>
      <div className={gridClass}>
        {validItems.map((item, idx) => {
          const defaultLabel =
            layout === 'compare_ab'
              ? idx === 0
                ? 'Gambar A'
                : idx === 1
                ? 'Gambar B'
                : `Gambar ${idx + 1}`
              : item.label;
          const displayLabel = item.label || defaultLabel;
          const hasError = Boolean(failedUrls[item.id]);
          const pins = item.pins || [];

          return (
            <figure
              key={item.id || idx}
              className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden"
            >
              {displayLabel && (
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
                  <span>{displayLabel}</span>
                  <button
                    type="button"
                    onClick={() => setZoomItem(item)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Perbesar
                  </button>
                </div>
              )}

              <div className="relative bg-slate-100/70">
                {hasError ? (
                  <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-xs text-slate-600">
                    <span>Gambar gagal dimuat karena koneksi terputus.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFailedUrls((prev) => ({ ...prev, [item.id]: false }));
                        setRetryVersions((prev) => ({
                          ...prev,
                          [item.id]: (prev[item.id] || 0) + 1
                        }));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Muat Ulang Gambar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setZoomItem(item)}
                    title="Klik untuk memperbesar gambar"
                    className="relative block w-full text-left cursor-zoom-in group"
                  >
                    <img
                      src={getSrcWithRetry(item)}
                      alt={item.alt || item.caption || displayLabel || 'Gambar stimulus soal'}
                      loading="lazy"
                      onError={() => setFailedUrls((prev) => ({ ...prev, [item.id]: true }))}
                      className={`w-full object-contain mx-auto bg-white ${
                        compact ? 'max-h-48' : 'max-h-80'
                      }`}
                    />
                    {pins.map((pin) => (
                      <span
                        key={pin.id}
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-900 font-mono text-xs font-bold text-white shadow-md pointer-events-none"
                      >
                        {pin.label}
                      </span>
                    ))}
                    {!displayLabel && (
                      <span className="no-print absolute right-2 bottom-2 inline-flex items-center gap-1 rounded bg-slate-900/75 px-2 py-1 text-[11px] font-medium text-white opacity-90 group-hover:opacity-100">
                        <Maximize2 className="h-3 w-3" />
                        Perbesar
                      </span>
                    )}
                  </button>
                )}
              </div>

              {(item.caption || pins.some((p) => p.note)) && (
                <figcaption className="border-t border-slate-200 bg-white px-3.5 py-2.5 space-y-1.5 text-xs text-slate-600">
                  {item.caption && <div className="leading-relaxed">{item.caption}</div>}
                  {pins.some((p) => p.note) && (
                    <div className="space-y-1 pt-0.5">
                      {pins
                        .filter((p) => p.note)
                        .map((p) => (
                          <div key={p.id} className="flex items-start gap-1.5 text-slate-700">
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-900 font-mono text-[10px] font-bold text-white mt-0.5">
                              {p.label}
                            </span>
                            <span>{p.note}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>

      {/* Click-to-Zoom Lightbox */}
      {zoomItem && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomItem(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[92vh] max-w-5xl w-full rounded-lg border border-slate-700 bg-white overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">
                {zoomItem.label || 'Pratinjau Gambar Soal'}
              </div>
              <button
                type="button"
                onClick={() => setZoomItem(null)}
                aria-label="Tutup perbesaran gambar"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Tutup
              </button>
            </div>

            <div className="relative overflow-auto bg-slate-100 p-4 flex items-center justify-center">
              <div className="relative inline-block">
                <img
                  src={getSrcWithRetry(zoomItem)}
                  alt={zoomItem.alt || zoomItem.caption || 'Gambar soal diperbesar'}
                  className="max-h-[75vh] w-auto object-contain rounded bg-white"
                />
                {(zoomItem.pins || []).map((pin) => (
                  <span
                    key={pin.id}
                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-900 font-mono text-xs font-bold text-white shadow-md"
                  >
                    {pin.label}
                  </span>
                ))}
              </div>
            </div>

            {(zoomItem.caption || (zoomItem.pins || []).some((p) => p.note)) && (
              <div className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-700 space-y-1">
                {zoomItem.caption && <div className="font-medium">{zoomItem.caption}</div>}
                {(zoomItem.pins || [])
                  .filter((p) => p.note)
                  .map((p) => (
                    <div key={p.id}>
                      <span className="font-mono font-semibold text-emerald-900">Pin {p.label}:</span>{' '}
                      {p.note}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
