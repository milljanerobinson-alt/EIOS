/**
 * EWO-044 — Codex-Native ATD Conversation Engine
 *
 * ATD Conversation Panel — the Product Owner's conversational interface with ATD.
 * The PO sees a single assistant: ATD. The configured provider is invisible.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  MessageSquare, Loader2, Send, AlertTriangle, CheckCircle2,
  XCircle, Info, ChevronDown, Sparkles, Shield,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { processConversation, type ConversationMessage, type GatewayResponse } from '../../lib/eios/conversationGateway';
import type { StructuredProviderResponse } from '../../lib/eios/providerContract';

interface ChatMessage {
  id: string;
  role: 'user' | 'atd';
  content: string;
  response?: StructuredProviderResponse;
  auditRef?: string;
  timestamp: string;
}

const EXAMPLE_PROMPTS = [
  'Morning ATD.',
  'Continue the dashboard work.',
  'Why did the last execution fail?',
  'Create an EWO for this issue.',
  'Inspect the repository.',
  'What files would you modify?',
  'Prepare the execution.',
  'Execute after my approval.',
];

export function ATDConversationPanel({ conversationId }: { conversationId?: string }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convId = useRef<string>(conversationId ?? `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput('');
    setLoading(true);
    setError(null);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const history: ConversationMessage[] = messages
        .filter((m) => m.role === 'user' || m.role === 'atd')
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        }));

      const response: GatewayResponse = await processConversation({
        message: userMessage,
        conversationId: convId.current,
        history,
        userId: user?.id ?? '',
        userRole: profile?.role ?? 'user',
        tenantId: null,
        projectId: null,
        ewoRef: null,
      });

      const atdMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: 'atd',
        content: response.response.user_facing_message,
        response: response.response,
        auditRef: response.auditReference,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, atdMsg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, user, profile]);

  const handleExample = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-[600px] rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-slate-50">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">ATD</h3>
          <p className="text-[10px] text-slate-500">Engineering Intelligence Assistant</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400">
          <Shield className="w-3 h-3" />
          <span>Governed by EIOS</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-sm text-slate-500">Start a conversation with ATD.</p>
            <p className="text-xs text-slate-400">Ask engineering questions, create EWOs, inspect repositories, or prepare executions.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-800'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.response?.clarification_required && msg.response.clarification_question && (
                <p className="mt-1 text-xs italic opacity-80">{msg.response.clarification_question}</p>
              )}
              {msg.response?.warnings && msg.response.warnings.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {msg.response.warnings.map((w, i) => (
                    <p key={i} className="text-xs flex items-start gap-1 text-amber-600">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
              {msg.auditRef && (
                <div className="mt-1 text-[10px] opacity-50 font-mono">
                  Audit: {msg.auditRef}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              <span className="text-sm text-slate-500">ATD is thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Example prompts */}
      {messages.length === 0 && (
        <div className="px-4 py-2 border-t border-slate-100">
          <div className="flex flex-wrap gap-1">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => handleExample(p)}
                className="px-2 py-1 text-[10px] rounded-full bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-200 px-3 py-2 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Message ATD..."
          rows={1}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-32"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !input.trim()}
          className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
