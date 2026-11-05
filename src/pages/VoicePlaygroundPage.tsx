import {
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  Globe,
  Headphones,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { Agent, DocumentItem, VoiceSession } from '../types';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

function getTranscriptionLanguageCodes(language: string): string[] {
  const normalized = language.trim().toLocaleLowerCase();
  const namedLanguages: Record<string, string> = {
    arabic: 'ar-SA',
    bengali: 'bn-BD',
    chinese: 'zh-CN',
    english: 'en-US',
    french: 'fr-FR',
    german: 'de-DE',
    gujarati: 'gu-IN',
    hindi: 'hi-IN',
    kannada: 'kn-IN',
    korean: 'ko-KR',
    malayalam: 'ml-IN',
    marathi: 'mr-IN',
    portuguese: 'pt-BR',
    punjabi: 'pa-IN',
    russian: 'ru-RU',
    spanish: 'es-ES',
    tamil: 'ta-IN',
    telugu: 'te-IN',
    urdu: 'ur-PK',
  };
  const namedMatch = Object.entries(namedLanguages).find(([name]) =>
    normalized === name || normalized.startsWith(`${name} `) || normalized.startsWith(`${name}(`),
  );
  if (namedMatch) return [namedMatch[1]];

  const localeMatch = language.trim().match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i);
  return localeMatch ? [localeMatch[0]] : [];
}

function mergeTranscription(current: string, chunk: string): string {
  const previous = current.trimEnd();
  const next = chunk.trim();
  if (!previous) return next;
  if (!next) return previous;

  const previousLower = previous.toLocaleLowerCase();
  const nextLower = next.toLocaleLowerCase();
  if (nextLower.startsWith(previousLower)) return next;
  if (previousLower.startsWith(nextLower) || previousLower.endsWith(nextLower)) return previous;

  const maxOverlap = Math.min(previous.length, next.length);
  for (let overlap = maxOverlap; overlap > 1; overlap -= 1) {
    if (previousLower.endsWith(nextLower.slice(0, overlap))) {
      return `${previous}${next.slice(overlap)}`;
    }
  }

  return `${previous} ${next}`;
}

type LiveServerMessage = {
  setupComplete?: unknown;
  error?: { message?: string };
  serverContent?: {
    inputTranscription?: { text?: string; finished?: boolean };
    interimInputTranscription?: { text?: string };
    outputTranscription?: { text?: string; finished?: boolean };
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
};

async function decodeWebSocketMessage(data: unknown): Promise<LiveServerMessage> {
  let text: string;
  if (typeof data === 'string') {
    text = data;
  } else if (data instanceof Blob) {
    text = await data.text();
  } else if (data instanceof ArrayBuffer) {
    text = new TextDecoder().decode(data);
  } else if (ArrayBuffer.isView(data)) {
    text = new TextDecoder().decode(data);
  } else {
    throw new Error('Gemini Live returned an unsupported WebSocket frame type.');
  }

  try {
    return JSON.parse(text) as LiveServerMessage;
  } catch {
    throw new Error('Gemini Live returned a non-JSON WebSocket frame.');
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? (error.code === 'ERR_NETWORK' ? 'Cannot connect to the API server.' : error.message);
  }
  return error instanceof Error ? error.message : fallback;
}

function resampleTo16k(input: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / INPUT_SAMPLE_RATE;
  const output = new Int16Array(Math.floor(input.length / ratio));

  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), input.length);
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += input[sample];
    const value = sum / Math.max(1, end - start);
    output[index] = Math.max(-1, Math.min(1, value)) * (value < 0 ? 0x8000 : 0x7fff);
  }

  return output;
}

function encodeBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function decodePcm(data: string): Float32Array {
  const binary = atob(data);
  const sampleCount = Math.floor(binary.length / 2);
  const view = new DataView(new ArrayBuffer(sampleCount * 2));
  for (let index = 0; index < sampleCount; index += 1) {
    view.setUint8(index * 2, binary.charCodeAt(index * 2));
    view.setUint8(index * 2 + 1, binary.charCodeAt(index * 2 + 1));
  }

  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}

