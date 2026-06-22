'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { WifiOff, Phone, MapPin, RotateCw } from 'lucide-react'

export default function OfflinePage() {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 px-4 font-sans select-none antialiased selection:bg-indigo-500/20 selection:text-indigo-200">
      <div className="max-w-md w-full text-center space-y-8 p-8 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl animate-fade-slide-up">
        
        {/* Crest/Logo Header */}
        <div className="flex flex-col items-center space-y-3">
          <div className="relative w-24 h-24 p-2 bg-slate-850 border border-slate-700 rounded-xl flex items-center justify-center">
            <Image
              src="/brand/logo-icon.svg"
              alt="EverShine Academy Crest"
              width={80}
              height={80}
              priority
              className="object-contain animate-float"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-black text-white tracking-tight font-heading">
              EverShine Academy LMS
            </h1>
            <p className="text-indigo-400 font-bold text-xs uppercase tracking-widest">
              Portal Offline
            </p>
          </div>
        </div>

        {/* Offline Warning Card */}
        <div className="p-6 bg-slate-900/60 border border-slate-850 rounded-xl space-y-4">
          <div className="inline-flex items-center justify-center p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full animate-pulse">
            <WifiOff className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-bold text-white">
              Connection Interrupted
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed font-medium">
              We couldn't reach the server. This portal works offline, but the page you requested isn't in your local cache yet.
            </p>
          </div>
        </div>

        {/* Troubleshooting List */}
        <div className="text-left space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">
            Quick Checks
          </h3>
          <ul className="space-y-2 text-xs font-medium text-slate-300">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              Verify your Wi-Fi or cellular network state.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              Check if airplane mode is enabled on your device.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              Try reloading once you have restored signals.
            </li>
          </ul>
        </div>

        {/* Action Button */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg border border-indigo-500 transition-all cursor-pointer"
        >
          <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Reconnecting...' : 'Try Reconnecting'}
        </button>

        {/* Institutional Directory Info */}
        <div className="border-t border-slate-700/50 pt-5 space-y-3 text-slate-400 text-left">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Academy Contact Directory
          </h3>
          <div className="space-y-2 text-xs font-medium">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span className="text-[11px] leading-snug">
                Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony, Gujranwala
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="text-[11px] font-mono">
                Boys: 0328-4010522 · Girls: 0324-8985526
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
