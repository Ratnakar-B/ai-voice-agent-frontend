import { useEffect, useRef, useState } from 'react';
import { Activity, AudioLines, Check, Clock3, Copy, Headphones, MessageSquareText, Search, UsersRound } from 'lucide-react';
import type { Agent, Conversation, ConversationDetail, ConversationFilters, Stats } from '../types';

type DateFilter = ConversationFilters['date'];
type StatusFilter = ConversationFilters['status'];

const durationInSeconds = (duration: string) => {
  const parts = duration.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length >= 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
};

const formatTalkTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

const formatMessageTime = (createdAt: string) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatDate = (conversation: Conversation) => {
  const date = new Date(conversation.startedAt ?? conversation.date);
  return Number.isNaN(date.getTime())
    ? conversation.date
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export function ConversationsPage({
  conversations,
  agents,
  stats,
  onGetConversations,
  onGetConversation,
}: {
  conversations: Conversation[];
  agents: Agent[];
  stats: Stats;
  onGetConversations: (filters: ConversationFilters) => Promise<Conversation[]>;
  onGetConversation: (conversationId: string) => Promise<ConversationDetail>;
}) {
  const [conversationList, setConversationList] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loadingId, setLoadingId] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('30');
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'insights'>('transcript');
  const [copied, setCopied] = useState(false);
  const requestId = useRef(0);
  const listRequestId = useRef(0);
  const selectedIdRef = useRef('');

  const openConversation = async (id: string) => {
    const request = ++requestId.current;
    selectedIdRef.current = id;
    setSelectedId(id);
    setSelectedConversation(null);
    setLoadingId(id);
    setErrorMessage('');
    setCopied(false);
    try {
      const detail = await onGetConversation(id);
      if (request === requestId.current) setSelectedConversation(detail);
    } catch (error) {
      if (request === requestId.current) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load this conversation.');
      }
    } finally {
      if (request === requestId.current) setLoadingId('');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const request = ++listRequestId.current;
    requestId.current += 1;
    setIsLoadingList(true);
    const timer = window.setTimeout(() => {
      setErrorMessage('');
      void onGetConversations({
        search: search.trim(),
        agent: agentFilter === 'all' ? '' : agentFilter,
        status: statusFilter,
        date: dateFilter,
      })
        .then((result) => {
          if (cancelled || request !== listRequestId.current) return;
          setConversationList(result);
          if (selectedIdRef.current && !result.some((conversation) => conversation.id === selectedIdRef.current)) {
            selectedIdRef.current = '';
            setSelectedId('');
            setSelectedConversation(null);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled && request === listRequestId.current) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not search conversations.');
          }
        })
        .finally(() => {
          if (!cancelled && request === listRequestId.current) setIsLoadingList(false);
        });
    }, search.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [agentFilter, dateFilter, onGetConversations, search, statusFilter]);

  useEffect(() => {
    if (isLoadingList || selectedId || !conversationList.length) return;
    const id = conversationList[0].id;
    const request = ++requestId.current;
    selectedIdRef.current = id;
    setSelectedId(id);
    setLoadingId(id);
    setErrorMessage('');
    void onGetConversation(id)
      .then((detail) => {
        if (request === requestId.current) setSelectedConversation(detail);
      })
      .catch((error: unknown) => {
        if (request === requestId.current) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load this conversation.');
        }
      })
      .finally(() => {
        if (request === requestId.current) setLoadingId('');
      });
  }, [conversationList, isLoadingList, onGetConversation, selectedId]);

  const completedCount = conversations.filter((conversation) => conversation.status === 'completed').length;
  const completionRate = conversations.length ? Math.round((completedCount / conversations.length) * 100) : 0;
  const totalTalkTime = conversations.reduce((total, conversation) => total + durationInSeconds(conversation.duration), 0);
  const activeAgents = agents.filter((agent) => agent.status === 'active').length;
  const messageCounts = selectedConversation?.messages.reduce(
    (counts, message) => {
      if (message.role === 'user') counts.user += 1;
      if (message.role === 'assistant') counts.agent += 1;
      return counts;
    },
    { user: 0, agent: 0 },
  ) ?? { user: 0, agent: 0 };

  const copyTranscript = async () => {
    if (!selectedConversation) return;
    const transcript = selectedConversation.messages
      .map((message) => `${message.role === 'user' ? 'You' : message.role === 'assistant' ? selectedConversation.agent : 'System'}: ${message.content}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not copy the transcript.');
    }
  };

  const selectedAgent = agents.find((agent) => agent.name === selectedConversation?.agent);

  return (
    <div className="conversations-page">
      <header className="conversations-header">
        <div>
          <p className="eyebrow">Voice AI operations</p>
          <h1>Conversations</h1>
          <p className="conversations-subtitle">Review your saved voice sessions and transcripts.</p>
        </div>
      </header>

      <section className="conversation-metrics" aria-label="Conversation statistics">
        <article className="conversation-metric">
          <span className="conversation-metric-icon violet"><MessageSquareText size={17} /></span>
          <div><span className="conversation-metric-label">Total conversations</span><strong>{stats.totalConversations.toLocaleString()}</strong></div>
          <span className="conversation-metric-note">saved sessions</span>
        </article>
        <article className="conversation-metric">
          <span className="conversation-metric-icon green"><Activity size={17} /></span>
          <div><span className="conversation-metric-label">Completion rate</span><strong>{completionRate}%</strong></div>
          <span className="conversation-metric-note">{completedCount} completed</span>
        </article>
        <article className="conversation-metric">
          <span className="conversation-metric-icon gold"><Clock3 size={17} /></span>
          <div><span className="conversation-metric-label">Total talk time</span><strong>{formatTalkTime(totalTalkTime)}</strong></div>
          <span className="conversation-metric-note">across saved sessions</span>
        </article>
        <article className="conversation-metric">
          <span className="conversation-metric-icon blue"><UsersRound size={17} /></span>
          <div><span className="conversation-metric-label">Active agents</span><strong>{activeAgents}</strong></div>
          <span className="conversation-metric-note">ready for calls</span>
        </article>
      </section>

      <div className="conversation-toolbar">
        <label className="conversation-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations..."
            aria-label="Search conversations"
          />
        </label>
        <label className="conversation-filter">
          <span className="sr-only">Filter by agent</span>
          <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>
            <option value="all">All agents</option>
            {Array.from(new Set(agents.map((agent) => agent.name))).sort((left, right) => left.localeCompare(right)).map((agentName) => (
              <option key={agentName} value={agentName}>{agentName}</option>
            ))}
          </select>
        </label>
        <label className="conversation-filter">
          <span className="sr-only">Filter by status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="active">Active</option>
          </select>
        </label>
        <label className="conversation-filter">
          <span className="sr-only">Filter by date</span>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <span className="conversation-results">{isLoadingList ? 'Searching…' : `${conversationList.length} results`}</span>
      </div>

      {errorMessage && <p className="conversation-error" role="alert">{errorMessage}</p>}

      <section className="conversation-workspace" aria-label="Conversation history">
        <div className="conversation-list-panel">
          <div className="conversation-list-heading">
            <div><h2>Recent calls</h2><p>Select a session to view its transcript</p></div>
            <span className="conversation-count">{conversationList.length}</span>
          </div>
          <div className="conversation-list">
            {conversationList.map((conversation) => {
              const isSelected = selectedId === conversation.id;
              return (
                <button
                  type="button"
                  key={conversation.id}
                  className={`conversation-list-row${isSelected ? ' selected' : ''}`}
                  onClick={() => void openConversation(conversation.id)}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="conversation-row-avatar"><Headphones size={17} /></span>
                  <span className="conversation-row-copy">
                    <span className="conversation-row-title">{conversation.agent}</span>
                    <span className="conversation-row-date">{formatDate(conversation)}</span>
                  </span>
                  <span className="conversation-row-meta">
                    <span className={`conversation-status ${conversation.status}`}>{conversation.status}</span>
                    <span className="conversation-row-duration">{conversation.duration}</span>
                  </span>
                </button>
              );
            })}
            {isLoadingList ? (
              <div className="conversation-empty-list"><strong>Searching conversations…</strong></div>
            ) : conversationList.length === 0 && (
              <div className="conversation-empty-list">
                <MessageSquareText size={22} />
                <strong>{conversations.length ? 'No matching conversations' : 'No conversations yet'}</strong>
                <span>{conversations.length ? 'Try adjusting your search or filters.' : 'Completed voice sessions will appear here.'}</span>
              </div>
            )}
          </div>
        </div>

        <div className="conversation-detail-panel">
          {selectedConversation ? (
            <>
              <div className="conversation-detail-header">
                <div className="conversation-detail-agent">
                  <span className="conversation-detail-avatar"><AudioLines size={18} /></span>
                  <div>
                    <h2>{selectedConversation.agent}</h2>
                    <p>{selectedAgent?.description || 'Browser voice conversation'} <span>·</span> {formatDate(selectedConversation)}</p>
                  </div>
                </div>
                <div className="conversation-detail-actions">
                  <button type="button" className="conversation-audio-button" disabled title="Audio recordings are not stored for browser conversations.">
                    <Headphones size={15} /> Audio unavailable
                  </button>
                  <button type="button" className="conversation-copy-button" onClick={() => void copyTranscript()} disabled={!selectedConversation.messages.length}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? 'Copied' : 'Copy transcript'}
                  </button>
                </div>
              </div>
              <div className="conversation-detail-meta">
                <span><Clock3 size={14} /> {selectedConversation.duration}</span>
                <span><Headphones size={14} /> Browser</span>
                <span className={`conversation-status ${selectedConversation.status}`}>{selectedConversation.status}</span>
              </div>
              <nav className="conversation-detail-tabs" aria-label="Conversation details">
                <button type="button" className={activeTab === 'transcript' ? 'active' : ''} onClick={() => setActiveTab('transcript')}>Transcript</button>
                <button type="button" className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>Call summary</button>
                <button type="button" className={activeTab === 'insights' ? 'active' : ''} onClick={() => setActiveTab('insights')}>Insights</button>
              </nav>
              <div className="conversation-detail-content">
                {loadingId === selectedId ? (
                  <div className="conversation-detail-empty">Loading saved transcript…</div>
                ) : activeTab === 'transcript' ? (
                  selectedConversation.messages.length ? (
                    <div className="conversation-transcript">
                      {selectedConversation.messages.map((message) => (
                        <article key={message.id} className={`conversation-message ${message.role}`}>
                          <span className="conversation-message-avatar">{message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AI' : 'SYS'}</span>
                          <div className="conversation-message-body">
                            <div className="conversation-message-heading">
                              <strong>{message.role === 'user' ? 'You' : message.role === 'assistant' ? selectedConversation.agent : 'System'}</strong>
                              <time>{formatMessageTime(message.createdAt)}</time>
                            </div>
                            <p>{message.content}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <div className="conversation-detail-empty">No transcript messages were saved for this call.</div>
                ) : activeTab === 'summary' ? (
                  <div className="conversation-summary-empty">
                    <span className="conversation-summary-icon"><MessageSquareText size={20} /></span>
                    <strong>No call summary available</strong>
                    <p>Summaries are not generated for saved calls yet. The transcript remains available in the Transcript tab.</p>
                  </div>
                ) : (
                  <div className="conversation-insights">
                    <div><span>Messages</span><strong>{selectedConversation.messages.length}</strong></div>
                    <div><span>Your messages</span><strong>{messageCounts.user}</strong></div>
                    <div><span>Agent responses</span><strong>{messageCounts.agent}</strong></div>
                    <div><span>Call duration</span><strong>{selectedConversation.duration}</strong></div>
                    <p>Insights are calculated from the saved transcript and call metadata.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="conversation-detail-empty">
              <span className="conversation-detail-empty-icon"><MessageSquareText size={23} /></span>
              <strong>{loadingId ? 'Loading conversation…' : 'Select a conversation'}</strong>
              <span>Choose a saved call to review its transcript and details.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
