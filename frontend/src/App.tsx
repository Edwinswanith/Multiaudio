import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Types
type ProcessingMode = 'strict' | 'balanced';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

interface TranscriptMessage {
  type: string;
  text?: string;
  is_final?: boolean;
  language?: string;
  message?: string;
}

interface GeminiResult {
  raw_transcript: string;
  cleaned_meaning: string;
  prompt_ready: string;
  detected_languages: string[];
  risk_level: RiskLevel;
  confidence: number;
  error?: string;
}

// Audio Recorder Hook
function useAudioRecorder(onAudioChunk: (chunk: ArrayBuffer) => void) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      mediaStreamRef.current = stream;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onAudioChunk(pcmData.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      console.log('Recording started at', audioContext.sampleRate, 'Hz');
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      return false;
    }
  }, [onAudioChunk]);

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    console.log('Recording stopped');
  }, []);

  return { startRecording, stopRecording };
}

// WebSocket Hook
function useWebSocketTranscription() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [currentPartial, setCurrentPartial] = useState('');
  const [geminiResults, setGeminiResults] = useState<GeminiResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');
    setError(null);

    const ws = new WebSocket('ws://localhost:8000/ws/transcribe');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received:', data);

        if (data.type === 'transcript') {
          if (data.is_final) {
            setTranscripts(prev => [...prev, data]);
            setCurrentPartial('');
          } else {
            setCurrentPartial(data.text || '');
          }
        } else if (data.type === 'processing') {
          setIsProcessing(true);
        } else if (data.type === 'gemini_result') {
          setIsProcessing(false);
          setGeminiResults(prev => [...prev, {
            raw_transcript: data.raw_transcript,
            cleaned_meaning: data.cleaned_meaning,
            prompt_ready: data.prompt_ready,
            detected_languages: data.detected_languages,
            risk_level: data.risk_level,
            confidence: data.confidence,
            error: data.error
          }]);
        } else if (data.type === 'error') {
          setError(data.message || 'Unknown error');
          setConnectionStatus('error');
        } else if (data.type === 'connected') {
          console.log('Backend connected:', data.message);
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setConnectionStatus('error');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, []);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioData);
    }
  }, []);

  const sendStop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  const setMode = useCallback((mode: ProcessingMode) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_mode', mode }));
    }
  }, []);

  const clearAll = useCallback(() => {
    setTranscripts([]);
    setCurrentPartial('');
    setGeminiResults([]);
    setError(null);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear' }));
    }
  }, []);

  return {
    connect,
    disconnect,
    sendAudio,
    sendStop,
    setMode,
    clearAll,
    connectionStatus,
    transcripts,
    currentPartial,
    geminiResults,
    isProcessing,
    error
  };
}

// Waveform Visualizer - Light Theme
function WaveformVisualizer({ isRecording }: { isRecording: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const bars = 48;
    const barWidth = canvas.width / bars;

    const draw = () => {
      // Light background
      ctx.fillStyle = '#F1F5F9'; // slate-100
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < bars; i++) {
        const height = isRecording
          ? Math.random() * canvas.height * 0.8 + canvas.height * 0.1
          : canvas.height * 0.08;

        const x = i * barWidth;
        const y = (canvas.height - height) / 2;

        const gradient = ctx.createLinearGradient(x, y, x, y + height);
        if (isRecording) {
          // Teal gradient when recording
          gradient.addColorStop(0, '#14B8A6'); // teal-500
          gradient.addColorStop(0.5, '#2DD4BF'); // teal-400
          gradient.addColorStop(1, '#14B8A6'); // teal-500
        } else {
          // Slate gradient when idle
          gradient.addColorStop(0, '#CBD5E1'); // slate-300
          gradient.addColorStop(0.5, '#94A3B8'); // slate-400
          gradient.addColorStop(1, '#CBD5E1'); // slate-300
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x + 1, y, barWidth - 2, height);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRecording]);

  return <canvas ref={canvasRef} width={280} height={48} className="rounded-lg" />;
}

