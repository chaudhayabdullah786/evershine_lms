'use client'

import { useEffect } from 'react'
import { notify } from '@/lib/notify'

export function PWARegister() {
  useEffect(() => {
    // WHY skip in dev: Service workers cache JS chunks with Cache-First strategy.
    // In development, Turbopack regenerates chunks after every code change.
    // Cached stale chunks cause "module factory not available" errors.
    if (process.env.NODE_ENV !== 'production') return;

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registerSW = () => {
        const swUrl = '/sw.js';
        navigator.serviceWorker
          .register(swUrl)
          .then((registration) => {
            console.log('[PWA] Service Worker registered with scope:', registration.scope);

            // Listen for service worker updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // A new service worker version has been installed, inform user to reload
                    notify.info('New Version Available', {
                      description: 'A new update of the LMS is ready. Click to refresh.',
                      action: {
                        label: 'Refresh',
                        onClick: () => {
                          window.location.reload();
                        }
                      },
                      duration: 8000
                    });
                  }
                });
              }
            });
          })
          .catch((error) => {
            console.error('[PWA] Service Worker registration failed:', error);
          });
      };

      // Register the service worker on window load
      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }

      // Track connectivity events and alert user dynamically
      const handleOnline = () => {
        notify.success('Connection Restored', {
          description: 'You are back online. All systems are synchronized.',
          duration: 4000
        });
      };

      const handleOffline = () => {
        notify.warning('Working Offline', {
          description: 'You are currently offline. Critical pages and actions will fall back to cached views.',
          duration: 6000
        });
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('load', registerSW);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  return null;
}
