import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { Card, CardBody, Badge, Spinner, Alert } from '../components/UI';

export default function Policies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    api.getPolicies()
      .then(setPolicies)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isActive = p => p.Active === 'Yes' || p.Active === 'TRUE' || p.Active === '1';
  const toggle = (i) => setExpanded(e => ({ ...e, [i]: !e[i] }));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
        <p className="text-gray-500 mt-1">Company policies with customer explanation guides. Managed in Google Sheets.</p>
      </div>

      <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        ✎ To add, edit, or deactivate policies, update the <strong>Policies</strong> tab in the CRIS Database Google Sheet.
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : policies.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No policies found. Add them to the Policies tab in Google Sheets.</div>
      ) : (
        <div className="space-y-3">
          {policies.map((p, i) => (
            <Card key={i} className={isActive(p) ? '' : 'opacity-60'}>
              <CardBody>
                <button
                  className="w-full text-left"
                  onClick={() => toggle(i)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-gray-900">{p.Policy}</span>
                        <Badge color={isActive(p) ? 'green' : 'gray'}>{isActive(p) ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      {p.Purpose && <p className="text-sm text-gray-600">{p.Purpose}</p>}
                    </div>
                    <span className="text-gray-400 text-sm">{expanded[i] ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expanded[i] && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                    {p.Description && (
                      <div>
                        <div className="text-xs font-bold text-gray-500 uppercase mb-1">Description</div>
                        <p className="text-sm text-gray-700">{p.Description}</p>
                      </div>
                    )}
                    {p.Core_Principle && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <div className="text-xs font-bold text-blue-600 uppercase mb-1">Core Principle</div>
                        <p className="text-sm text-blue-800">{p.Core_Principle}</p>
                      </div>
                    )}
                    {p.Customer_Explanation_Coaching_Guidance && (
                      <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                        <div className="text-xs font-bold text-green-700 uppercase mb-1">Customer Explanation Guide</div>
                        <p className="text-sm text-green-900 whitespace-pre-wrap">{p.Customer_Explanation_Coaching_Guidance}</p>
                      </div>
                    )}
                    {p.AI_Guidance && (
                      <div>
                        <div className="text-xs font-bold text-gray-500 uppercase mb-1">AI Guidance</div>
                        <p className="text-sm text-gray-700">{p.AI_Guidance}</p>
                      </div>
                    )}
                    {p.Escalation_Trigger && (
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                        <div className="text-xs font-bold text-amber-700 uppercase mb-1">⚠ Escalation Trigger</div>
                        <p className="text-sm text-amber-800">{p.Escalation_Trigger}</p>
                      </div>
                    )}
                    {p.Related_Programs && (
                      <div>
                        <div className="text-xs font-bold text-gray-500 uppercase mb-1">Related Programs</div>
                        <p className="text-sm text-gray-700">{p.Related_Programs}</p>
                      </div>
                    )}
                    {p.Examples_Common_Scenarios && (
                      <div>
                        <div className="text-xs font-bold text-gray-500 uppercase mb-1">Common Scenarios</div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.Examples_Common_Scenarios}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
