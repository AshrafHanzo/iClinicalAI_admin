import { useState, useRef, useEffect } from 'react';

export default function ChatInterface({ docId, onSendMessage, messages, isLoading, embedded = false }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const suggestions = [
    'Summarize Protocol',
    'Review Inclusion Criteria',
    'Review Exclusion Criteria',
    'Identify Protocol Gaps',
    'Assess Recruitment Challenges',
    'Evaluate Study Feasibility',
    'Highlight Regulatory Considerations',
  ];

  if (!docId) {
    if (embedded) {
      return (
        <div className="analysis-placeholder" style={{ padding: '40px 20px' }}>
          <span className="placeholder-icon">💬</span>
          <h4>Upload a document first</h4>
          <p>Ask questions about your clinical document</p>
        </div>
      );
    }
    return (
      <div className="card">
        <div className="card-header"><h3>💬 Chat with Document</h3></div>
        <div className="analysis-placeholder">
          <span className="placeholder-icon">💬</span>
          <h4>Upload a document first</h4>
          <p>Ask questions about your clinical document</p>
        </div>
      </div>
    );
  }

  const chatContent = (
    <div className="chat-container" style={{ border: embedded ? 'none' : undefined }}>
      <div className="chat-messages" style={{ minHeight: embedded ? '350px' : undefined, maxHeight: '500px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 20px' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>Ask questions about your uploaded document</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {suggestions.map(q => (
                <button
                  key={q}
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setInput(q); }}
                  style={{ fontSize: 12 }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
            <div className="chat-bubble">
              {msg.content.split('\n').map((line, j) => (
                <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-message assistant">
            <div className="chat-avatar">🤖</div>
            <div className="chat-bubble">
              <div className="typing-dots"><span></span><span></span><span></span></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your clinical document..."
          disabled={isLoading}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={!input.trim() || isLoading}>
          Send
        </button>
      </div>
    </div>
  );

  if (embedded) {
    return chatContent;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="card-header" style={{ padding: '16px 20px', margin: 0, borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
        <h3>💬 Chat with Document</h3>
        <span className="status-badge success">● Connected</span>
      </div>
      {chatContent}
    </div>
  );
}
