import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewEvaluation from './pages/NewEvaluation';
import Report from './pages/Report';
import SearchEvaluations from './pages/SearchEvaluations';
import CustomerReport from './pages/CustomerReport';
// Programs and Policies are now tabs inside Settings
import Settings from './pages/Settings';
import MonthlyReport from './pages/MonthlyReport';
import AiChat from './pages/AiChat';
import AccountAudit from './pages/AccountAudit';
import AtRiskClients from './pages/AtRiskClients';
import CancellationDrivers from './pages/CancellationDrivers';
import CTPerformance from './pages/CTPerformance';
import CRISvsData from './pages/CRISvsData';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [activeEvalId, setActiveEvalId] = useState(null);
  const [activeAnalysis, setActiveAnalysis] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('cris_user');
      if (saved) setCurrentUser(JSON.parse(saved));
    } catch {
      sessionStorage.removeItem('cris_user');
    }
  }, []);

  const handleLogin = (user) => {
    sessionStorage.setItem('cris_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('cris_user');
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const isAdmin = currentUser.role === 'Admin';
  const commonProps = { setPage, setActiveEvalId, setActiveAnalysis, activeAnalysis, activeEvalId, currentUser, isAdmin };

  const renderPage = () => {
    switch (page) {
      case 'dashboard':       return <Dashboard {...commonProps} />;
      case 'new-evaluation':  return <NewEvaluation {...commonProps} />;
      case 'report':          return <Report {...commonProps} />;
      case 'search':          return <SearchEvaluations {...commonProps} />;
      case 'customer-report': return <CustomerReport {...commonProps} />;
      case 'programs':        return <Settings currentUser={currentUser} isAdmin={isAdmin} initialTab="programs" />;
      case 'policies':        return <Settings currentUser={currentUser} isAdmin={isAdmin} initialTab="policies" />;
      case 'settings':        return <Settings currentUser={currentUser} isAdmin={isAdmin} />;
      case 'monthly-report':  return <MonthlyReport />;
      case 'ai-chat':         return <AiChat currentUser={currentUser} />;
      case 'account-audit':   return <AccountAudit currentUser={currentUser} isAdmin={isAdmin} />;
      case 'at-risk':         return <AtRiskClients currentUser={currentUser} isAdmin={isAdmin} />;
      case 'cancellation-drivers':  return <CancellationDrivers />;
      case 'ct-performance':        return <CTPerformance />;
      case 'cris-vs-data':          return <CRISvsData />;
      default:                      return <Dashboard {...commonProps} />;
    }
  };

  return (
    <Layout page={page} setPage={setPage} onLogout={handleLogout} currentUser={currentUser} isAdmin={isAdmin}>
      {renderPage()}
    </Layout>
  );
}
