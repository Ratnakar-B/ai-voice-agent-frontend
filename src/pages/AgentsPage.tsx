import {
  ArrowDownWideNarrow,
  ArrowRight,
  ChevronDown,
  Ellipsis,
  Headphones,
  Languages,
  Pencil,
  Play,
  Plus,
  Square,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Agent, AgentFilters, VoiceSession } from '../types';

type AgentInput = Omit<Agent, 'id' | 'lastActive' | 'conversationCount'>;
type AgentSort = AgentFilters['sort'];

const agentAvatars = [
  { src: '/agent01.jpg', label: 'Portrait 1' },
  { src: '/agent02.jfif', label: 'Portrait 2' },
  { src: '/agent03.jfif', label: 'Portrait 3' },
  { src: '/agent04.jfif', label: 'Portrait 4' },
  { src: '/agent05.jfif', label: 'Portrait 5' },
];
const defaultAgentAvatar = agentAvatars[0].src;
const supportedVoices = ['Kore', 'Aoede', 'Charon', 'Fenrir', 'Puck'];
const previewSampleRate = 24000;

async function decodePreviewFrame(data: unknown): Promise<{
  setupComplete?: unknown;
  error?: { message?: string };
  serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    turnComplete?: boolean;
  };
}> {
  let text: string;
  if (typeof data === 'string') text = data;
  else if (data instanceof Blob) text = await data.text();
  else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
  else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
  else throw new Error('The voice preview returned an unsupported response.');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The voice preview returned an invalid response.');
  }
}

const emptyAgent: AgentInput = {
  name: '',
  description: '',
  status: 'active',
  voice: 'Kore',
  language: 'English',
  model: 'gemini-3.8-flash',
  instructions: 'Be helpful, concise, and friendly.',
  welcomeMessage: 'Hello! How can I help you today?',
  speakingStyle: 'Natural and friendly',
  responseBehavior: 'Balanced',
  temperature: 0.7,
  knowledgeDocumentIds: [],
  deployment: { browserVoice: true, inboundCalls: false, outboundCalls: false },
  avatar: defaultAgentAvatar,
};