// Record Button - Light Theme
function RecordButton({ isRecording, onToggle, disabled }: {
  isRecording: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      onClick={onToggle}
      disabled={disabled}
      className="relative group disabled:opacity-50 disabled:cursor-not-allowed"
      whileTap={disabled ? {} : { scale: 0.95 }}
    >
      <div className={`absolute inset-0 rounded-full transition-all duration-300 ${isRecording ? 'bg-gradient-to-r from-teal-500/20 to-teal-400/20 animate-pulse' : 'bg-slate-100'}`} />
      <div className={`relative w-16 h-16 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${isRecording ? 'border-teal-500 bg-gradient-to-br from-teal-500 to-teal-600' : 'border-slate-300 bg-white hover:border-teal-400 hover:bg-teal-50'}`}>
        <motion.div animate={isRecording ? { scale: [1, 0.8, 1] } : { scale: 1 }} transition={{ repeat: Infinity, duration: 1 }}>
          {isRecording ? (
            <div className="w-5 h-5 bg-white rounded-sm" />
          ) : (
            <svg className="w-6 h-6 text-slate-500 group-hover:text-teal-600 transition-colors" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          )}
        </motion.div>
      </div>
    </motion.button>
  );
}

// Connection Badge - Light Theme
function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const config = {
    disconnected: { label: 'Disconnected', color: 'bg-slate-100 text-slate-500 border-slate-300' },
    connecting: { label: 'Connecting', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    connected: { label: 'Connected', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    error: { label: 'Error', color: 'bg-red-50 text-red-600 border-red-200' },
  };
  const { label, color } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${color}`}>
      {status === 'connected' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
      {status === 'connecting' && <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />}
      {label}
    </span>
  );
}

// Risk Badge - Light Theme
function RiskBadge({ level }: { level: RiskLevel }) {
  const config = {
    low: { label: 'Low Risk', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    medium: { label: 'Medium Risk', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    high: { label: 'High Risk', color: 'bg-red-50 text-red-700 border-red-200' },
    unknown: { label: 'Unknown', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  };
  const { label, color } = config[level];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${color}`}>
      {label}
    </span>
  );
}

// Language Badge - Light Theme
function LanguageBadge({ lang }: { lang: string }) {
  const labels: Record<string, string> = {
    en: 'EN', ta: 'TA', hi: 'HI', english: 'EN', tamil: 'TA', hindi: 'HI', tunglish: 'TU',
  };
  return (
    <span className="px-2 py-0.5 text-[11px] font-mono uppercase bg-slate-100 text-slate-600 border border-slate-200 rounded">
      {labels[lang.toLowerCase()] || lang.toUpperCase().slice(0, 2)}
    </span>
  );
}

