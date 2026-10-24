import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Card, CardBody, Badge, Spinner, Alert } from '../components/UI';

export default function Programs() {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.getPrograms()
      .then(setPrograms)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isActive = p => p.Active === 'Yes' || p.Active === 'TRUE' || p.Active === '1';
  const filtered = filter === 'all' ? programs : filter === 'active' ? programs.filter(isActive) : programs.filter(p => !isActive(p));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
          <p className="text-gray-500 mt-1">Active save programs and offers. Managed in Google Sheets.</p>
        </div>
        <div className="flex gap-2">
          {['all', 'active', 'inactive'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors
                ${filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        ✎ To add, edit, or deactivate programs, update the <strong>Programs</strong> tab in the CRIS Database Google Sheet. Changes take effect immediately on next analysis.
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No programs found.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((p, i) => (
            <Card key={i} className={isActive(p) ? '' : 'opacity-60'}>
              <CardBody>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{p.Program_Name}</span>
                    <Badge color={isActive(p) ? 'green' : 'gray'}>{isActive(p) ? 'Active' : 'Inactive'}</Badge>
                    {p.Category && <Badge color="blue">{p.Category}</Badge>}
                    {p.Approval_Required === 'Yes' && <Badge color="orange">Approval Required</Badge>}
                    {p.Priority && <span className="text-xs text-gray-500">Priority: {p.Priority}</span>}
                  </div>
                  {p.Program_ID && <span className="text-xs font-mono text-gray-400">{p.Program_ID}</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {p.Purpose && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-1">Purpose</div>
                      <p className="text-gray-700">{p.Purpose}</p>
                    </div>
                  )}
                  {p.When_To_Use && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-1">When to Use</div>
                      <p className="text-gray-700">{p.When_To_Use}</p>
                    </div>
                  )}
                  {p.Discount_Or_Offer && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-1">Offer / Discount</div>
                      <p className="text-gray-700 font-semibold">{p.Discount_Or_Offer}</p>
                    </div>
                  )}
                  {p.Duration && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-1">Duration</div>
                      <p className="text-gray-700">{p.Duration}</p>
                    </div>
                  )}
                </div>

                {p.Notes && (
                  <div className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">{p.Notes}</div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
