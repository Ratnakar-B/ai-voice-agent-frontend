import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AgentsPage } from './pages/AgentsPage';
import { AuthPage } from './pages/AuthPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { DashboardPage } from './pages/DashboardPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { SettingsPage } from './pages/SettingsPage';
import { VoicePlaygroundPage } from './pages/VoicePlaygroundPage';
import type { Agent, AgentFilters, Conversation, ConversationDetail, ConversationFilters, DocumentFilters, DocumentItem, Stats, User, VoiceSession } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';
const apiClient = axios.create({ baseURL: API_BASE });
apiClient.interceptors.request.use((request) => {
  const token = localStorage.getItem('voicepilot-token');
  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  } else {
    delete request.headers.Authorization;
  }
  return request;
});

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { message?: string } | undefined;
    return body?.message ?? (error.code === 'ERR_NETWORK' ? 'Cannot connect to the API server.' : error.message);
  }
  return error instanceof Error ? error.message : fallback;
};

const normalizeConversation = (entry: any): Conversation => {
  const startedAt = entry.startedAt ?? entry.date;
  return {
    id: String(entry.id ?? entry._id ?? 'conversation'),
    agent: entry.agentName ?? entry.agent ?? 'Voice agent',
    date: startedAt ? new Date(startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Recently',
    startedAt,
    duration: entry.duration ?? '00:00',
    status: entry.status ?? 'completed',
  };
};

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('voicepilot-user');
    return saved ? (JSON.parse(saved) as User) : null;
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalAgents: 0,
    activeAgents: 0,
    totalConversations: 0,
    totalMinutes: 0,
  });
  const [transcript, setTranscript] = useState<string[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) {
      setUser(null);
      return;
    }

    apiClient
      .get('/api/auth/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        const nextUser = response.data as User;
        setUser(nextUser);
        localStorage.setItem('voicepilot-user', JSON.stringify(nextUser));
      })
      .catch(() => {
        localStorage.removeItem('voicepilot-token');
        localStorage.removeItem('voicepilot-user');
        setUser(null);
      });
  }, []);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('voicepilot-token');
    if (!token) return;

    Promise.all([
      apiClient.get('/api/agents', { headers: { Authorization: `Bearer ${token}` } }),
      apiClient.get('/api/documents', { headers: { Authorization: `Bearer ${token}` } }),
      apiClient.get('/api/conversations', { headers: { Authorization: `Bearer ${token}` } }),
      apiClient.get('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(([agentsResponse, documentsResponse, conversationsResponse, statsResponse]) => {
        const nextAgents = (agentsResponse.data as Agent[]).map((agent) => ({
          ...agent,
          status: agent.status ?? 'active',
          conversationCount: agent.conversationCount ?? 0,
          lastActive: agent.lastActive ?? 'just now',
        }));

        const nextDocuments = (documentsResponse.data as DocumentItem[]).map((doc) => ({
          ...doc,
          status: doc.status ?? 'ready',
        }));

        const nextConversations = (conversationsResponse.data as any[]).map(normalizeConversation);
        const nextStats = statsResponse.data as Stats;

        setAgents(nextAgents);
        setDocuments(nextDocuments);
        setConversations(nextConversations);
        setStats({
          totalAgents: nextStats.totalAgents ?? nextAgents.length,
          activeAgents: nextStats.activeAgents ?? nextAgents.filter((agent) => agent.status === 'active').length,
          totalConversations: nextStats.totalConversations ?? nextConversations.length,
          totalMinutes: nextStats.totalMinutes ?? 0,
        });
      })
      .catch(() => {
        setAgents([]);
        setDocuments([]);
        setConversations([]);
        setStats({
          totalAgents: 0,
          activeAgents: 0,
          totalConversations: 0,
          totalMinutes: 0,
        });
      });
  }, [user]);

  const handleLogin = async (email: string, password: string) => {
    const response = await apiClient.post('/api/auth/login', { email, password });
    const nextUser = response.data.user as User;
    const token = response.data.token as string;

    localStorage.setItem('voicepilot-token', token);
    localStorage.setItem('voicepilot-user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const handleRegister = async (name: string, email: string, password: string) => {
    const response = await apiClient.post('/api/auth/register', { name, email, password });
    const nextUser = response.data.user as User;
    const token = response.data.token as string;

    localStorage.setItem('voicepilot-token', token);
    localStorage.setItem('voicepilot-user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const addAgent = async (newAgent: Omit<Agent, 'id' | 'lastActive' | 'conversationCount'>) => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    const response = await apiClient.post('/api/agents', newAgent, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const created = response.data as Agent;
    setAgents((current) => [created, ...current]);
    setStats((current) => ({
      ...current,
      totalAgents: current.totalAgents + 1,
      activeAgents: current.activeAgents + (created.status === 'active' ? 1 : 0),
    }));
  };

  const deleteAgent = async (agentId: string) => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    try {
      await apiClient.delete(`/api/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const removed = agents.find((agent) => agent.id === agentId);
      setAgents((current) => current.filter((agent) => agent.id !== agentId));
      setStats((current) => ({
        ...current,
        totalAgents: Math.max(0, current.totalAgents - 1),
        activeAgents: Math.max(0, current.activeAgents - Number(removed?.status === 'active')),
      }));
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not delete the agent.'));
    }
  };

  const updateAgent = async (
    agentId: string,
    updates: Omit<Agent, 'id' | 'lastActive' | 'conversationCount'>,
  ) => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    try {
      const response = await apiClient.put(`/api/agents/${agentId}`, updates, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const updated = response.data as Agent;
      const previous = agents.find((agent) => agent.id === agentId);
      setAgents((current) => current.map((agent) => (agent.id === agentId ? updated : agent)));
      setStats((current) => ({
        ...current,
        activeAgents:
          current.activeAgents +
          Number(updated.status === 'active') -
          Number(previous?.status === 'active'),
      }));
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not update the agent.'));
    }
  };

  const uploadDocument = async (file: File) => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post('/api/documents/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      const nextDoc = response.data as DocumentItem;
      setDocuments((current) => [nextDoc, ...current]);
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not upload this document.'));
    }
  };

  const deleteDocument = async (documentId: string) => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    try {
      await apiClient.delete(`/api/documents/${encodeURIComponent(documentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocuments((current) => current.filter((document) => document.id !== documentId));
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not delete this document.'));
    }
  };

  const startVoiceSession = async (agentId: string): Promise<VoiceSession> => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    try {
      const response = await apiClient.post(
        '/api/voice/session',
        { agentId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return response.data as VoiceSession;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not start the voice session.'));
    }
  };

  const getVoicePreviewSession = async (voice: string): Promise<VoiceSession> => {
    try {
      const response = await apiClient.post('/api/voice/preview', { voice });
      return response.data as VoiceSession;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not preview this voice.'));
    }
  };

  const endVoiceSession = async (sessionId: string) => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    try {
      await apiClient.post(
        '/api/voice/session/end',
        { sessionId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not finish saving the conversation.'));
    }
  };

  const askDocuments = async (question: string): Promise<string> => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    try {
      const response = await apiClient.post(
        '/api/documents/ask',
        { question },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return response.data.answer as string;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not answer from your documents.'));
    }
  };

  const saveVoiceMessage = async (sessionId: string, role: 'user' | 'assistant', content: string) => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    try {
      await apiClient.post(
        `/api/voice/session/${encodeURIComponent(sessionId)}/messages`,
        { role, content },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not save this transcript message.'));
    }
  };

  const getConversations = useCallback(async (filters: ConversationFilters): Promise<Conversation[]> => {
    try {
      const response = await apiClient.get('/api/conversations', { params: filters });
      return (response.data as any[]).map(normalizeConversation);
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not search conversations.'));
    }
  }, []);

  const getDocuments = useCallback(async (filters: DocumentFilters): Promise<DocumentItem[]> => {
    try {
      const response = await apiClient.get('/api/documents', { params: filters });
      return (response.data as DocumentItem[]).map((document) => ({
        ...document,
        status: document.status ?? 'ready',
      }));
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not search documents.'));
    }
  }, []);

  const getAgents = useCallback(async (filters: AgentFilters): Promise<Agent[]> => {
    try {
      const response = await apiClient.get('/api/agents', { params: filters });
      return (response.data as Agent[]).map((agent) => ({
        ...agent,
        status: agent.status ?? 'active',
        conversationCount: agent.conversationCount ?? 0,
        lastActive: agent.lastActive ?? 'just now',
      }));
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not search agents.'));
    }
  }, []);

  const getConversation = useCallback(async (conversationId: string): Promise<ConversationDetail> => {
    const token = localStorage.getItem('voicepilot-token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    try {
      const response = await apiClient.get(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data as ConversationDetail;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Could not load this conversation.'));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('voicepilot-token');
    localStorage.removeItem('voicepilot-user');
    setUser(null);
  };

  return (
    <Routes>
      <Route
        path="/auth"
        element={user ? <Navigate to="/" replace /> : <AuthPage onLogin={handleLogin} onRegister={handleRegister} />}
      />
      <Route
        path="/"
        element={
          user ? (
            <Layout user={user}>
              <Outlet />
            </Layout>
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      >
        <Route index element={<DashboardPage stats={stats} agents={agents} conversations={conversations} user={user!} />} />
        <Route
          path="agents"
          element={<AgentsPage agents={agents} onGetAgents={getAgents} onCreate={addAgent} onUpdate={updateAgent} onDelete={deleteAgent} onPreviewVoice={getVoicePreviewSession} />}
        />
        <Route
          path="playground"
          element={
            <VoicePlaygroundPage
              transcript={transcript}
              updateTranscript={(message) => setTranscript((current) => [...current, message])}
              clearTranscript={() => setTranscript([])}
              agents={agents}
              documents={documents}
              onStartSession={startVoiceSession}
              onEndSession={endVoiceSession}
              onSaveMessage={saveVoiceMessage}
            />
          }
        />
        <Route
          path="knowledge"
          element={<KnowledgeBasePage documents={documents} onGetDocuments={getDocuments} onUpload={uploadDocument} onDelete={deleteDocument} onAsk={askDocuments} />}
        />
        <Route
          path="conversations"
          element={<ConversationsPage conversations={conversations} agents={agents} stats={stats} onGetConversations={getConversations} onGetConversation={getConversation} />}
        />
        <Route path="settings" element={<SettingsPage user={user} onLogout={handleLogout} />} />
      </Route>
    </Routes>
  );
}
