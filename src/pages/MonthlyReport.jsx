import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Card, CardBody, Spinner, Alert } from '../components/UI';

export default function MonthlyReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.getMonthlyReport(month, year);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year]);

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const years = [2024, 2025, 2026, 2027];

  const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${Number(n || 0).toFixed(0)}`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monthly Report</h1>
          <p className="text-gray-500 mt-1">Summary of evaluations, outcomes, and performance.</p>
        </div>
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
            {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !data ? null : (
        <div className="space-y-6">
          {/* Top stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Evaluations" value={data.total_evaluations} color="blue" />
            <StatCard label="Clients Saved" value={data.by_outcome?.Saved || 0} color="green" />
            <StatCard label="Cancelled" value={data.by_outcome?.Cancelled || 0} color="red" />
            <StatCard label="Save Rate" value={`${data.save_rate}%`} color="purple" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label="Revenue Saved" value={fmt(data.revenue_saved)} color="green" large />
            <StatCard label="Pending / Follow-Up" value={(data.by_outcome?.Pending || 0) + (data.by_outcome?.['Follow-Up Needed'] || 0)} color="yellow" large />
          </div>

          {/* By Outcome */}
          <Card>
            <CardBody>
              <h3 className="font-bold text-gray-800 mb-4">Outcomes Breakdown</h3>
              {Object.keys(data.by_outcome || {}).length === 0 ? (
                <p className="text-sm text-gray-500">No outcomes recorded this month.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(data.by_outcome).map(([outcome, count]) => {
                    const total = data.total_evaluations || 1;
                    const pct = Math.round((count / total) * 100);
                    const colors = { Saved: 'bg-green-500', Cancelled: 'bg-red-500', Pending: 'bg-yellow-500', Escalated: 'bg-orange-500' };
                    return (
                      <div key={outcome}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{outcome}</span>
                          <span className="text-gray-500">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[outcome] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* By Program */}
          <Card>
            <CardBody>
              <h3 className="font-bold text-gray-800 mb-4">Program Performance</h3>
              {Object.keys(data.by_program || {}).length === 0 ? (
                <p className="text-sm text-gray-500">No programs offered this month.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {Object.entries(data.by_program).sort(([,a],[,b]) => b-a).map(([prog, count]) => (
                    <div key={prog} className="py-2.5 flex justify-between text-sm">
                      <span className="text-gray-700">{prog}</span>
                      <span className="font-bold text-gray-900">{count}×</span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Staff Performance */}
          <Card>
            <CardBody>
              <h3 className="font-bold text-gray-800 mb-4">Staff Performance</h3>
              {Object.keys(data.by_staff || {}).length === 0 ? (
                <p className="text-sm text-gray-500">No staff data this month.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  <div className="pb-2 grid grid-cols-4 gap-2 text-xs font-bold text-gray-500 uppercase">
                    <span>Staff Member</span><span className="text-center">Total</span><span className="text-center">Saved</span><span className="text-center">Save Rate</span>
                  </div>
                  {Object.entries(data.by_staff).sort(([,a],[,b]) => b.total-a.total).map(([name, s]) => (
                    <div key={name} className="py-2.5 grid grid-cols-4 gap-2 text-sm">
                      <span className="font-medium text-gray-800">{name}</span>
                      <span className="text-center text-gray-600">{s.total}</span>
                      <span className="text-center text-green-600 font-medium">{s.saved}</span>
                      <span className="text-center text-gray-600">{s.total > 0 ? Math.round((s.saved/s.total)*100) : 0}%</span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, large }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className={`font-bold mb-1 ${large ? 'text-3xl' : 'text-3xl'}`}>{value}</div>
      <div className="text-sm font-semibold">{label}</div>
    </div>
  );
}
