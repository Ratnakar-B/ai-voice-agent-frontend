import {
  ArrowDownWideNarrow,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  File,
  FileText,
  FileUp,
  Grid2X2,
  List,
  MessageSquareText,
  Search,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import type { DocumentFilters, DocumentItem } from '../types';

type DocumentType = 'pdf' | 'docx' | 'txt' | 'md' | 'csv' | 'other';
type DocumentSort = DocumentFilters['sort'];
type DocumentView = 'list' | 'grid';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = '.txt,.md,.csv,.pdf,.docx';

const getQuickResponse = (question: string): string | undefined => {
  const message = question.toLocaleLowerCase().replace(/[.!?,]+$/g, '').trim().replace(/\s+/g, ' ');

  if (/^(hi|hello|hey|hiya|howdy)( there)?$/.test(message) || /^(good morning|good afternoon|good evening)( there)?$/.test(message)) {
    return 'Hi! I can help answer questions using your knowledge-base documents. What would you like to know?';
  }
  if (/^(thanks|thank you|thx)( so much)?$/.test(message)) {
    return "You're welcome! What else would you like to know about your documents?";
  }
  if (/^(how are you|how are you doing)$/.test(message)) {
    return "I'm ready to help you find answers in your documents. What would you like to know?";
  }

  return undefined;
};

const getDocumentType = (name: string): DocumentType => {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension === 'pdf' || extension === 'docx' || extension === 'txt' || extension === 'md' || extension === 'csv'
    ? extension
    : 'other';
};

const formatFileSize = (input: string) => {
  const match = input.trim().match(/^([\d.]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib)?$/i);
  if (!match) return input || '—';
  const amount = Number(match[1]);
  if (amount === 0) return '0 B';
  const unit = (match[2] ?? 'B').toLowerCase();
  const bytes = unit.startsWith('g') ? amount * 1024 ** 3
    : unit.startsWith('m') ? amount * 1024 ** 2
      : unit.startsWith('k') ? amount * 1024
        : amount;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(bytes >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.max(1, Math.round(bytes))} B`;
};

const fileSizeInBytes = (input: string) => {
  const match = input.trim().match(/^([\d.]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] ?? 'B').toLowerCase();
  return unit.startsWith('g') ? amount * 1024 ** 3
    : unit.startsWith('m') ? amount * 1024 ** 2
      : unit.startsWith('k') ? amount * 1024
        : amount;
};

const formatDate = (value?: string) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
};

const latestUpload = (documents: DocumentItem[]) => documents
  .map((document) => document.uploadedAt)
  .filter((date): date is string => Boolean(date))
  .map((date) => new Date(date))
  .filter((date) => !Number.isNaN(date.getTime()))
  .sort((left, right) => right.getTime() - left.getTime())[0];

export function KnowledgeBasePage({
  documents,
  onGetDocuments,
  onUpload,
  onDelete,
  onAsk,
}: {
  documents: DocumentItem[];
  onGetDocuments: (filters: DocumentFilters) => Promise<DocumentItem[]>;
  onUpload: (file: File) => Promise<void>;
  onDelete: (documentId: string) => Promise<void>;
  onAsk: (question: string) => Promise<string>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [chatError, setChatError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [showAsk, setShowAsk] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentFilters['type']>('all');
  const [statusFilter, setStatusFilter] = useState<DocumentFilters['status']>('all');
  const [sort, setSort] = useState<DocumentSort>('newest');
  const [view, setView] = useState<DocumentView>('list');
  const [now] = useState(() => new Date());
  const [visibleDocuments, setVisibleDocuments] = useState<DocumentItem[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [documentListError, setDocumentListError] = useState('');
  const documentRequestId = useRef(0);
  const chatInput = useRef<HTMLInputElement>(null);

  const readyCount = documents.filter((document) => document.status === 'ready').length;
  const pendingCount = documents.filter((document) => document.status === 'pending').length;
  const canAskDocuments = readyCount > 0 || pendingCount > 0;
  const totalBytes = documents.reduce((sum, document) => sum + fileSizeInBytes(document.size), 0);
  const lastUploaded = latestUpload(documents);
  const lastUpdated = lastUploaded
    ? lastUploaded.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) === now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      ? 'Today'
      : lastUploaded.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : '—';

  useEffect(() => {
    let cancelled = false;
    const requestId = ++documentRequestId.current;
    setIsLoadingDocuments(true);
    const timer = window.setTimeout(() => {
      setDocumentListError('');
      void onGetDocuments({
        search: search.trim(),
        type: typeFilter,
        status: statusFilter,
        sort,
      })
        .then((result) => {
          if (!cancelled && requestId === documentRequestId.current) setVisibleDocuments(result);
        })
        .catch((error: unknown) => {
          if (!cancelled && requestId === documentRequestId.current) {
            setDocumentListError(error instanceof Error ? error.message : 'Could not load documents.');
          }
        })
        .finally(() => {
          if (!cancelled && requestId === documentRequestId.current) setIsLoadingDocuments(false);
        });
    }, search.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [documents, onGetDocuments, search, sort, statusFilter, typeFilter]);

  const uploadFile = async (file?: File) => {
    if (!file) return;
    setErrorMessage('');
    if (getDocumentType(file.name) === 'other') {
      setErrorMessage('Upload a TXT, Markdown, CSV, PDF, or DOCX document.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('Files must be 10 MB or smaller.');
      return;
    }
    setIsUploading(true);
    try {
      await onUpload(file);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload this document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await uploadFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    await uploadFile(event.dataTransfer.files[0]);
  };

  const askQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion) {
      setChatError('Enter a question about your documents.');
      return;
    }

    setChatError('');
    setMessages((current) => [...current, { role: 'user', content: nextQuestion }]);
    setQuestion('');
    const quickResponse = getQuickResponse(nextQuestion);
    if (quickResponse) {
      setMessages((current) => [...current, { role: 'assistant', content: quickResponse }]);
      return;
    }

    setIsAsking(true);
    try {
      const response = await onAsk(nextQuestion);
      setMessages((current) => [...current, { role: 'assistant', content: response }]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Could not answer from your documents.');
    } finally {
      setIsAsking(false);
    }
  };

  useEffect(() => {
    if (!showAsk) return;
    chatInput.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAsk(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showAsk]);

  const deleteDocument = async (document: DocumentItem) => {
    if (!window.confirm(`Delete "${document.name}" from your knowledge base?`)) return;
    setErrorMessage('');
    setDeletingId(document.id);
    try {
      await onDelete(document.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete this document.');
    } finally {
      setDeletingId('');
    }
  };

  const triggerUpload = () => fileInput.current?.click();

  return (
    <div className="knowledge-page">
      <section className="knowledge-heading">
        <div><p className="eyebrow">Voice AI operations</p><h1>Knowledge Base</h1><p>Upload and manage documents to give your AI agents accurate, up-to-date information.</p></div>
      </section>

      <section className="knowledge-stats" aria-label="Knowledge base statistics">
        <article className="knowledge-stat stat-purple"><span><FileText size={20} /></span><div><small>Total documents</small><strong>{documents.length}</strong><em>{documents.length ? `${readyCount} indexed and ready` : 'Upload your first document'}</em></div></article>
        <article className="knowledge-stat stat-green"><span><DatabaseIcon /></span><div><small>Total size</small><strong>{formatFileSize(String(totalBytes))}</strong><em>{documents.length ? 'Across your library' : 'No storage used'}</em></div></article>
        <article className="knowledge-stat stat-blue"><span><File size={20} /></span><div><small>Indexed files</small><strong>{readyCount}</strong><em>{documents.length ? `${Math.round((readyCount / documents.length) * 100)}% indexed` : 'Ready for AI answers'}</em></div></article>
        <article className="knowledge-stat stat-orange"><span><Clock3 size={20} /></span><div><small>Last updated</small><strong>{lastUpdated}</strong><em>{lastUploaded ? formatDate(lastUploaded.toISOString()) : 'No uploads yet'}</em></div></article>
      </section>

      <section className="knowledge-upload-info">
        <div
          className={`knowledge-dropzone${isDragging ? ' is-dragging' : ''}${isUploading ? ' is-uploading' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }}
          onDrop={(event) => void handleDrop(event)}
          onClick={triggerUpload}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); triggerUpload(); } }}
          role="button"
          tabIndex={0}
          aria-label="Upload a knowledge base document"
        >
          <input ref={fileInput} type="file" accept={ACCEPTED_TYPES} hidden disabled={isUploading} onChange={(event) => void handleFileChange(event)} />
          <UploadCloud className="knowledge-cloud-icon" size={38} />
          <div className="knowledge-upload-copy"><strong>{isUploading ? 'Uploading and indexing...' : isDragging ? 'Drop your document here' : 'Upload documents'}</strong><span>Drag and drop files here, or <b>click to browse</b></span><small>Supports PDF, DOCX, TXT, CSV, MD (Max 10MB per file)</small></div>
          <button type="button" className="knowledge-upload-button" disabled={isUploading} onClick={(event) => { event.stopPropagation(); triggerUpload(); }}><FileUp size={16} />{isUploading ? 'Uploading...' : 'Upload document'}</button>
        </div>
        <aside className="knowledge-guide">
          <h2>Help your AI agents with knowledge</h2>
          <ul>
            <li><Check size={15} />Upload documents, manuals, FAQs, and policies</li>
            <li><Check size={15} />Agents use indexed files to ground their answers</li>
            <li><Check size={15} />Supports PDF, DOCX, TXT, CSV, and Markdown</li>
            <li><Check size={15} />Files are automatically processed and indexed</li>
          </ul>
        </aside>
      </section>

      {errorMessage && <p className="call-status error knowledge-error" role="alert">{errorMessage}</p>}

      <section className="knowledge-library">
        <div className="knowledge-toolbar">
          <label className="knowledge-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents..." aria-label="Search documents" />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}</label>
          <label className="knowledge-filter"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as DocumentFilters['type'])} aria-label="Filter by file type"><option value="all">All types</option>{['pdf', 'docx', 'txt', 'md', 'csv'].map((type) => <option value={type} key={type}>{type.toUpperCase()}</option>)}</select><ChevronDown size={14} /></label>
          <label className="knowledge-filter"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DocumentFilters['status'])} aria-label="Filter by status"><option value="all">All status</option><option value="ready">Indexed</option><option value="pending">Needs indexing</option><option value="processing">Processing</option><option value="failed">Failed</option></select><ChevronDown size={14} /></label>
          <label className="knowledge-filter knowledge-sort"><ArrowDownWideNarrow size={14} /><select value={sort} onChange={(event) => setSort(event.target.value as DocumentSort)} aria-label="Sort documents"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select><ChevronDown size={14} /></label>
          <div className="knowledge-view-toggle" aria-label="Document display">
            <button type="button" className={view === 'list' ? 'is-selected' : ''} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button>
            <button type="button" className={view === 'grid' ? 'is-selected' : ''} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={16} /></button>
          </div>
        </div>

        {documentListError ? (
          <div className="knowledge-empty" role="alert">
            <strong>Could not load documents</strong>
            <p>{documentListError}</p>
          </div>
        ) : isLoadingDocuments ? (
          <div className="knowledge-empty" role="status"><strong>Loading documents…</strong></div>
        ) : visibleDocuments.length > 0 ? (
          <div className={`knowledge-document-list${view === 'grid' ? ' is-grid' : ''}`}>
            {view === 'list' && <div className="knowledge-list-header" aria-hidden="true"><span /><strong>Document</strong><strong>Type</strong><strong>Size</strong><strong>Uploaded on</strong><strong>Status</strong><strong>Access</strong><span>Actions</span></div>}
            {visibleDocuments.map((document) => {
              const type = getDocumentType(document.name);
              return (
                <article className="knowledge-document-row" key={document.id}>
                  <span className={`knowledge-file-icon file-${type}`}><FileText size={18} /><small>{type === 'docx' ? 'DOC' : type.toUpperCase()}</small></span>
                  <span className="knowledge-file-name"><strong>{document.name}</strong><small>{type.toUpperCase()} document</small></span>
                  <span className={`knowledge-type type-${type}`}>{type.toUpperCase()}</span>
                  <span className="knowledge-file-size">{formatFileSize(document.size)}</span>
                  <span className="knowledge-file-date">{formatDate(document.uploadedAt)}</span>
                  <span className={`knowledge-index-status status-${document.status}`}><i />{document.status === 'ready' ? 'Indexed' : document.status === 'pending' ? 'Needs indexing' : document.status === 'processing' ? 'Processing' : 'Failed'}</span>
                  <span className="knowledge-access"><Sparkles size={14} />AI ready</span>
                  <button type="button" className="knowledge-delete" aria-label={`Delete ${document.name}`} disabled={deletingId === document.id} onClick={() => void deleteDocument(document)}>{deletingId === document.id ? <span className="knowledge-spinner" /> : <Trash2 size={16} />}</button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="knowledge-empty">
            <span><FileText size={22} /></span>
            <strong>{documents.length ? 'No matching documents' : 'Your document library is empty'}</strong>
            <p>{documents.length ? 'Try another search or file filter.' : 'Upload a document to give your agents trusted knowledge for their answers.'}</p>
            {documents.length ? <button type="button" className="knowledge-empty-action" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); }}>Clear filters</button> : <button type="button" className="knowledge-empty-action" onClick={triggerUpload}><FileUp size={15} />Upload a document</button>}
          </div>
        )}
      </section>

      <section className="knowledge-ask-section">
        <div className="knowledge-ask-heading">
          <div><span><MessageSquareText size={17} /></span><div><h2>Ask your documents</h2><p>Get answers grounded in your uploaded files.</p></div></div>
          <button type="button" className="knowledge-ask-toggle" aria-haspopup="dialog" onClick={() => setShowAsk(true)}>Open chat<Sparkles size={14} /></button>
        </div>
      </section>

      {showAsk && (
        <div className="knowledge-chat-backdrop" role="presentation" onClick={() => setShowAsk(false)}>
          <section
            className="knowledge-chat-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-chat-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="knowledge-chat-header">
              <div className="knowledge-chat-title">
                <span><Sparkles size={17} /></span>
                <div><h2 id="knowledge-chat-title">Knowledge Base Chat</h2><p>Answers grounded in your documents</p></div>
              </div>
              <button type="button" className="knowledge-chat-close" aria-label="Close chat" onClick={() => setShowAsk(false)}><X size={18} /></button>
            </header>

            <div className="knowledge-chat-layout">
              <section className="knowledge-chat-conversation" aria-label="Chat with AI">
                <div className="knowledge-chat-messages" aria-live="polite">
                  {messages.length === 0 && (
                    <div className="knowledge-chat-message assistant">
                      <span className="knowledge-chat-message-avatar"><Bot size={16} /></span>
                      <div className="knowledge-chat-bubble">
                        <strong>Knowledge Assistant</strong>
                        <p>Ask me anything about the documents in your knowledge base.</p>
                      </div>
                    </div>
                  )}
                  {messages.map((message, index) => (
                    <div className={`knowledge-chat-message ${message.role}`} key={`${index}-${message.role}`}>
                      <span className="knowledge-chat-message-avatar">
                        {message.role === 'assistant' ? <Bot size={16} /> : <UserRound size={15} />}
                      </span>
                      <div className="knowledge-chat-bubble">
                        {message.role === 'assistant' && <strong>Knowledge Assistant</strong>}
                        <p>{message.content}</p>
                      </div>
                    </div>
                  ))}
                  {isAsking && (
                    <div className="knowledge-chat-message assistant" role="status">
                      <span className="knowledge-chat-message-avatar"><Bot size={16} /></span>
                      <div className="knowledge-chat-bubble knowledge-chat-thinking"><span /><span /><span />Searching your documents</div>
                    </div>
                  )}
                </div>

                <form className="knowledge-chat-composer" onSubmit={(event) => void askQuestion(event)}>
                  {!canAskDocuments && <p className="knowledge-ask-hint">Upload and index a document to ask document-specific questions. Greetings still work.</p>}
                  {pendingCount > 0 && readyCount === 0 && <p className="knowledge-ask-hint">Existing documents will be indexed when you ask a question.</p>}
                  {chatError && <p className="knowledge-chat-error" role="alert">{chatError}</p>}
                  <div className="knowledge-chat-input-row">
                    <input
                      ref={chatInput}
                      required
                      maxLength={2000}
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder="Ask a question about your documents..."
                      aria-label="Question about documents"
                    />
                    <button type="submit" className="knowledge-ask-submit" aria-label="Send question" disabled={isAsking || !question.trim() || (!canAskDocuments && !getQuickResponse(question))}>
                      {isAsking ? 'Searching...' : <Send size={16} />}
                    </button>
                  </div>
                  <small>AI responses may be inaccurate. Verify important details with the source documents.</small>
                </form>
              </section>

            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function DatabaseIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
}
