import React, { useState, useRef, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

const STARTERS = [
  "Who are my top 5 highest-risk clients right now?",
  "Which clients haven't been contacted in over 30 days?",
  "How many clients have a scorecard average below 3.0?",
  "Which bi-weekly clients are most at risk of cancelling?",
  "Show me clients who have cancelled before and came back",
  "What frequency of service do most of our clients have?",
  "Which clients have had no job in the last 60 days?",
  "How many active clients do we have total?",
];

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 mb-4">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a5f)' }}>
        <img src="/mascot-spray.png" alt="" className="w-6 h-6 object-contain" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm" style={{ background: '#f1f5f9' }}>
        <div className="flex items-center gap-1.5 h-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-blue-400"
              style={{ animation: `cris-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-end gap-3 mb-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
          style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}>
          U
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a5f)' }}>
          <img src="/mascot-spray.png" alt="CRIS" className="w-6 h-6 object-contain" />
        </div>
      )}
      <div className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
        style={isUser
          ? { background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', color: '#fff', borderBottomRightRadius: 4, maxWidth: '70%' }
          : { background: '#f1f5f9', color: '#1e293b', borderBottomLeftRadius: 4, maxWidth: '80%' }
        }>
        {msg.content}
      </div>
    </div>
  );
}

export default function AiChat({ currentUser }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hey${currentUser?.username ? ` ${currentUser.username.split(' ')[0]}` : ''}! 👋 I'm CRIS — your Client Retention Intelligence System.\n\nI have live access to your MaidCentral client data, scorecards, and cancellation history. Ask me anything about your clients, risk trends, or retention strategies.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    setError('');

    const userMsg = { role: 'user', content: q };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/api/ask-cris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, messages: newMsgs }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setError(e.message);
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I ran into an error: ${e.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => textRef.current?.focus(), 100);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 0px)', minHeight: 500 }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center gap-4 flex-shrink-0">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a5f)' }}>
          <img src="/mascot-spray.png" alt="CRIS" className="w-8 h-8 object-contain" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-gray-900">Ask CRIS</h1>
          <p className="text-xs text-gray-400">AI chat with live MaidCentral data · Powered by Claude</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-400 font-medium">Live data</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Starter chips — only after greeting */}
      {messages.length === 1 && !loading && (
        <div className="px-4 sm:px-6 pb-2 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs text-gray-400 mb-2 font-medium">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.slice(0, 6).map((s, i) => (
                <button key={i} onClick={() => send(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                  style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1d4ed8'; e.currentTarget.style.color = '#1d4ed8'; e.currentTarget.style.background = '#eff6ff'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = '#f8fafc'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="flex gap-3 items-end">
            <textarea
              ref={textRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about a client, trend, or strategy…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ minHeight: 48, maxHeight: 160, lineHeight: '1.5', overflowY: 'auto' }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all text-white disabled:opacity-40"
              style={{ background: input.trim() && !loading ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#e2e8f0' }}
              title="Send (Enter)"
            >
              {loading ? (
                <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke={input.trim() ? '#fff' : '#94a3b8'} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">Enter to send · Shift+Enter for new line · Data refreshes every 5 min</p>
        </div>
      </div>

      <style>{`
        @keyframes cris-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
