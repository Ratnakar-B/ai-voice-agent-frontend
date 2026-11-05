export type User = {
  id: string;
  name: string;
  email: string;
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  avatar?: string;
  voice: string;
  language: string;
  model: string;
  instructions: string;
  welcomeMessage: string;
  conversationScript: string;
  speakingStyle: string;
  responseBehavior: string;
  temperature: number;
  knowledgeDocumentIds: string[];
  deployment: {
    browserVoice: boolean;
    inboundCalls: boolean;
    outboundCalls: boolean;
  };
  conversationCount: number;
  lastActive: string;
};

export type AgentFilters = {
  search: string;
  status: 'all' | 'active' | 'inactive';
  language: string;
  sort: 'newest' | 'name' | 'conversations';
};

export type DocumentItem = {
  id: string;
  name: string;
  size: string;
  status: 'ready' | 'processing' | 'pending' | 'failed';
  uploadedAt?: string;
};

export type DocumentFilters = {
  search: string;
  type: 'all' | 'pdf' | 'docx' | 'txt' | 'md' | 'csv';
  status: 'all' | 'ready' | 'pending' | 'processing' | 'failed';
  sort: 'newest' | 'oldest' | 'name';
};

export type Conversation = {
  id: string;
  agent: string;
  date: string;
  startedAt?: string;
  duration: string;
  status: 'completed' | 'active';
};

export type ConversationFilters = {
  search: string;
  agent: string;
  status: 'all' | 'completed' | 'active';
  date: '7' | '30' | 'all';
};

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type ConversationDetail = Conversation & {
  messages: ConversationMessage[];
};

export type Stats = {
  totalAgents: number;
  activeAgents: number;
  totalConversations: number;
  totalMinutes: number;
};

export type VoiceSession = {
  sessionId: string;
  status: 'ready';
  model: string;
  provider: string;
  message: string;
  ephemeralToken: string;
  websocketUrl: string;
  voiceName: string;
  systemInstruction: string;
  welcomeMessage: string;
};
