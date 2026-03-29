/**
 * useNetworkStatus — Hook to detect internet connectivity.
 * Uses expo-network to monitor connection state.
 * Returns isConnected and isInternetReachable.
 */
import { useState, useEffect, useCallback } from 'react';
import * as Network from 'expo-network';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean;
}

let _cachedStatus: NetworkStatus = {
  isConnected: true,
  isInternetReachable: true,
};

const _listeners = new Set<(status: NetworkStatus) => void>();

let _polling = false;
let _pollInterval: ReturnType<typeof setInterval> | null = null;

async function checkNetwork(): Promise<NetworkStatus> {
  try {
    const state = await Network.getNetworkStateAsync();
    const status: NetworkStatus = {
      isConnected: state.isConnected ?? true,
      isInternetReachable: state.isInternetReachable ?? state.isConnected ?? true,
    };

    const changed =
      status.isConnected !== _cachedStatus.isConnected ||
      status.isInternetReachable !== _cachedStatus.isInternetReachable;

    _cachedStatus = status;

    if (changed) {
      _listeners.forEach((cb) => cb(status));
    }

    return status;
  } catch {
    return _cachedStatus;
  }
}

function startPolling() {
  if (_polling) return;
  _polling = true;
  // Check every 5 seconds
  _pollInterval = setInterval(() => {
    checkNetwork();
  }, 5000);
  // Also check immediately
  checkNetwork();
}

function stopPolling() {
  _polling = false;
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(_cachedStatus);

  useEffect(() => {
    // Register listener
    const listener = (newStatus: NetworkStatus) => {
      setStatus({ ...newStatus });
    };
    _listeners.add(listener);

    // Start polling if first listener
    if (_listeners.size === 1) {
      startPolling();
    }

    // Initial check
    checkNetwork().then((s) => setStatus({ ...s }));

    return () => {
      _listeners.delete(listener);
      if (_listeners.size === 0) {
        stopPolling();
      }
    };
  }, []);

  return status;
}

/** Get current network status without a hook (for services). */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  return checkNetwork();
}

/** Get the last known cached status synchronously. */
export function getCachedNetworkStatus(): NetworkStatus {
  return _cachedStatus;
}
