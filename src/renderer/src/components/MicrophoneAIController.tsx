// MicrophoneAIController.tsx
// SINGLE-PAGE MIC → IRIS AI CORE FIX

import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { voiceService } from "../services/voiceService";
import { microphoneHandler } from "../services/microphoneHandler";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg";
  onTranscript?: (text: string) => void;
};

export default function MicrophoneAIController({
  className = "",
  size = "md",
  onTranscript,
}: Props) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<any>(null);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    microphoneHandler.configure({
      onAudioLevel: (lvl) => {
        if (mountedRef.current) setAudioLevel(lvl);
      }
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("[IRIS MIC] Speech Recognition unavailable");
      // Fallback listener to microphoneHandler state if speech recognition API is absent
      const unsub = microphoneHandler.configure({
        onStateChange: (state) => {
          if (!mountedRef.current) return;
          setListening(state === "listening" || state === "streaming-live");
          setProcessing(state === "processing" || state === "transcribing");
          setDenied(state === "denied");
        },
        onFinalTranscript: (text) => {
          if (mountedRef.current && text) {
            setTranscript(text);
            onTranscript?.(text);
          }
        },
      });
      return () => {
        mountedRef.current = false;
      };
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[IRIS MIC] Started");

      if (!mountedRef.current) return;

      setListening(true);
      setProcessing(false);
      setDenied(false);
    };

    recognition.onresult = async (event: any) => {
      let finalText = "";
      let interimText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result = event.results[i];

        const text =
          result?.[0]?.transcript?.trim() || "";

        if (result.isFinal) {
          finalText += text + " ";
        } else {
          interimText += text + " ";
        }
      }

      const liveText =
        `${finalText} ${interimText}`
          .replace(/\s+/g, " ")
          .trim();

      if (liveText && mountedRef.current) {
        setTranscript(liveText);
        onTranscript?.(liveText);
      }

      // ==========================================
      // FINAL SPEECH → IRIS AI CORE
      // ==========================================

      const command = finalText
        .replace(/\s+/g, " ")
        .trim();

      if (!command) return;
      if (processingRef.current) return;

      processingRef.current = true;

      console.log(
        "[IRIS MIC → AI CORE]",
        command
      );

      if (mountedRef.current) {
        setProcessing(true);
      }

      try {
        /*
         * Existing IRIS pipeline
         *
         * Voice
         *   ↓
         * SpeechRecognition
         *   ↓
         * triggerVoiceInput()
         *   ↓
         * processUserSpeech()
         *   ↓
         * Command Processor
         *   ↓
         * AI Core
         */

        await Promise.resolve(
          voiceService.triggerVoiceInput(
            command,
            "voice"
          )
        );

        console.log(
          "[IRIS MIC → AI CORE] SUCCESS"
        );
      } catch (error) {
        console.error(
          "[IRIS MIC → AI CORE] FAILED",
          error
        );
      } finally {
        try {
          recognition.stop();
        } catch (_) {}

        if (mountedRef.current) {
          setListening(false);
          setProcessing(false);
        }

        processingRef.current = false;
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("[IRIS MIC ERROR]", event?.error);

      if (event?.error === "not-allowed") {
        setDenied(true);
      }

      if (mountedRef.current) {
        setListening(false);
        setProcessing(false);
      }

      processingRef.current = false;
    };

    recognition.onend = () => {
      console.log("[IRIS MIC] Stopped");

      if (mountedRef.current) {
        setListening(false);
        setProcessing(false);
      }

      processingRef.current = false;
    };

    recognitionRef.current = recognition;

    return () => {
      mountedRef.current = false;

      try {
        recognition.stop();
      } catch (_) {}
    };
  }, [onTranscript]);

  const toggleMic = async () => {
    if (processing) return;

    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch (_) {}
      return;
    }

    try {
      setTranscript("");
      processingRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.start();
      } else {
        await microphoneHandler.toggleListening();
      }
    } catch (err) {
      console.warn("[IRIS MIC START ERROR]", err);
      // Fallback
      await microphoneHandler.toggleListening();
    }
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  const sizeClasses = {
    sm: "p-1.5 h-8 w-8 text-xs",
    md: "p-2 sm:p-2.5 h-9 w-9 sm:h-10 sm:w-10 text-sm",
    lg: "p-3 h-12 w-12 text-base",
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Dynamic Volume-Reactive Pulsing Outer Halo when Listening */}
      {listening && (
        <div
          className="absolute inset-0 rounded-2xl blur-md pointer-events-none transition-all duration-100"
          style={{
            transform: `scale(${1 + audioLevel * 1.4})`,
            opacity: 0.35 + audioLevel * 0.55,
            backgroundColor:
              audioLevel > 0.75
                ? 'rgba(244, 63, 94, 0.5)'
                : audioLevel > 0.40
                ? 'rgba(245, 158, 11, 0.5)'
                : audioLevel > 0.18
                ? 'rgba(6, 182, 212, 0.5)'
                : 'rgba(16, 185, 129, 0.5)'
          }}
        />
      )}

      <button
        type="button"
        onClick={toggleMic}
        disabled={processing}
        title={
          denied
            ? "Microphone access denied. Please enable microphone permissions in browser settings."
            : processing
            ? "IRIS is processing your voice input..."
            : listening
            ? "IRIS is listening... Click to stop"
            : "Click to speak with IRIS AI Core"
        }
        className={`relative inline-flex items-center justify-center rounded-xl border transition-all duration-150 cursor-pointer select-none focus:outline-none z-10 ${sizeClasses[size]} ${
          denied
            ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
            : processing
            ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400 animate-pulse cursor-wait"
            : listening
            ? audioLevel > 0.75
              ? "bg-rose-500 text-white border-rose-300 shadow-[0_0_25px_rgba(244,63,94,0.8)] font-bold"
              : audioLevel > 0.40
              ? "bg-amber-400 text-black border-amber-300 shadow-[0_0_22px_rgba(245,158,11,0.7)] font-bold"
              : audioLevel > 0.18
              ? "bg-cyan-400 text-black border-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.6)] font-bold"
              : "bg-emerald-500 text-black border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] font-bold"
            : "bg-white/5 border-white/10 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-white/10 active:scale-95"
        } ${className}`}
      >
        {processing ? (
          <Loader2 size={iconSizes[size]} className="animate-spin text-cyan-400" />
        ) : denied ? (
          <MicOff size={iconSizes[size]} />
        ) : listening ? (
          <div className="relative flex items-center justify-center">
            <Mic size={iconSizes[size]} />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
          </div>
        ) : (
          <Mic size={iconSizes[size]} />
        )}
      </button>

      {/* Live interim transcript overlay if active */}
      {listening && transcript && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-zinc-900/95 text-emerald-300 text-xs rounded-lg border border-emerald-500/40 shadow-xl whitespace-nowrap pointer-events-none z-50 max-w-xs truncate">
          {transcript}
        </div>
      )}
    </div>
  );
}

export { MicrophoneAIController }
