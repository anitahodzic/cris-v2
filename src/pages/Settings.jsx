import React from 'react';

export default function Settings({ currentUser, isAdmin }) {
  // Guard — non-admins should never see this page
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Access Restricted</h2>
          <p className="text-gray-500 text-sm">Settings are only available to Administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage CRIS configuration. Changes save directly to Google Sheets.</p>
      </div>

      {/* Placeholder — settings content goes here in next build */}
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
        <div className="text-3xl mb-3">⚙️</div>
        <p className="font-medium text-gray-600">Settings editor coming soon</p>
        <p className="text-sm mt-1">Risk weights, score thresholds, and program rules will be editable here.</p>
      </div>
    </div>
  );
}
