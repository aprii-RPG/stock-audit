import React, { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed, hide
  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition shadow-sm active:scale-95 ${
          compact ? 'px-3 py-1.5 text-xs min-h-[36px]' : 'px-4 py-2 text-sm min-h-[44px]'
        }`}
        title="Install Stock Audit App"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 font-medium hover:bg-blue-100 transition ${
            compact ? 'px-2.5 py-1 text-xs min-h-[36px]' : 'px-3.5 py-2 text-xs min-h-[44px]'
          }`}
        >
          <Share className="w-3.5 h-3.5" />
          <span>Install PWA</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-blue-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Install Stock Audit</h3>
                  <p className="text-xs text-slate-500">Add to iPhone or iPad Home Screen</p>
                </div>
              </div>
              <div className="space-y-3 text-sm text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <p className="flex items-start gap-2">
                  <span className="font-bold text-blue-700">1.</span>
                  <span>Tap the <strong>Share</strong> button in your Safari bottom navigation bar.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-bold text-blue-700">2.</span>
                  <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-bold text-blue-700">3.</span>
                  <span>Launch from home screen for fullscreen offline experience!</span>
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition min-h-[44px]"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
