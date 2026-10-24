import React, { useState, useRef, useEffect } from 'react';

const BASE = process.env.REACT_APP_API_URL || '';

export default function AiChat({ currentUser }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm CRIS. Ask me anything about your cancellation cases, retention programs, client trends, or how to handle a specific situation.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          username: currentUser?.username,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed');
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${e.message}` }]);
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const suggestions = [
    'What programs should I offer a price-sensitive long-term client?',
    'Show me best practices for handling quality complaints',
    'How do I calculate if a client is worth saving?',
    'What are the most common cancellation reasons?',
  ];

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Ask CRIS</h1>
        <p className="text-sm text-gray-500">AI assistant for retention strategy and client guidance</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-gray-50">
        {messages.length === 1 && (
          <div className="mb-6">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3 px-2">Suggested questions</p>
            <div className="grid grid-cols-1 gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(s); }}
                  className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1.5 items-center h-5">
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 bg-white border-t border-gray-200 flex-shrink-0">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <textarea
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
            placeholder="Ask CRIS anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors self-end"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
