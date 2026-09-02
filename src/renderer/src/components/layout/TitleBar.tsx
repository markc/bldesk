import React, { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, Search, Key, ShieldCheck, Menu } from 'lucide-react'
import { AccountProfile } from '@shared/ipc-types'
import iconLogo from '../../assets/icon-logo-binarylane.png'
import { UpdateMenu } from './UpdateMenu'

interface TitleBarProps {
  activeProfile: AccountProfile | null
  profiles: Omit<AccountProfile, 'token'>[]
  onSwitchProfile: (id: string) => void
  onOpenAuth: () => void
  onOpenCommandPalette: () => void
  onToggleMobileDrawer?: () => void
}

export const TitleBar: React.FC<TitleBarProps> = ({
  activeProfile,
  profiles,
  onSwitchProfile,
  onOpenAuth,
  onOpenCommandPalette,
  onToggleMobileDrawer
}) => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (window.bldeskApi?.isMaximized) {
      window.bldeskApi.isMaximized().then(setIsMaximized)
    }
  }, [])

  const handleMinimize = () => window.bldeskApi?.minimizeWindow?.()
  const handleMaximize = async () => {
    if (window.bldeskApi?.maximizeWindow) {
      await window.bldeskApi.maximizeWindow()
      const max = await window.bldeskApi.isMaximized()
      setIsMaximized(max)
    }
  }
  const handleClose = () => window.bldeskApi?.closeWindow?.()

  return (
    <div className="titlebar-drag-region h-11 w-full bg-[#343a40] text-[#f8f9fa] border-b border-black/20 flex items-center justify-between px-3 select-none z-50 flex-shrink-0">
      {/* Brand & Mobile Drawer Toggle */}
      <div className="flex items-center gap-2.5">
        {onToggleMobileDrawer && (
          <button
            onClick={onToggleMobileDrawer}
            className="md:hidden text-slate-300 hover:text-white p-1 rounded hover:bg-white/10 transition"
            title="Open Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2 font-bold tracking-wide text-sm">
          <img src={iconLogo} alt="BinaryLane" className="h-5 w-auto object-contain" />
          <span>
            <span className="text-[#f1ca00]">binary</span>
            <span className="text-white">lane</span>{' '}
            <span className="text-xs font-normal text-slate-300/90 bg-black/30 px-1.5 py-0.5 rounded border border-white/10 font-mono">
              BLDesk v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.28'}
            </span>
          </span>
        </div>
      </div>

      {/* Global Command Palette Trigger */}
      <div className="titlebar-no-drag flex items-center">
        {/* Desktop Search Bar */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden sm:flex items-center gap-2 px-3 py-1 text-xs text-slate-300 bg-black/25 hover:bg-black/40 border border-white/10 hover:border-white/20 rounded-md transition shadow-inner"
        >
          <Search className="w-3.5 h-3.5 text-slate-300" />
          <span>Search servers, DNS, actions...</span>
          <kbd className="ml-3 px-1.5 py-0.5 text-[10px] bg-black/40 text-slate-300 rounded border border-white/10 font-mono">
            Ctrl+K
          </kbd>
        </button>

        {/* Mobile Search Icon Button */}
        <button
          onClick={onOpenCommandPalette}
          className="sm:hidden p-1.5 text-slate-300 hover:text-white bg-black/20 rounded-md border border-white/10"
          title="Search"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Profile & Window Controls */}
      <div className="titlebar-no-drag flex items-center gap-2">
        {/* Version / Auto-update */}
        <div className="flex items-center">
          <UpdateMenu />
        </div>

        {/* Profile Switcher / Auth Button */}
        {activeProfile ? (
          <div className="flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-md px-2 py-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={activeProfile.id}
              onChange={(e) => onSwitchProfile(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium outline-none cursor-pointer pr-1 max-w-[130px] truncate"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#343a40] text-slate-100">
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={onOpenAuth}
              title="Add or Manage Profiles"
              className="text-slate-400 hover:text-[#f1ca00] p-0.5 transition"
            >
              <Key className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-[#017cb6] hover:bg-[#016594] rounded-md transition shadow"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Connect</span>
          </button>
        )}

        {/* Window Action Controls (Desktop Only) */}
        <div className="hidden md:flex items-center ml-2 border-l border-white/10 pl-2">
          <button
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 rounded transition"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 rounded transition"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-rose-600 rounded transition"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