export function VoicePlaygroundPage({
  transcript,
  updateTranscript,
  clearTranscript,
  agents,
  documents,
  onStartSession,
  onCreateTranscriptionTicket,
  transcriptionWebSocketUrl,
  onEndSession,
  onSaveMessage,
}: {
  transcript: string[];
  updateTranscript: (message: string) => void;
  clearTranscript: () => void;
  agents: Agent[];
  documents: DocumentItem[];
  onStartSession: (agentId: string, timeZone: string) => Promise<VoiceSession>;
  onCreateTranscriptionTicket: (sessionId: string) => Promise<string>;
  transcriptionWebSocketUrl: string;
  onEndSession: (sessionId: string) => Promise<void>;
  onSaveMessage: (sessionId: string, role: 'user' | 'assistant', content: string) => Promise<void>;
}) {
  const activeStream = useRef<MediaStream | null>(null);
  const activeSocket = useRef<WebSocket | null>(null);
  const transcriptionSocket = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const microphoneSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessor = useRef<ScriptProcessorNode | null>(null);
  const playbackSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackCursor = useRef(0);
  const sessionId = useRef<string | null>(null);
  const isMutedRef = useRef(false);
  const isEndingRef = useRef(false);
  const outputDraft = useRef('');
  const transcriptionFinalResolver = useRef<(() => void) | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeAgentTab, setActiveAgentTab] = useState<'instructions' | 'knowledge' | 'settings'>('instructions');

  const recordTranscript = (role: 'user' | 'assistant', content: string) => {
    updateTranscript(`${role === 'user' ? 'You' : 'Agent'}: ${content}`);
    const activeSessionId = sessionId.current;
    if (!activeSessionId) return;
    void onSaveMessage(activeSessionId, role, content).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Transcript could not be saved.');
    });
  };

  const flushTranscriptDrafts = () => {
    if (outputDraft.current.trim()) recordTranscript('assistant', outputDraft.current.trim());
    outputDraft.current = '';
  };

  const endStoredSession = () => {
    const activeSessionId = sessionId.current;
    sessionId.current = null;
    if (!activeSessionId) return;
    void onEndSession(activeSessionId).catch((error: unknown) => {
      setErrorMessage(getErrorMessage(error, 'The call ended, but its final status could not be saved.'));
    });
  };

  const stopAudio = () => {
    audioProcessor.current?.disconnect();
    microphoneSource.current?.disconnect();
    audioProcessor.current = null;
    microphoneSource.current = null;
    activeStream.current?.getTracks().forEach((track) => track.stop());
    activeStream.current = null;
    playbackSources.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // A source can finish between turns and explicit cleanup.
      }
      source.disconnect();
    });
    playbackSources.current.clear();
    const context = audioContext.current;
    audioContext.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch((error: unknown) => console.error('Could not close voice audio context.', error));
    }
  };

  const stopSocket = () => {
    transcriptionFinalResolver.current?.();
    const socket = activeSocket.current;
    activeSocket.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Call ended');
    const transcription = transcriptionSocket.current;
    transcriptionSocket.current = null;
    if (transcription && transcription.readyState < WebSocket.CLOSING) {
      transcription.close(1000, 'Call ended');
    }
  };

  const stopCallResources = () => {
    stopSocket();
    stopAudio();
  };

  useEffect(() => {
    return () => {
      isEndingRef.current = true;
      stopCallResources();
    };
  }, []);

  useEffect(() => {
    isMutedRef.current = isMuted;
    activeStream.current?.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }, [isMuted]);

  const playAudio = (base64: string) => {
    const context = audioContext.current;
    if (!context) return;

    const samples = decodePcm(base64);
    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, playbackCursor.current);
    source.start(startAt);
    playbackCursor.current = startAt + buffer.duration;
    playbackSources.current.add(source);
    source.onended = () => {
      playbackSources.current.delete(source);
      source.disconnect();
    };
  };

  const handleLiveMessage = (message: LiveServerMessage) => {
    if (message.error) {
      setErrorMessage(message.error.message ?? 'Gemini Live returned an error.');
      stopCallResources();
      endStoredSession();
      setIsActive(false);
      return;
    }

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      playbackSources.current.forEach((source) => {
        try {
          source.stop();
        } catch {
          // The source may have already finished.
        }
      });
      playbackSources.current.clear();
      playbackCursor.current = audioContext.current?.currentTime ?? 0;
    }

    const output = content.outputTranscription;
    if (output?.text) outputDraft.current = mergeTranscription(outputDraft.current, output.text);
    if (output?.finished && outputDraft.current) {
      recordTranscript('assistant', outputDraft.current);
      outputDraft.current = '';
    }

    if (content.turnComplete) {
      flushTranscriptDrafts();
    }

    content.modelTurn?.parts?.forEach((part) => {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) {
        try {
          playAudio(part.inlineData.data);
        } catch (error) {
          console.error('Could not play Gemini Live audio.', error);
          setErrorMessage('Could not play the audio response. The call has been stopped.');
          stopCallResources();
          endStoredSession();
          setIsActive(false);
        }
      }
    });
  };

  const connectTranscriptionSession = async (sessionId: string) => {
    const ticket = await onCreateTranscriptionTicket(sessionId);
    const url = new URL(transcriptionWebSocketUrl);
    url.searchParams.set('ticket', ticket);
    url.searchParams.set('sessionId', sessionId);
    const socket = new WebSocket(url);
    transcriptionSocket.current = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error('Timed out while connecting to the speech transcriber.'));
      }, 20000);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      };

      socket.onopen = () => {
        try {
          socket.send(JSON.stringify({
            setup: {
              model: 'models/gemini-3.5-transcribe-live',
              generationConfig: { responseModalities: ['TEXT'] },
              inputAudioTranscription: {
                languageCodes: getTranscriptionLanguageCodes(activeAgent?.language ?? 'English'),
                mode: 'SMART',
              },
            },
          }));
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Could not start the speech transcriber.'));
        }
      };

      socket.onmessage = async (event: MessageEvent) => {
        let message: LiveServerMessage;
        try {
          message = await decodeWebSocketMessage(event.data);
        } catch (error) {
          const messageError = error instanceof Error ? error.message : 'The speech transcriber returned an unreadable response.';
          if (settled) {
            setErrorMessage(messageError);
            stopCallResources();
            endStoredSession();
            setIsActive(false);
          } else {
            fail(new Error(messageError));
          }
          return;
        }

        if (message.error) {
          const error = new Error(message.error.message ?? 'The speech transcriber returned an error.');
          if (settled) {
            setErrorMessage(error.message);
            stopCallResources();
            endStoredSession();
            setIsActive(false);
          } else {
            fail(error);
          }
          return;
        }
        if (message.setupComplete !== undefined) {
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            resolve();
          }
          return;
        }

        const content = message.serverContent;
        if (content?.interimInputTranscription?.text) {
          setInterimTranscript(content.interimInputTranscription.text);
        }
        if (content?.inputTranscription?.text) {
          const finalText = content.inputTranscription.text.trim();
          if (finalText) recordTranscript('user', finalText);
          setInterimTranscript('');
          transcriptionFinalResolver.current?.();
          transcriptionFinalResolver.current = null;
        }
      };

      socket.onerror = () => fail(new Error(
        'Could not connect to the Gemini speech transcriber. Check the server logs and Gemini API key/model access.',
      ));
      socket.onclose = (event) => {
        transcriptionFinalResolver.current?.();
        if (!settled) {
          fail(new Error(event.reason || 'The speech transcriber closed before it was ready.'));
        } else if (transcriptionSocket.current === socket && !isEndingRef.current) {
          transcriptionSocket.current = null;
          setErrorMessage(event.reason || 'The speech transcriber connection was closed.');
          stopCallResources();
          endStoredSession();
          setIsActive(false);
        }
      };
    });
  };

  const connectLiveSession = async (session: VoiceSession) => {
    const url = new URL(session.websocketUrl);
    url.searchParams.set('access_token', session.ephemeralToken);
    const socket = new WebSocket(url);
    activeSocket.current = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timed out while connecting to Gemini Live.'));
        socket.close();
      }, 20000);

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      };

      socket.onopen = () => {
        try {
          socket.send(
            JSON.stringify({
              setup: {
                model: `models/${session.model}`,
                generationConfig: {
                  responseModalities: ['AUDIO'],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: session.voiceName },
                    },
                  },
                },
                systemInstruction: { parts: [{ text: session.systemInstruction }] },
                realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
                outputAudioTranscription: {},
              },
            }),
          );
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Could not send Gemini Live setup.'));
        }
      };

      socket.onmessage = async (event: MessageEvent) => {
        let message: LiveServerMessage;
        try {
          message = await decodeWebSocketMessage(event.data);
        } catch (error) {
          console.error('Could not decode Gemini Live WebSocket message.', error);
          const messageError =
            error instanceof Error ? error.message : 'Gemini Live returned an unreadable setup response.';
          if (settled) {
            setErrorMessage(messageError);
            stopCallResources();
            endStoredSession();
            setIsActive(false);
          } else {
            fail(new Error(messageError));
          }
          return;
        }

        if (message.error) {
          const error = new Error(message.error.message ?? 'Gemini Live rejected the session setup.');
          if (settled) {
            handleLiveMessage(message);
          } else {
            fail(error);
          }
          return;
        }
        if (message.setupComplete !== undefined) {
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            resolve();
          }
          return;
        }
        if (settled) handleLiveMessage(message);
      };

      socket.onerror = () => fail(new Error('Could not connect to Gemini Live. Check your network and API configuration.'));
      socket.onclose = (event) => {
        if (!settled) {
          fail(new Error(event.reason || 'Gemini Live closed before the session was ready.'));
        } else if (activeSocket.current === socket && !isEndingRef.current) {
          activeSocket.current = null;
          stopAudio();
          endStoredSession();
          setIsActive(false);
          setErrorMessage(event.reason || 'The Gemini Live connection was closed.');
        }
      };
    });

    socket.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: 'Start the conversation now and greet me.' }] }],
          turnComplete: true,
        },
      }),
    );
    setStatusMessage(`Connected to Gemini Live using ${session.model}.`);
  };

  const finishTranscriptionSession = async () => {
    const socket = transcriptionSocket.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    await new Promise<void>((resolve, reject) => {
      let timeout = 0;
      const finish = () => {
        window.clearTimeout(timeout);
        if (transcriptionFinalResolver.current === finish) transcriptionFinalResolver.current = null;
        resolve();
      };
      transcriptionFinalResolver.current = finish;
      timeout = window.setTimeout(finish, 1500);
      try {
        socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      } catch (error) {
        window.clearTimeout(timeout);
        transcriptionFinalResolver.current = null;
        reject(error);
      }
    });
  };

  const startCall = async () => {
    setErrorMessage('');
    setStatusMessage('');

    const selectedAgent =
      agents.find((agent) => agent.id === selectedAgentId && agent.status === 'active') ??
      agents.find((agent) => agent.status === 'active');
    if (!selectedAgent) {
      setErrorMessage('Select an active voice agent before starting a call.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.WebSocket || !window.AudioContext) {
      setErrorMessage('Live voice calls require a browser with microphone, audio, and WebSocket support.');
      return;
    }

    isEndingRef.current = false;
    setIsStarting(true);
    setStatusMessage('Waiting for microphone permission...');
    try {
      const [streamResult, sessionResult] = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        onStartSession(selectedAgent.id, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
      ]);
      if (streamResult.status === 'rejected' || sessionResult.status === 'rejected') {
        if (streamResult.status === 'fulfilled') {
          streamResult.value.getTracks().forEach((track) => track.stop());
        }
        if (sessionResult.status === 'fulfilled') {
          try {
            await onEndSession(sessionResult.value.sessionId);
          } catch (error) {
            console.error('Could not close the unused voice session.', error);
          }
        }
        if (streamResult.status === 'rejected') throw streamResult.reason;
        if (sessionResult.status === 'rejected') throw sessionResult.reason;
        throw new Error('Could not prepare the voice session.');
      }
      const stream = streamResult.value;
      const session = sessionResult.value;
      activeStream.current = stream;
      const context = new AudioContext();
      audioContext.current = context;
      await context.resume();

      setStatusMessage('Microphone connected. Connecting to Gemini Live...');
      sessionId.current = session.sessionId;
      await Promise.all([
        connectLiveSession(session),
        connectTranscriptionSession(session.sessionId),
      ]);

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      microphoneSource.current = source;
      audioProcessor.current = processor;
      processor.onaudioprocess = (event) => {
        event.outputBuffer.getChannelData(0).fill(0);
        const socket = activeSocket.current;
        if (!socket || socket.readyState !== WebSocket.OPEN || isMutedRef.current) return;
        const transcription = transcriptionSocket.current;
        if (!transcription || transcription.readyState !== WebSocket.OPEN) {
          setErrorMessage('The speech transcriber connection was interrupted.');
          isEndingRef.current = true;
          stopCallResources();
          endStoredSession();
          setIsActive(false);
          return;
        }
        const pcm = resampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate);
        const audio = { data: encodeBase64(pcm), mimeType: 'audio/pcm;rate=16000' };
        try {
          socket.send(JSON.stringify({ realtimeInput: { audio } }));
          transcription.send(JSON.stringify({ realtimeInput: { audio } }));
        } catch (error) {
          console.error('Could not send microphone audio to Gemini Live.', error);
          setErrorMessage('The Gemini Live audio connection was interrupted.');
          isEndingRef.current = true;
          stopCallResources();
          endStoredSession();
          setIsActive(false);
        }
      };
      source.connect(processor);
      processor.connect(context.destination);
      setIsMuted(false);
      setIsActive(true);
      setStatusMessage(`Connected to ${selectedAgent.name}. Start speaking.`);
      updateTranscript(`System: Live call connected to ${selectedAgent.name}.`);
    } catch (error) {
      stopCallResources();
      const failedSessionId = sessionId.current;
      sessionId.current = null;
      if (failedSessionId) {
        try {
          await onEndSession(failedSessionId);
        } catch (cleanupError) {
          console.error('Could not close the failed voice session.', cleanupError);
        }
      }
      setErrorMessage(getErrorMessage(error, 'Unable to start the live call.'));
      setStatusMessage('');
    } finally {
      setIsStarting(false);
    }
  };

  const endCall = async () => {
    setErrorMessage('');
    isEndingRef.current = true;
    setIsEnding(true);
    setIsActive(false);
    setIsMuted(false);
    flushTranscriptDrafts();
    setInterimTranscript('');
    stopAudio();

    try {
      await finishTranscriptionSession();
      stopSocket();
      if (sessionId.current) await onEndSession(sessionId.current);
      sessionId.current = null;
      setStatusMessage('Call ended. Your microphone is off.');
      updateTranscript('System: Call ended.');
    } catch (error) {
      stopSocket();
      setErrorMessage(getErrorMessage(error, 'Microphone stopped, but the voice session could not be closed.'));
    } finally {
      isEndingRef.current = false;
      setIsEnding(false);
    }
  };

  const activeAgent = agents.find((agent) => agent.id === selectedAgentId) ??
    agents.find((agent) => agent.status === 'active');
  const transcriptIsEmpty = transcript.length === 0 && !interimTranscript;
  const currentStatus = errorMessage || statusMessage ||
    (isActive ? `Connected to ${activeAgent?.name ?? 'your agent'}. Start speaking.` : 'Ready to talk');
  const agentInstructions = activeAgent?.instructions || 'Create an agent to add its instructions here.';

  return (
    <div className="playground-page">
      <header className="playground-topbar">
        <div>
          <p className="eyebrow">Voice AI operations</p>
          <h1>Voice Playground</h1>
          <p>Have real-time voice conversations with your AI agents using Gemini Live.</p>
        </div>
      </header>

      <div className="playground-main-grid">
        <section className="playground-call-card">
          <div className="playground-call-toolbar">
            <span className={`playground-call-state ${errorMessage ? 'has-error' : isActive ? 'is-live' : ''}`} role={errorMessage ? 'alert' : 'status'}>
              <span />
              {errorMessage ? 'Connection issue' : isStarting ? 'Connecting...' : isEnding ? 'Ending call...' : isActive ? 'Live conversation' : currentStatus}
            </span>
            <button type="button" className="playground-audio-settings" onClick={() => setSettingsOpen(true)}><Settings size={15} /> Audio settings</button>
          </div>

          <div
            className={`playground-voice-art ${isActive ? 'is-active' : ''}`}
            role="img"
            aria-label={`${activeAgent?.name ?? 'Voice agent'}${isActive ? ' is in a live conversation' : ''}`}
          >
            <div className="playground-waveform playground-waveform-left">{Array.from({ length: 13 }, (_, index) => <span key={index} />)}</div>
            <div className="playground-orbit playground-orbit-outer" />
            <div className="playground-orbit playground-orbit-inner" />
            <div className="playground-agent-avatar">
              {activeAgent?.avatar
                ? <img src={activeAgent.avatar} alt="" />
                : <Headphones size={38} aria-hidden="true" />}
            </div>
            <div className="playground-waveform playground-waveform-right">{Array.from({ length: 13 }, (_, index) => <span key={index} />)}</div>
          </div>

          <div className="playground-call-controls">
            <button
              type="button"
              className={`playground-round-control ${isMuted ? 'control-muted' : ''}`}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              disabled={!isActive || isEnding}
              onClick={() => setIsMuted((muted) => !muted)}
            >
              {isMuted ? <MicOff size={20} /> : <MicOff size={20} />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
            <button
              type="button"
              className={`playground-start-control ${isActive ? 'is-ending' : ''}`}
              disabled={isStarting || isEnding}
              aria-label={isActive ? 'End call' : 'Start call'}
              onClick={isActive ? endCall : startCall}
            >
              {isActive ? <PhoneOff size={24} /> : <Mic size={24} />}
              <span>{isStarting ? 'Connecting...' : isEnding ? 'Ending...' : isActive ? 'End call' : 'Start call'}</span>
            </button>
            <div className="playground-round-control output-control" aria-label="Gemini speaker output"><Volume2 size={20} /><span>Speaker</span></div>
          </div>
          {(errorMessage || statusMessage) && (
            <p className={`playground-call-message ${errorMessage ? 'error' : ''}`} role={errorMessage ? 'alert' : 'status'}>
              {errorMessage || statusMessage}
            </p>
          )}
        </section>

        <section className="playground-agent-card">
          <div className="playground-section-label">AI AGENT</div>
          {activeAgent ? (
            <div className="playground-selected-agent">
              <span className="playground-selected-agent-icon">
                {activeAgent.avatar ? <img src={activeAgent.avatar} alt="" /> : <Headphones size={21} />}
              </span>
              <span className="playground-selected-agent-copy"><strong>{activeAgent.name}</strong><small>{activeAgent.description || 'Voice assistant'}</small></span>
              <span className={`playground-agent-status ${activeAgent.status === 'active' ? 'is-active' : ''}`}>{activeAgent.status}</span>
              <select
                aria-label="Select voice agent"
                value={activeAgent.id}
                disabled={isActive || isStarting}
                onChange={(event) => setSelectedAgentId(event.target.value)}
              >
                {agents.filter((agent) => agent.status === 'active').map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}
              </select>
              <ChevronDown className="playground-agent-chevron" size={16} aria-hidden="true" />
            </div>
          ) : (
            <div className="playground-no-agent">Create an active agent to start a voice conversation. <Link to="/agents">Create agent</Link></div>
          )}

          {activeAgent && (
            <>
              <div className="playground-agent-facts">
                <div><Globe size={18} /><span><small>Language</small><strong>{activeAgent.language}</strong></span></div>
                <div><AudioLines size={18} /><span><small>Voice</small><strong>{activeAgent.voice}</strong></span></div>
                <div><Sparkles size={18} /><span><small>Model</small><strong>{activeAgent.model}</strong></span></div>
                <div><MessageSquare size={18} /><span><small>Conversations</small><strong>{activeAgent.conversationCount}</strong></span></div>
              </div>

              <div className="playground-agent-tabs" role="tablist" aria-label="Agent details">
                <button type="button" role="tab" aria-selected={activeAgentTab === 'instructions'} className={activeAgentTab === 'instructions' ? 'is-selected' : ''} onClick={() => setActiveAgentTab('instructions')}>Instructions</button>
                <button type="button" role="tab" aria-selected={activeAgentTab === 'knowledge'} className={activeAgentTab === 'knowledge' ? 'is-selected' : ''} onClick={() => setActiveAgentTab('knowledge')}>Knowledge</button>
                <button type="button" role="tab" aria-selected={activeAgentTab === 'settings'} className={activeAgentTab === 'settings' ? 'is-selected' : ''} onClick={() => setActiveAgentTab('settings')}>Settings</button>
              </div>

              <div className="playground-agent-detail" role="tabpanel">
                <span className="playground-detail-icon">
                  {activeAgentTab === 'instructions' ? <MessageSquare size={19} /> : activeAgentTab === 'knowledge' ? <BookOpen size={19} /> : <Settings size={19} />}
                </span>
                <span>
                  <strong>{activeAgentTab === 'instructions' ? 'System instructions' : activeAgentTab === 'knowledge' ? 'Knowledge base' : 'Voice settings'}</strong>
                  <small>
                    {activeAgentTab === 'instructions'
                      ? agentInstructions
                      : activeAgentTab === 'knowledge'
                        ? documents.length
                          ? documents.map((document) => document.name).join(' · ')
                          : 'No documents uploaded yet.'
                        : `Speaking with ${activeAgent.voice} in ${activeAgent.language}.`}
                  </small>
                </span>
              </div>
              {activeAgentTab === 'knowledge' && documents.length === 0 && (
                <Link to="/knowledge" className="playground-knowledge-link">Open knowledge base</Link>
              )}
            </>
          )}
        </section>
      </div>

      <section className="playground-transcript-card">
        <div className="playground-transcript-heading">
          <h2>Conversation transcript</h2>
          <button type="button" className="playground-clear-transcript" disabled={transcriptIsEmpty} onClick={() => { clearTranscript(); setInterimTranscript(''); }}><Trash2 size={14} /> Clear transcript</button>
        </div>
        {transcriptIsEmpty ? (
          <div className="playground-transcript-empty">
            <span><MessageSquare size={21} /></span>
            <strong>Your conversation will appear here</strong>
            <p>Start a call to see the real-time transcript of your conversation.</p>
          </div>
        ) : (
          <div className="playground-transcript-list" aria-live="polite">
            {transcript.map((line, index) => (
              <div
                className={`playground-transcript-line${line.startsWith('Agent:') ? ' from-agent' : line.startsWith('System:') ? ' from-system' : ''}`}
                key={`${line}-${index}`}
              >
                {line}
              </div>
            ))}
            {interimTranscript && <div className="playground-transcript-line from-user is-interim">You: {interimTranscript}</div>}
          </div>
        )}
      </section>

      {settingsOpen && (
        <div className="playground-settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section className="playground-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="playground-settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="playground-settings-heading"><span><ShieldCheck size={18} /><strong id="playground-settings-title">Audio settings</strong></span><button type="button" aria-label="Close audio settings" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
            <div className="playground-settings-info"><Mic size={17} /><span><strong>Microphone access</strong><small>Your browser will request access when you start a call.</small></span></div>
            <div className="playground-settings-info"><Volume2 size={17} /><span><strong>Speaker output</strong><small>Gemini Live audio plays through your selected system output.</small></span></div>
            <button type="button" className="playground-settings-done" onClick={() => setSettingsOpen(false)}><Check size={16} /> Done</button>
          </section>
        </div>
      )}
    </div>
  );
}
