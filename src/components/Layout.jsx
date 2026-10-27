import React, { useState } from 'react';

const NAV_GROUPS = [
  {
    label: 'WORKSPACE',
    items: [
      { id: 'dashboard',       label: 'Dashboard',              icon: '⊞' },
      { id: 'new-evaluation',  label: 'Cancellation Request',   icon: '+' },
      { id: 'search',          label: 'Search',                 icon: '⌕' },
      { id: 'ai-chat',         label: 'Ask CRIS',               icon: '✦' },
    ],
  },
  {
    label: 'CLIENT HEALTH',
    items: [
      { id: 'at-risk',         label: 'At-Risk Clients',        icon: '⚠' },
      { id: 'account-audit',   label: 'Account Audit',          icon: '◎' },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { id: 'customer-report',        label: 'Client Report',        icon: '⊙' },
      { id: 'monthly-report',        label: 'Monthly Report',       icon: '↑' },
      { id: 'ct-performance',        label: 'Cancelled by Tech',    icon: '🔍' },
      { id: 'cancellation-drivers',  label: 'Cancel Drivers',       icon: '⊗' },
      { id: 'cris-vs-data',          label: 'CRIS vs Data',         icon: '◈' },
    ],
  },
  {
    label: 'CONFIGURE',
    items: [
      { id: 'settings',        label: 'Settings',               icon: '⚙', adminOnly: true },
    ],
  },
];

export default function Layout({ page, setPage, onLogout, children, currentUser, isAdmin }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 flex flex-col
        transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `} style={{ background: 'linear-gradient(180deg, #0f172a 0%, #0c1a2e 100%)' }}>

        {/* Logo / Brand */}
        <div className="px-4 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            {/* Mascot */}
            <div className="relative w-12 h-14 flex-shrink-0">
              <img
                src="/mascot-spray.png"
                alt="BAHC Mascot"
                className="w-full h-full object-contain"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
              />
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight" style={{ color: '#4ade80', letterSpacing: '-0.02em' }}>CRIS</div>
              <div className="text-xs font-medium text-slate-400 leading-tight">BA House Cleaning</div>
              <div className="text-xs text-slate-500 leading-tight">Client Intelligence</div>
            </div>
          </div>
        </div>

        {/* Nav Groups */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {NAV_GROUPS.map(group => {
            const visibleItems = group.items.filter(item => !item.adminOnly || isAdmin);
            if (!visibleItems.length) return null;
            return (
              <div key={group.label}>
                <div className="px-2 mb-1" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#475569' }}>
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {visibleItems.map(item => {
                    const active = page === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setPage(item.id); setMobileOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left`}
                        style={active ? {
                          background: 'linear-gradient(90deg, #1d4ed8 0%, #2563eb 100%)',
                          color: '#fff',
                          boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
                        } : {
                          color: '#94a3b8',
                        }}
                        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0'; } }}
                        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; } }}
                      >
                        <span className="w-5 text-center text-base" style={{ opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                        {item.label}
                        {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-slate-700/60">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1d4ed8, #16a34a)' }}>
              {currentUser?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{currentUser?.username}</div>
              <div className="text-xs text-slate-400">{currentUser?.role}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
            style={{ ':hover': { background: 'rgba(255,255,255,0.06)' } }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            ↩ Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <img src="/mascot-spray.png" alt="" className="w-7 h-7 object-contain" />
            <span className="font-bold text-gray-800" style={{ color: '#1d4ed8' }}>CRIS</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