// Main App - Light Theme
export default function VoicePromptStudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [mode, setModeState] = useState<ProcessingMode>('balanced');
  const [copied, setCopied] = useState(false);

  const {
    connect, disconnect, sendAudio, sendStop, setMode, clearAll,
    connectionStatus, transcripts, currentPartial, geminiResults, isProcessing, error
  } = useWebSocketTranscription();

  const { startRecording, stopRecording } = useAudioRecorder(sendAudio);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      sendStop();
      setIsRecording(false);
    } else {
      if (connectionStatus !== 'connected') {
        connect();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      const started = await startRecording();
      if (started) setIsRecording(true);
    }
  };

  const handleModeChange = (newMode: ProcessingMode) => {
    setModeState(newMode);
    setMode(newMode);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const latestResult = geminiResults[geminiResults.length - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800 font-sans">
      {/* Header */}
      <header className="relative z-10 border-b border-slate-200 bg-white/60 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-800">Voice Prompt Studio</h1>
          </div>

          <div className="flex items-center gap-4">
            <ConnectionBadge status={connectionStatus} />

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Memory</span>
              <button onClick={() => setMemoryEnabled(!memoryEnabled)} className={`relative w-10 h-5 rounded-full transition-all ${memoryEnabled ? 'bg-teal-100 border border-teal-300' : 'bg-slate-100 border border-slate-300'}`}>
                <motion.div animate={{ x: memoryEnabled ? 20 : 2 }} className={`absolute top-0.5 w-4 h-4 rounded-full ${memoryEnabled ? 'bg-teal-500' : 'bg-slate-400'}`} />
              </button>
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200">
              {(['strict', 'balanced'] as const).map(m => (
                <button key={m} onClick={() => handleModeChange(m)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${mode === m ? 'bg-white text-teal-600 border border-teal-200' : 'text-slate-500 hover:text-slate-700'}`}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            <button onClick={clearAll} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
              Clear
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Three Panes */}
      <main className="relative z-10 max-w-[1600px] mx-auto p-4">
        <div className="grid grid-cols-3 gap-4 h-[calc(100vh-80px)]">

          {/* Left: Recording + Raw Transcript */}
          <div className="flex flex-col gap-4">
            {/* Recording Panel */}
            <div className="bg-white/70 backdrop-blur-lg rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-4 justify-center">
                <WaveformVisualizer isRecording={isRecording} />
                <RecordButton isRecording={isRecording} onToggle={handleToggleRecording} disabled={connectionStatus === 'connecting'} />
              </div>
              <p className="text-center text-xs font-medium text-slate-500 mt-3">
                {isRecording ? 'Recording...' : 'Click to speak'}
              </p>
            </div>

            {/* Raw Transcript */}
            <div className="flex-1 bg-white/70 backdrop-blur-lg rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 bg-white/50 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Raw Transcript</span>
                <span className="text-xs font-mono text-slate-400">{transcripts.length} segments</span>
              </div>
              <div className="flex-1 p-4 overflow-y-auto space-y-2">
                {transcripts.map((t, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-white/80 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-mono text-slate-400">#{i + 1}</span>
                      {t.language && <LanguageBadge lang={t.language} />}
                    </div>
                    <p className="text-[15px] text-slate-700">{t.text}</p>
                  </motion.div>
                ))}
                {currentPartial && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                      <span className="text-[11px] font-mono text-teal-600 uppercase">Transcribing</span>
                    </div>
                    <p className="text-[15px] text-slate-700">{currentPartial}<span className="inline-block w-0.5 h-4 bg-teal-500 ml-0.5 animate-pulse" /></p>
                  </motion.div>
                )}
                {transcripts.length === 0 && !currentPartial && (
                  <div className="h-full flex items-center justify-center text-slate-400 text-[15px]">
                    Speak to see transcript
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center: Cleaned English */}
          <div className="flex flex-col bg-white/70 backdrop-blur-lg rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-white/50 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Cleaned English</span>
              {isProcessing && <span className="text-xs font-mono text-teal-600 animate-pulse">Processing...</span>}
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-2">
              {geminiResults.map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-white/80 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-mono text-slate-400">#{i + 1}</span>
                    {r.detected_languages.map(l => <LanguageBadge key={l} lang={l} />)}
                    <RiskBadge level={r.risk_level} />
                  </div>
                  <p className="text-[15px] text-slate-700 leading-relaxed">{r.cleaned_meaning}</p>
                  {r.error && <p className="text-sm text-red-600 mt-2">{r.error}</p>}
                </motion.div>
              ))}
              {geminiResults.length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-400 text-[15px]">
                  Cleaned output will appear here
                </div>
              )}
            </div>
          </div>

          {/* Right: Prompt Ready */}
          <div className="flex flex-col bg-white/70 backdrop-blur-lg rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-white/50">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Prompt Ready</span>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-2">
              {geminiResults.map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg border border-teal-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-slate-400">#{i + 1}</span>
                    <button onClick={() => handleCopy(r.prompt_ready)} className="text-[11px] font-mono uppercase text-teal-600 hover:text-teal-500 transition-colors">
                      Copy
                    </button>
                  </div>
                  <p className="text-[15px] text-slate-800 leading-relaxed font-mono">{r.prompt_ready}</p>
                </motion.div>
              ))}
              {geminiResults.length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-400 text-[15px]">
                  Prompt-ready output will appear here
                </div>
              )}
            </div>

            {/* Copy All Button */}
            {latestResult && (
              <div className="p-4 border-t border-slate-200 bg-white/50">
                <motion.button
                  onClick={() => handleCopy(latestResult.prompt_ready)}
                  whileTap={{ scale: 0.95 }}
                  className={`w-full py-3 rounded-lg font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-gradient-to-r from-teal-500 to-teal-600 text-white hover:from-teal-400 hover:to-teal-500'}`}
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Latest Prompt
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Recording Indicator */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 bg-teal-500 rounded-full flex items-center gap-2.5"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-medium text-white">Recording...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-red-500 rounded-lg text-white text-sm border border-red-400"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
