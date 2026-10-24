import React, { useState } from 'react';

const NAV_ITEMS = [
  { id: 'dashboard',       label: 'Dashboard',        icon: '⊞', adminOnly: false },
  { id: 'new-evaluation',  label: 'New Evaluation',   icon: '+',  adminOnly: false },
  { id: 'search',          label: 'Search',           icon: '⌕', adminOnly: false },
  { id: 'customer-report', label: 'Customer Report',  icon: '⊙', adminOnly: false },
  { id: 'programs',        label: 'Programs',         icon: '⊟', adminOnly: false },
  { id: 'policies',        label: 'Policies',         icon: '⊠', adminOnly: false },
  { id: 'monthly-report',  label: 'Monthly Report',   icon: '↑', adminOnly: false },
  { id: 'settings',        label: 'Settings',         icon: '⚙', adminOnly: true  },
];

export default function Layout({ page, setPage, onLogout, children, currentUser, isAdmin }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col
        transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">C</div>
            <div>
              <div className="text-sm font-bold text-white">CRIS</div>
              <div className="text-xs text-slate-400">BA House Cleaning</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map(item => (
            <button
              key={item.id}
              onClick={() => { setPage(item.id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left
                ${page === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {currentUser?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{currentUser?.username}</div>
              <div className="text-xs text-slate-400">{currentUser?.role}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
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
          <span className="font-semibold text-gray-800">CRIS</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