export function AgentsPage({
  agents,
  onGetAgents,
  onCreate,
  onUpdate,
  onDelete,
  onPreviewVoice,
}: {
  agents: Agent[];
  onGetAgents: (filters: AgentFilters) => Promise<Agent[]>;
  onCreate: (agent: AgentInput) => Promise<void>;
  onUpdate: (agentId: string, agent: AgentInput) => Promise<void>;
  onDelete: (agentId: string) => Promise<void>;
  onPreviewVoice: (voice: string) => Promise<VoiceSession>;
}) {
  const [form, setForm] = useState<AgentInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AgentFilters['status']>('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [sort, setSort] = useState<AgentSort>('newest');
  const [visibleAgents, setVisibleAgents] = useState<Agent[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [listError, setListError] = useState('');
  const agentRequestId = useRef(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewRun = useRef(0);
  const previewSocket = useRef<WebSocket | null>(null);
  const previewContext = useRef<AudioContext | null>(null);
  const previewSources = useRef(new Set<AudioBufferSourceNode>());
  const previewCancel = useRef<((error: Error) => void) | null>(null);
  const playbackCursor = useRef(0);

  const releasePreviewResources = () => {
    previewSocket.current?.close();
    previewSocket.current = null;
    previewSources.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // A preview source may already have finished.
      }
    });
    previewSources.current.clear();
    const context = previewContext.current;
    previewContext.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch((error: unknown) => console.error('Could not close voice preview audio.', error));
    }
    playbackCursor.current = 0;
  };

  const stopVoicePreview = () => {
    previewRun.current += 1;
    const cancel = previewCancel.current;
    previewCancel.current = null;
    if (cancel) cancel(new Error('Voice preview stopped.'));
    else releasePreviewResources();
    setPreviewingVoice(null);
  };

  useEffect(() => () => {
    previewRun.current += 1;
    const cancel = previewCancel.current;
    previewCancel.current = null;
    if (cancel) cancel(new Error('Voice preview stopped.'));
    else releasePreviewResources();
  }, []);

  const previewVoice = async (voice: string) => {
    stopVoicePreview();
    setErrorMessage('');
    setPreviewingVoice(voice);
    const run = previewRun.current;

    try {
      if (!window.WebSocket || !window.AudioContext) {
        throw new Error('Voice preview requires WebSocket and audio support in this browser.');
      }

      const context = new AudioContext();
      previewContext.current = context;
      await context.resume();
      const session = await onPreviewVoice(voice);
      if (run !== previewRun.current) return;

      const url = new URL(session.websocketUrl);
      url.searchParams.set('access_token', session.ephemeralToken);
      const socket = new WebSocket(url);
      previewSocket.current = socket;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let setupSent = false;
        const timeout = window.setTimeout(
          () => finish(new Error('The voice preview timed out. Please try again.')),
          30000,
        );

        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          previewCancel.current = null;
          releasePreviewResources();
          if (run === previewRun.current) setPreviewingVoice(null);
          if (error) reject(error);
          else resolve();
        };
        previewCancel.current = finish;

        socket.onopen = () => {
          try {
            socket.send(JSON.stringify({
              setup: {
                model: `models/${session.model}`,
                generationConfig: {
                  responseModalities: ['AUDIO'],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: session.voiceName } } },
                },
                systemInstruction: { parts: [{ text: session.systemInstruction }] },
              },
            }));
          } catch (error) {
            finish(error instanceof Error ? error : new Error('Could not start the voice preview.'));
          }
        };

        socket.onmessage = async (event: MessageEvent) => {
          if (run !== previewRun.current) return;
          try {
            const message = await decodePreviewFrame(event.data);
            if (message.error) {
              finish(new Error(message.error.message ?? 'Gemini could not play this voice preview.'));
              return;
            }
            if (message.setupComplete !== undefined && !setupSent) {
              setupSent = true;
              socket.send(JSON.stringify({
                clientContent: {
                  turns: [{ role: 'user', parts: [{ text: 'Start the conversation now and greet me.' }] }],
                  turnComplete: true,
                },
              }));
            }
            for (const part of message.serverContent?.modelTurn?.parts ?? []) {
              const audio = part.inlineData;
              if (!audio?.data || !audio.mimeType?.startsWith('audio/pcm')) continue;
              const binary = window.atob(audio.data);
              const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
              const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
              const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
              for (let index = 0; index < samples.length; index += 1) {
                samples[index] = pcm.getInt16(index * 2, true) / 32768;
              }
              const buffer = context.createBuffer(1, samples.length, previewSampleRate);
              buffer.getChannelData(0).set(samples);
              const source = context.createBufferSource();
              source.buffer = buffer;
              source.connect(context.destination);
              const startAt = Math.max(context.currentTime, playbackCursor.current);
              source.start(startAt);
              playbackCursor.current = startAt + buffer.duration;
              previewSources.current.add(source);
              source.onended = () => {
                previewSources.current.delete(source);
                source.disconnect();
              };
            }
            if (message.serverContent?.turnComplete) {
              const remainingPlayback = Math.max(0, playbackCursor.current - context.currentTime);
              window.setTimeout(() => finish(), remainingPlayback * 1000);
            }
          } catch (error) {
            finish(error instanceof Error ? error : new Error('Could not play this voice preview.'));
          }
        };

        socket.onerror = () => finish(new Error('Could not connect to Gemini Live to preview this voice.'));
        socket.onclose = (event) => {
          if (!settled && run === previewRun.current) {
            finish(new Error(event.reason || 'Gemini Live closed before the preview finished.'));
          }
        };
      });
    } catch (error) {
      if (run === previewRun.current) {
        releasePreviewResources();
        setPreviewingVoice(null);
        setErrorMessage(error instanceof Error ? error.message : 'Could not preview this voice.');
      }
    }
  };

  const languages = useMemo(() => [...new Set(agents.map((agent) => agent.language).filter(Boolean))].sort(), [agents]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++agentRequestId.current;
    setIsLoadingAgents(true);
    const timer = window.setTimeout(() => {
      setListError('');
      void onGetAgents({
        search: search.trim(),
        status: statusFilter,
        language: languageFilter === 'all' ? '' : languageFilter,
        sort,
      })
        .then((result) => {
          if (!cancelled && requestId === agentRequestId.current) setVisibleAgents(result);
        })
        .catch((error: unknown) => {
          if (!cancelled && requestId === agentRequestId.current) {
            setListError(error instanceof Error ? error.message : 'Could not load agents.');
          }
        })
        .finally(() => {
          if (!cancelled && requestId === agentRequestId.current) setIsLoadingAgents(false);
        });
    }, search.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [agents, languageFilter, onGetAgents, search, sort, statusFilter]);

  const startEditing = (agent?: Agent) => {
    stopVoicePreview();
    setErrorMessage('');
    setMenuId('');
    setEditingId(agent?.id ?? null);
    setForm(
      agent
        ? {
            name: agent.name,
            description: agent.description,
            status: agent.status,
            voice: agent.voice,
            language: agent.language,
            model: agent.model,
            instructions: agent.instructions,
            welcomeMessage: agent.welcomeMessage,
            speakingStyle: agent.speakingStyle ?? 'Natural and friendly',
            responseBehavior: agent.responseBehavior ?? 'Balanced',
            temperature: agent.temperature ?? 0.7,
            knowledgeDocumentIds: agent.knowledgeDocumentIds ?? [],
            deployment: agent.deployment ?? { browserVoice: true, inboundCalls: false, outboundCalls: false },
            avatar: agent.avatar ?? defaultAgentAvatar,
          }
        : { ...emptyAgent },
    );
  };

  const saveAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      if (editingId) {
        await onUpdate(editingId, form);
      } else {
        await onCreate(form);
      }
      setForm(null);
      setEditingId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save this agent.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAgentStatus = async (agent: Agent) => {
    setErrorMessage('');
    setUpdatingId(agent.id);
    try {
      await onUpdate(agent.id, {
        name: agent.name,
        description: agent.description,
        status: agent.status === 'active' ? 'inactive' : 'active',
        voice: agent.voice,
        language: agent.language,
        model: agent.model,
        instructions: agent.instructions,
        welcomeMessage: agent.welcomeMessage,
        speakingStyle: agent.speakingStyle ?? 'Natural and friendly',
        responseBehavior: agent.responseBehavior ?? 'Balanced',
        temperature: agent.temperature ?? 0.7,
        knowledgeDocumentIds: agent.knowledgeDocumentIds ?? [],
        deployment: agent.deployment ?? { browserVoice: true, inboundCalls: false, outboundCalls: false },
        avatar: agent.avatar ?? defaultAgentAvatar,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update agent status.');
    } finally {
      setUpdatingId('');
    }
  };

  const removeAgent = async (agentId: string) => {
    setErrorMessage('');
    setDeletingId(agentId);
    setMenuId('');
    try {
      await onDelete(agentId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete this agent.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="agents-page">
      <div className="agents-topbar-spacer" aria-hidden="true" />

      <section className="agents-heading">
        <div>
          <p className="eyebrow">Voice AI operations</p>
          <h1>Voice agents</h1>
          <p>Build, organize, and monitor the voice assistants in your workspace.</p>
        </div>
        <button type="button" className="primary-button agents-create-button" onClick={() => startEditing()}>
          <Plus size={17} /> Create agent
        </button>
      </section>

      <div className="agents-toolbar">
        <label className="agents-search">
          <Search size={17} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agents..." aria-label="Search agents" />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}
        </label>
        <label className="agents-filter">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AgentFilters['status'])}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <label className="agents-filter">
          <Languages size={15} aria-hidden="true" />
          <select aria-label="Filter by language" value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
            <option value="all">All languages</option>
            {languages.map((language) => <option value={language} key={language}>{language}</option>)}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <label className="agents-filter agents-sort">
          <ArrowDownWideNarrow size={15} aria-hidden="true" />
          <select aria-label="Sort agents" value={sort} onChange={(event) => setSort(event.target.value as AgentSort)}>
            <option value="newest">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="conversations">Most conversations</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>

      {errorMessage && <p className="call-status error agents-error" role="alert">{errorMessage}</p>}
      {listError && <p className="call-status error agents-error" role="alert">{listError}</p>}

      {form && (
        <section className="agent-editor">
          <div className="agent-editor-heading">
            <div><span className="agent-editor-icon"><Sparkles size={17} /></span><div><h2>{editingId ? 'Edit agent' : 'Create an agent'}</h2><p>Configure how this voice agent behaves.</p></div></div>
            <button type="button" className="agent-editor-close" aria-label="Close form" disabled={isSaving} onClick={() => { stopVoicePreview(); setForm(null); setEditingId(null); }}><X size={18} /></button>
          </div>
          <form className="agent-form agents-editor-form" onSubmit={saveAgent}>
            <fieldset className="agent-avatar-picker">
              <legend>Agent picture</legend>
              <div className="agent-avatar-options" role="radiogroup" aria-label="Choose an agent picture">
                {agentAvatars.map((avatar, index) => (
                  <label className={`agent-avatar-option${form.avatar === avatar.src ? ' is-selected' : ''}`} key={avatar.src}>
                    <input
                      type="radio"
                      name="agent-avatar"
                      value={avatar.src}
                      checked={form.avatar === avatar.src}
                      onChange={() => setForm({ ...form, avatar: avatar.src })}
                    />
                    <img src={avatar.src} alt={avatar.label} />
                    <span>{avatar.label}</span>
                    <span className="agent-avatar-check" aria-hidden="true">{index + 1}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="two-inputs">
              <label>Agent name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Language<input required value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} /></label>
            </div>
            <div className="two-inputs">
              <div className="agent-voice-control">
                <label>Voice<select value={form.voice} onChange={(event) => { stopVoicePreview(); setForm({ ...form, voice: event.target.value }); }}>{supportedVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>
                <button
                  type="button"
                  className="agent-voice-preview"
                  aria-label={previewingVoice === form.voice ? `Stop ${form.voice} voice preview` : `Play ${form.voice} voice preview`}
                  disabled={isSaving}
                  onClick={() => previewingVoice === form.voice ? stopVoicePreview() : void previewVoice(form.voice)}
                >
                  {previewingVoice === form.voice ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  {previewingVoice === form.voice ? 'Playing...' : 'Preview'}
                </button>
              </div>
              <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AgentInput['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            </div>
            <label>Description<input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label>Agent instructions<textarea required value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></label>
            <label>Welcome message<input required value={form.welcomeMessage} onChange={(event) => setForm({ ...form, welcomeMessage: event.target.value })} /></label>
            {errorMessage && <p className="call-status error" role="alert">{errorMessage}</p>}
            <div className="action-row">
              <button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Create agent'}</button>
              <button type="button" className="ghost-button" disabled={isSaving} onClick={() => { stopVoicePreview(); setForm(null); setEditingId(null); }}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <div className="agents-list-heading">
        <div><h2>Your agents</h2><span>{isLoadingAgents ? 'Searching…' : `${visibleAgents.length} ${visibleAgents.length === 1 ? 'agent' : 'agents'}`}</span></div>
        <span className="agents-list-hint">Manage availability and configuration</span>
      </div>

      <section className="agents-list" aria-label="Your voice agents">
        {isLoadingAgents ? (
          <div className="agents-empty" role="status"><h2>Loading agents…</h2></div>
        ) : visibleAgents.map((agent, index) => (
          <article className="agent-row" key={agent.id}>
            <div className={`agent-row-icon agent-color-${index % 5}`} aria-hidden="true">
              {agent.avatar
                ? <img src={agent.avatar} alt="" />
                : <Headphones size={22} />}
            </div>
            <div className="agent-row-info">
              <div className="agent-row-title">
                <h2>{agent.name}</h2>
                <span className={`agent-row-status ${agent.status === 'active' ? 'is-active' : ''}`}>
                  <span />{agent.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p>{agent.description}</p>
              <div className="agent-tags">
                <span className="agent-tag">{agent.language}</span>
                <span className="agent-tag agent-tag-purple">{agent.voice}</span>
                <span className="agent-tag agent-tag-blue">{agent.model}</span>
              </div>
            </div>
            <div className="agent-row-insights">
              <div className="agent-row-stat"><strong>{agent.conversationCount.toLocaleString()}</strong><span>Conversations</span></div>
              <div className="agent-row-stat"><strong>{agent.conversationCount ? agent.lastActive || 'Recently' : '—'}</strong><span>Last activity</span></div>
            </div>
            <div className="agent-row-actions">
              <button
                type="button"
                className={`agent-status-switch ${agent.status === 'active' ? 'is-active' : ''}`}
                role="switch"
                aria-checked={agent.status === 'active'}
                aria-label={`${agent.status === 'active' ? 'Deactivate' : 'Activate'} ${agent.name}`}
                disabled={updatingId === agent.id || deletingId === agent.id}
                onClick={() => void toggleAgentStatus(agent)}
              >
                <span className="agent-switch-track"><span /></span>
                <span>{updatingId === agent.id ? 'Saving' : agent.status === 'active' ? 'Active' : 'Inactive'}</span>
              </button>
              <button type="button" className="agent-icon-action" aria-label={`Edit ${agent.name}`} title="Edit agent" onClick={() => startEditing(agent)}><Pencil size={16} /></button>
              <div className="agent-menu-wrap">
                <button type="button" className="agent-icon-action" aria-label={`More actions for ${agent.name}`} aria-expanded={menuId === agent.id} onClick={() => setMenuId(menuId === agent.id ? '' : agent.id)}><Ellipsis size={19} /></button>
                {menuId === agent.id && (
                  <div className="agent-action-menu">
                    <button type="button" onClick={() => startEditing(agent)}><Pencil size={14} /> Edit agent</button>
                    <button type="button" className="agent-delete-action" disabled={deletingId === agent.id} onClick={() => void removeAgent(agent.id)}><Trash2 size={14} /> {deletingId === agent.id ? 'Deleting...' : 'Delete agent'}</button>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
        {!isLoadingAgents && visibleAgents.length === 0 && (
          <div className="agents-empty">
            <span className="agents-empty-icon"><UsersRound size={22} /></span>
            <h2>{agents.length ? 'No matching agents' : 'Create your first voice agent'}</h2>
            <p>{agents.length ? 'Try changing your search or filters.' : 'Set up an AI voice agent to start conversations in your browser.'}</p>
            {agents.length ? (
              <button type="button" className="ghost-button" onClick={() => { setSearch(''); setStatusFilter('all'); setLanguageFilter('all'); }}>Clear filters</button>
            ) : (
              <button type="button" className="primary-button" onClick={() => startEditing()}><Plus size={17} /> Create agent <ArrowRight size={15} /></button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
