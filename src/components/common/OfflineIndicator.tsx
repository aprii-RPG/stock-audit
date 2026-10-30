import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { api } from '../../services/api';

export const OfflineIndicator: React.FC<{ onSyncCompleted?: () => void }> = ({ onSyncCompleted }) => {
  const isOnline = useOnlineStatus();
  const [unsyncedCount, setUnsyncedCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [justSynced, setJustSynced] = useState<boolean>(false);

  const checkUnsynced = async () => {
    try {
      const count = await api.getUnsyncedCount();
      setUnsyncedCount(count);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    checkUnsynced();
    const interval = setInterval(checkUnsynced, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    if (!isOnline) {
      alert('Cannot sync while offline. Reconnect to internet first.');
      return;
    }
    setIsSyncing(true);
    try {
      await api.syncOfflineData();
      await checkUnsynced();
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 3000);
      onSyncCompleted?.();
    } catch (err) {
      console.error('Sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isOnline && unsyncedCount === 0 && !justSynced) {
    return null;
  }

  return (
    <div className="fixed bottom-16 sm:bottom-4 left-4 right-4 sm:right-auto z-40 max-w-md mx-auto sm:mx-0">
      <div
        className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl shadow-lg border backdrop-blur-md transition-all ${
          !isOnline
            ? 'bg-amber-600/95 text-white border-amber-500'
            : justSynced
            ? 'bg-emerald-600/95 text-white border-emerald-500'
            : 'bg-[#0B3D91]/95 text-white border-blue-400'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {!isOnline ? (
            <WifiOff className="w-4 h-4 text-amber-200 animate-pulse shrink-0" />
          ) : justSynced ? (
            <CheckCircle className="w-4 h-4 text-emerald-200 shrink-0" />
          ) : (
            <RefreshCw className={`w-4 h-4 text-blue-200 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
          )}

          <div className="text-xs">
            {!isOnline ? (
              <span className="font-semibold">
                Offline Mode • {unsyncedCount} count(s) pending sync in local storage
              </span>
            ) : justSynced ? (
              <span className="font-semibold">All counts successfully synced!</span>
            ) : (
              <span className="font-semibold">{unsyncedCount} count(s) ready to sync</span>
            )}
          </div>
        </div>

        {isOnline && unsyncedCount > 0 && (
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white text-[#0B3D91] hover:bg-blue-50 active:scale-95 transition min-h-[36px] flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync now'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
