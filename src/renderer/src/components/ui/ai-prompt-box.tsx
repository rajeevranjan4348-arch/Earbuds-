import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUp, Paperclip, Square, X, StopCircle, Mic, BrainCog, FileText, File as FileIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Utility function for className merging
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ");

// Embedded CSS for minimal custom styles
if (typeof document !== "undefined") {
  const styleId = "ai-prompt-box-styles";
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement("style");
    styleSheet.id = styleId;
    styleSheet.innerText = `
      *:focus-visible {
        outline-offset: 0 !important;
        --ring-offset: 0 !important;
      }
      textarea::-webkit-scrollbar {
        width: 6px;
      }
      textarea::-webkit-scrollbar-track {
        background: transparent;
      }
      textarea::-webkit-scrollbar-thumb {
        background-color: #444444;
        border-radius: 3px;
      }
      textarea::-webkit-scrollbar-thumb:hover {
        background-color: #555555;
      }
    `;
    document.head.appendChild(styleSheet);
  }
}

// Textarea Component
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex w-full rounded-md border-none bg-transparent px-2.5 py-0.5 text-xs sm:text-sm text-gray-100 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 min-h-[26px] resize-none scrollbar-thin scrollbar-thumb-[#444444] scrollbar-track-transparent hover:scrollbar-thumb-[#555555]",
      className
    )}
    ref={ref}
    rows={1}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// Tooltip Components
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-[#333333] bg-[#1F2023] px-3 py-1.5 text-sm text-white shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Dialog Components
const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] md:max-w-[800px] translate-x-[-50%] translate-y-[-50%] gap-4 border border-[#333333] bg-[#1F2023] p-0 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-2xl",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-full bg-[#2E3033]/80 p-2 hover:bg-[#2E3033] transition-all">
        <X className="h-5 w-5 text-gray-200 hover:text-white" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight text-gray-100", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantClasses = {
      default: "bg-white hover:bg-white/80 text-black",
      outline: "border border-[#444444] bg-transparent hover:bg-[#3A3A40]",
      ghost: "bg-transparent hover:bg-[#3A3A40]",
    };
    const sizeClasses = {
      default: "h-8 px-3 py-1 text-xs",
      sm: "h-7 px-2.5 text-xs",
      lg: "h-10 px-5 text-sm",
      icon: "h-7.5 w-7.5 rounded-full aspect-[1/1]",
    };
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// VoiceRecorder Component
interface VoiceRecorderProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: (duration: number) => void;
  visualizerBars?: number;
}
const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  isRecording,
  onStartRecording,
  onStopRecording,
  visualizerBars = 32,
}) => {
  const [time, setTime] = React.useState(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const wasRecordingRef = React.useRef(false);

  React.useEffect(() => {
    if (isRecording) {
      wasRecordingRef.current = true;
      onStartRecording?.();
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (wasRecordingRef.current) {
        wasRecordingRef.current = false;
        onStopRecording?.(time);
      }
      setTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, onStartRecording, onStopRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center w-full transition-all duration-300 py-3",
        isRecording ? "opacity-100" : "opacity-0 h-0 pointer-events-none overflow-hidden"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="font-mono text-sm text-white/80">{formatTime(time)}</span>
      </div>
      <div className="w-full h-10 flex items-center justify-center gap-0.5 px-4">
        {[...Array(visualizerBars)].map((_, i) => (
          <div
            key={i}
            className="w-0.5 rounded-full bg-white/50 animate-pulse"
            style={{
              height: `${Math.max(15, Math.random() * 100)}%`,
              animationDelay: `${i * 0.05}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ImageViewDialog Component
interface ImageViewDialogProps {
  imageUrl: string | null;
  onClose: () => void;
}
const ImageViewDialog: React.FC<ImageViewDialogProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;
  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[90vw] md:max-w-[800px]">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-[#1F2023] rounded-2xl overflow-hidden shadow-2xl"
        >
          <img
            src={imageUrl}
            alt="Full preview"
            className="w-full max-h-[80vh] object-contain rounded-2xl"
          />
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

// PromptInput Context and Components
interface PromptInputContextType {
  isLoading: boolean;
  value: string;
  setValue: (value: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
}
const PromptInputContext = React.createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
});
function usePromptInput() {
  const context = React.useContext(PromptInputContext);
  if (!context) throw new Error("usePromptInput must be used within a PromptInput");
  return context;
}

interface PromptInputProps {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}
const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      className,
      isLoading = false,
      maxHeight = 240,
      value,
      onValueChange,
      onSubmit,
      children,
      disabled = false,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(value || "");
    const handleChange = (newValue: string) => {
      setInternalValue(newValue);
      onValueChange?.(newValue);
    };
    return (
      <TooltipProvider>
        <PromptInputContext.Provider
          value={{
            isLoading,
            value: value ?? internalValue,
            setValue: onValueChange ?? handleChange,
            maxHeight,
            onSubmit,
            disabled,
          }}
        >
          <div
            ref={ref}
            className={cn(
              "rounded-3xl border border-[#444444] bg-[#1F2023] px-3 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition-all duration-300",
              isLoading && "border-red-500/70",
              className
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {children}
          </div>
        </PromptInputContext.Provider>
      </TooltipProvider>
    );
  }
);
PromptInput.displayName = "PromptInput";

interface PromptInputTextareaProps {
  disableAutosize?: boolean;
  placeholder?: string;
}
const PromptInputTextarea: React.FC<PromptInputTextareaProps & React.ComponentProps<typeof Textarea>> = ({
  className,
  onKeyDown,
  disableAutosize = false,
  placeholder,
  ...props
}) => {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (disableAutosize || !textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height =
      typeof maxHeight === "number"
        ? `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
        : `min(${textareaRef.current.scrollHeight}px, ${maxHeight})`;
  }, [value, maxHeight, disableAutosize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
    onKeyDown?.(e);
  };

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className={cn("text-base", className)}
      disabled={disabled}
      placeholder={placeholder}
      {...props}
    />
  );
};

interface PromptInputActionsProps extends React.HTMLAttributes<HTMLDivElement> {}
const PromptInputActions: React.FC<PromptInputActionsProps> = ({ children, className, ...props }) => (
  <div className={cn("flex items-center gap-2", className)} {...props}>
    {children}
  </div>
);

interface PromptInputActionProps extends React.ComponentProps<typeof Tooltip> {
  tooltip: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}
const PromptInputAction: React.FC<PromptInputActionProps> = ({
  tooltip,
  children,
  className,
  side = "top",
  ...props
}) => {
  const { disabled } = usePromptInput();
  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

// Custom Divider Component
const CustomDivider: React.FC = () => (
  <div className="relative h-6 w-[1.5px] mx-1">
    <div
      className="absolute inset-0 bg-gradient-to-t from-transparent via-[#9b87f5]/70 to-transparent rounded-full"
      style={{
        clipPath: "polygon(0% 0%, 100% 0%, 100% 40%, 140% 50%, 100% 60%, 100% 100%, 0% 100%, 0% 60%, -40% 50%, 0% 40%)",
      }}
    />
  </div>
);

// Main PromptInputBox Component
interface PromptInputBoxProps {
  onSend?: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}
export const PromptInputBox = React.forwardRef<HTMLDivElement, PromptInputBoxProps>((props, ref) => {
  const { onSend = () => {}, isLoading = false, placeholder = "Type your message here...", className } = props;
  const [input, setInput] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [filePreviews, setFilePreviews] = React.useState<{ [key: string]: string }>({});
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [isSTTListening, setIsSTTListening] = React.useState(false);
  const [sttInterim, setSttInterim] = React.useState("");
  const [sttError, setSttError] = React.useState<string | null>(null);
  const recognitionRef = React.useRef<any>(null);

  const toggleVoiceToText = async () => {
    setSttError(null);

    if (isSTTListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_e) {}
      }
      setIsSTTListening(false);
      setSttInterim("");
      return;
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setSttError("Web Speech API voice recognition is not supported on this browser.");
      return;
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (_err) {
        setSttError("Microphone access was denied. Please allow microphone permissions in browser settings.");
        return;
      }
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsSTTListening(true);
        setSttInterim("");
      };

      recognition.onresult = (event: any) => {
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) {
            finalText += transcript + " ";
          } else {
            interimText += transcript;
          }
        }

        if (finalText) {
          setInput((prev) => (prev ? `${prev.trim()} ${finalText.trim()}` : finalText.trim()));
        }
        setSttInterim(interimText);
      };

      recognition.onerror = (event: any) => {
        const err = event.error || "unknown";
        if (err !== "no-speech" && err !== "aborted") {
          console.warn("[Web Speech STT Error]:", err);
          setSttError(`Voice-to-Text notice: ${err}`);
        }
        setIsSTTListening(false);
        setSttInterim("");
      };

      recognition.onend = () => {
        setIsSTTListening(false);
        setSttInterim("");
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn("[Web Speech STT Init Error]:", err);
      setSttError("Could not initialize Voice-to-Text speech recognition.");
      setIsSTTListening(false);
    }
  };
  const [showSearch, setShowSearch] = React.useState(false);
  const [showThink, setShowThink] = React.useState(false);
  const [showCanvas, setShowCanvas] = React.useState(false);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const promptBoxRef = React.useRef<HTMLDivElement>(null);

  const MAX_CHAT_FILES = 10;
  const [fileLimitWarning, setFileLimitWarning] = React.useState<string | null>(null);

  const handleToggleChange = (value: string) => {
    if (value === "search") {
      setShowSearch((prev) => !prev);
      setShowThink(false);
    } else if (value === "think") {
      setShowThink((prev) => !prev);
      setShowSearch(false);
    }
  };

  const handleCanvasToggle = () => setShowCanvas((prev) => !prev);

  const processFiles = (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    if (fileArray.length === 0) return;

    setFiles((prevFiles) => {
      const remainingSlots = MAX_CHAT_FILES - prevFiles.length;
      if (remainingSlots <= 0) {
        setFileLimitWarning(`Maximum ${MAX_CHAT_FILES} files can be shared in chat at once.`);
        setTimeout(() => setFileLimitWarning(null), 3500);
        return prevFiles;
      }

      if (fileArray.length > remainingSlots) {
        setFileLimitWarning(`Only ${remainingSlots} more file(s) could be added (max ${MAX_CHAT_FILES} files total).`);
        setTimeout(() => setFileLimitWarning(null), 3500);
      }

      const accepted = fileArray.slice(0, remainingSlots);

      accepted.forEach((file) => {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setFilePreviews((prev) => ({
              ...prev,
              [file.name]: e.target?.result as string
            }));
          };
          reader.readAsDataURL(file);
        }
      });

      return [...prevFiles, ...accepted];
    });
  };

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, []);

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => {
      const fileToRemove = prev[index];
      if (fileToRemove && filePreviews[fileToRemove.name]) {
        setFilePreviews((prevPrev) => {
          const updated = { ...prevPrev };
          delete updated[fileToRemove.name];
          return updated;
        });
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const openImageModal = (imageUrl: string) => setSelectedImage(imageUrl);

  const handlePaste = React.useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      processFiles(pastedFiles);
    }
  }, []);

  React.useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  // Listen for files shared from the Gallery
  React.useEffect(() => {
    const handleShareFromGallery = (e: any) => {
      const incomingFiles = e.detail?.files;
      if (Array.isArray(incomingFiles) && incomingFiles.length > 0) {
        const filesToAdd: File[] = [];
        const previewsToAdd: Record<string, string> = {};

        incomingFiles.slice(0, MAX_CHAT_FILES).forEach((f: any) => {
          const mockFile = new File([""], f.name || f.displayName || "shared_file", {
            type: f.mimeType || (f.type === "image" ? "image/jpeg" : "application/octet-stream")
          });
          (mockFile as any).customUrl = f.url;
          filesToAdd.push(mockFile);
          if (f.url) {
            previewsToAdd[mockFile.name] = f.url;
          }
        });

        setFiles((prev) => {
          const availableSlots = MAX_CHAT_FILES - prev.length;
          const accepted = filesToAdd.slice(0, availableSlots);
          return [...prev, ...accepted];
        });
        setFilePreviews((prev) => ({ ...prev, ...previewsToAdd }));
      }
    };

    window.addEventListener("iris:share-to-chat", handleShareFromGallery);
    return () => window.removeEventListener("iris:share-to-chat", handleShareFromGallery);
  }, []);

  const handleSubmit = () => {
    if (input.trim() || files.length > 0) {
      let messagePrefix = "";
      if (showSearch) messagePrefix = "[Search: ";
      else if (showThink) messagePrefix = "[Think: ";
      else if (showCanvas) messagePrefix = "[Canvas: ";
      const formattedInput = messagePrefix ? `${messagePrefix}${input}]` : input;
      onSend(formattedInput, files);
      setInput("");
      setFiles([]);
      setFilePreviews({});
    }
  };

  const handleStartRecording = () => {
    setIsRecording(true);
  };

  const handleStopRecording = (duration: number) => {
    setIsRecording(false);
    onSend(`[Voice message - ${duration} seconds]`, []);
  };

  const hasContent = input.trim() !== "" || files.length > 0;

  return (
    <>
      <PromptInput
        value={input}
        onValueChange={setInput}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        className={cn(
          "w-full bg-[#1F2023] border-[#444444] shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition-all duration-300 ease-in-out",
          isRecording && "border-red-500/70",
          className
        )}
        disabled={isLoading || isRecording}
        ref={ref || promptBoxRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {sttError && (
          <div className="px-2.5 py-1 mb-1 bg-amber-950/80 border border-amber-500/40 rounded-lg text-amber-300 text-[11px] font-mono flex items-center justify-between">
            <span>{sttError}</span>
            <button
              type="button"
              onClick={() => setSttError(null)}
              className="text-amber-400 hover:text-white ml-2"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {isSTTListening && (
          <div className="px-3 py-1.5 mb-1.5 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-mono flex items-center justify-between shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span className="font-bold uppercase tracking-wider text-[11px] shrink-0 text-emerald-400">
                Voice-to-Text:
              </span>
              <span className="italic text-emerald-100 truncate">
                {sttInterim ? `"${sttInterim}"` : "Listening... Speak into microphone"}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleVoiceToText}
              className="text-emerald-400 hover:text-white ml-2 text-[10px] font-bold uppercase underline cursor-pointer shrink-0"
            >
              Stop
            </button>
          </div>
        )}

        {files.length > 0 && !isRecording && (
          <div className="flex flex-wrap items-center gap-1.5 p-0 pb-1.5 transition-all duration-300">
            <div className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 mr-1">
              {files.length}/{MAX_CHAT_FILES} files
            </div>

            {files.map((file, index) => {
              const isImg = file.type.startsWith("image/");
              const isVid = file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
              const isAud = file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(file.name);
              const previewUrl = filePreviews[file.name] || (file as any).customUrl;

              return (
                <div key={index} className="relative group flex items-center">
                  {isImg && previewUrl ? (
                    <div
                      className="w-12 h-12 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border border-white/10 hover:border-emerald-500/50 relative bg-black/40"
                      onClick={() => openImageModal(previewUrl)}
                      title={file.name}
                    >
                      <img
                        src={previewUrl}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-neutral-800/90 border border-white/10 text-zinc-300 text-[11px] max-w-[140px] truncate"
                      title={file.name}
                    >
                      {isVid ? (
                        <Film className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      ) : isAud ? (
                        <Music className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="truncate">{file.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="absolute -top-1 -right-1 rounded-full bg-zinc-900 border border-white/20 p-0.5 text-white hover:bg-red-500 hover:border-red-400 transition-colors shadow-sm"
                    title="Remove file"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <VoiceRecorder
          isRecording={isRecording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
        />

        {!isRecording && (
          <PromptInputTextarea placeholder={placeholder} />
        )}

        <div className="flex items-center justify-between pt-0.5">
          <PromptInputActions>
            <input
              type="file"
              ref={uploadInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processFiles(e.target.files);
                  if (uploadInputRef.current) uploadInputRef.current.value = "";
                }
              }}
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,.md,.zip,.tar,.gz,.js,.ts,.py"
              className="hidden"
            />
            <PromptInputAction tooltip="Attach Files, Photos, Video, Audio (Max 10)">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => uploadInputRef.current?.click()}
                className="text-gray-400 hover:text-white relative"
              >
                <Paperclip className="h-4 w-4" />
                {files.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-black text-[9px] font-bold flex items-center justify-center">
                    {files.length}
                  </span>
                )}
              </Button>
            </PromptInputAction>

            <PromptInputAction tooltip={isSTTListening ? "Stop Voice-to-Text" : "Voice-to-Text (Hands-Free)"}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleVoiceToText}
                className={cn(
                  "text-gray-400 hover:text-emerald-400 transition-colors relative",
                  isSTTListening && "text-red-500 hover:text-red-400"
                )}
              >
                {isSTTListening ? (
                  <StopCircle className="h-4 w-4 text-red-500 animate-pulse" />
                ) : (
                  <Mic className="h-4 w-4 text-emerald-400" />
                )}
                {isSTTListening && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                )}
              </Button>
            </PromptInputAction>
          </PromptInputActions>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="icon"
              disabled={!hasContent || isLoading}
              onClick={handleSubmit}
              className={cn(
                "rounded-full bg-emerald-500 hover:bg-emerald-400 text-black transition-all",
                (!hasContent || isLoading) && "opacity-40 bg-zinc-700 text-zinc-400"
              )}
            >
              {isLoading ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </PromptInput>

      <ImageViewDialog
        imageUrl={selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
});
PromptInputBox.displayName = "PromptInputBox";

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
  VoiceRecorder,
  ImageViewDialog,
  Button,
  Textarea,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Dialog,
  DialogContent,
  DialogTitle,
};

export default PromptInputBox;
