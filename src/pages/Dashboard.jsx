import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Card, CardBody, Btn, Spinner, Alert } from '../components/UI';

function StatCard({ label, value, color = 'blue', sub }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-sm font-semibold">{label}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ setPage, setActiveEvalId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getDashboard()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Client Relationship Intelligence System — {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
      </div>

      {error && <Alert type="error" className="mb-6">{error}</Alert>}

      {/* Stats */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard label="Evaluations This Month" value={stats?.total_evaluations ?? 0} color="blue" />
          <StatCard label="Clients Saved" value={stats?.saved ?? 0} color="green" sub="this month" />
          <StatCard label="Cancelled" value={stats?.cancelled ?? 0} color="red" sub="this month" />
          <StatCard label="Pending Follow-Up" value={stats?.pending ?? 0} color="yellow" />
          <StatCard label="Revenue Saved" value={stats ? fmt(stats.revenue_saved) : '$0'} color="purple" sub="this month" />
        </div>
      )}

      {/* Quick Actions */}
      <Card className="mb-6">
        <CardBody>
          <h2 className="text-base font-bold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ActionCard
              title="New Client Evaluation"
              desc="A client has said they want to cancel or reduce service"
              icon="+"
              color="blue"
              onClick={() => setPage('new-evaluation')}
            />
            <ActionCard
              title="Search Evaluations"
              desc="Find a past evaluation by client name, ID, or date"
              icon="⌕"
              color="gray"
              onClick={() => setPage('search')}
            />
            <ActionCard
              title="Customer Report"
              desc="View complete history and AI analysis for a client"
              icon="⊙"
              color="gray"
              onClick={() => setPage('customer-report')}
            />
          </div>
        </CardBody>
      </Card>

      {/* Reference */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardBody className="text-center">
            <div className="text-2xl mb-2">⊟</div>
            <div className="font-semibold text-gray-800 mb-1">Programs</div>
            <p className="text-xs text-gray-500 mb-3">View active save programs and offers</p>
            <Btn variant="secondary" size="sm" onClick={() => setPage('programs')}>View Programs</Btn>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="text-2xl mb-2">⊠</div>
            <div className="font-semibold text-gray-800 mb-1">Policies</div>
            <p className="text-xs text-gray-500 mb-3">Review policies and client explanation guides</p>
            <Btn variant="secondary" size="sm" onClick={() => setPage('policies')}>View Policies</Btn>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="text-2xl mb-2">↑</div>
            <div className="font-semibold text-gray-800 mb-1">Monthly Report</div>
            <p className="text-xs text-gray-500 mb-3">Save rates, revenue, program performance</p>
            <Btn variant="secondary" size="sm" onClick={() => setPage('monthly-report')}>View Report</Btn>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ActionCard({ title, desc, icon, color, onClick }) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
    gray: 'border-gray-200 bg-gray-50 hover:bg-gray-100',
  };
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border transition-colors ${colors[color]}`}
    >
      <div className="text-xl mb-2">{icon}</div>
      <div className="font-semibold text-gray-900 text-sm mb-1">{title}</div>
      <div className="text-xs text-gray-500">{desc}</div>
    </button>
  );
}
