import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Loader2,
  Copy,
  Download,
  Terminal,
  HelpCircle,
  Code2,
  Palette,
  Search,
  Folder,
  File,
  Plus,
  Trash2,
  GitBranch,
  GitCommit,
  UploadCloud,
  DownloadCloud,
  Edit2,
  Play,
  FileText,
  MessageSquare,
  Image as ImageIcon,
  X,
  TestTube
} from 'lucide-react';
import { getAiInstance } from './services/gemini';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useTheme } from './contexts/ThemeContext';
import ReactMarkdown from 'react-markdown';
import { Panel, Group, Separator } from 'react-resizable-panels';

interface FileNode {
  id: string;
  name: string;
  content: string;
  language: string;
  type?: 'file' | 'folder';
  parentId?: string | null;
  isOpen?: boolean;
}

interface Commit {
  id: string;
  message: string;
  timestamp: string;
  files: FileNode[];
}

interface TerminalOutput {
  id: string;
  type: 'command' | 'output' | 'error';
  text: string;
}

interface CoderProject {
  id: string;
  title: string;
  updatedAt: string;
  messages: { role: string; text: string }[];
  files: FileNode[];
  commits: Commit[];
}

export const CoderMode: React.FC = () => {
  const { getAccentClass, isDarkMode } = useTheme();

  const [projects, setProjects] = useState<CoderProject[]>(() => {
    const saved = localStorage.getItem('omnichat_coder_projects');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    // Migration from old format
    const oldMsgs = localStorage.getItem('omnichat_coder_messages');
    const oldFiles = localStorage.getItem('omnichat_coder_files');
    const oldCommits = localStorage.getItem('omnichat_coder_commits');

    if (oldMsgs || oldFiles || oldCommits) {
      let parsedMsgs = [
        {
          role: 'model',
          text: 'I am your AI Coding Assistant. Describe the component, script, or application you want to build.'
        }
      ];
      let parsedFiles = [
        { id: '1', name: 'index.js', content: '// Your generated code will appear here\n', language: 'javascript' }
      ];
      let parsedCommits: Commit[] = [];

      try {
        if (oldMsgs) parsedMsgs = JSON.parse(oldMsgs);
      } catch (e) {}
      try {
        if (oldFiles) parsedFiles = JSON.parse(oldFiles);
      } catch (e) {}
      try {
        if (oldCommits) {
          const c = JSON.parse(oldCommits);
          if (c.length === 0 || Array.isArray(c[0].files)) parsedCommits = c;
        }
      } catch (e) {}

      return [
        {
          id: '1',
          title: 'Legacy Project',
          updatedAt: new Date().toISOString(),
          messages: parsedMsgs,
          files: parsedFiles,
          commits: parsedCommits
        }
      ];
    }

    return [
      {
        id: '1',
        title: 'New Project',
        updatedAt: new Date().toISOString(),
        messages: [
          {
            role: 'model',
            text: 'I am your AI Coding Assistant. Describe the component, script, or application you want to build.'
          }
        ],
        files: [
          { id: '1', name: 'index.js', content: '// Your generated code will appear here\n', language: 'javascript' }
        ],
        commits: []
      }
    ];
  });

  const [currentProjectId, setCurrentProjectId] = useState<string>(() => {
    const saved = localStorage.getItem('omnichat_coder_current_project');
    return saved || projects[0]?.id || '1';
  });

  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];

  const [messages, setMessages] = useState<{ role: string; text: string }[]>(currentProject.messages);
  const [files, setFiles] = useState<FileNode[]>(currentProject.files);
  const [commits, setCommits] = useState<Commit[]>(currentProject.commits);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string>(currentProject.files[0]?.id || '1');
  const [commitMessage, setCommitMessage] = useState('');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'explorer' | 'git' | 'chats'>('explorer');

  const currentFile = files.find((f) => f.id === currentFileId) || files[0];
  const code = currentFile?.content || '';
  const language = currentFile?.language || 'javascript';

  const setCode = (newContent: string) => {
    setFiles((prev) => prev.map((f) => (f.id === currentFileId ? { ...f, content: newContent } : f)));
  };

  const setLanguage = (newLang: string) => {
    setFiles((prev) => prev.map((f) => (f.id === currentFileId ? { ...f, language: newLang } : f)));
  };

  const [editorTheme, setEditorTheme] = useState<string>('vs-dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<TerminalOutput[]>([
    {
      id: '0',
      type: 'output',
      text: 'Welcome to the OmniChat Terminal.\nType "help" for a list of simulated commands.'
    }
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [activeBottomTab, setActiveBottomTab] = useState<'preview' | 'terminal'>('preview');

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const monaco = useMonaco();

  useEffect(() => {
    localStorage.setItem('omnichat_coder_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('omnichat_coder_current_project', currentProjectId);
  }, [currentProjectId]);

  useEffect(() => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === currentProjectId) {
          return {
            ...p,
            messages,
            files,
            commits,
            updatedAt: new Date().toISOString()
          };
        }
        return p;
      })
    );
  }, [messages, files, commits, currentProjectId]);

  const handleCreateProject = () => {
    const newProject: CoderProject = {
      id: Date.now().toString(),
      title: 'New Project',
      updatedAt: new Date().toISOString(),
      messages: [
        {
          role: 'model',
          text: 'I am your AI Coding Assistant. Describe the component, script, or application you want to build.'
        }
      ],
      files: [
        {
          id: Date.now().toString(),
          name: 'index.js',
          content: '// Your generated code will appear here\n',
          language: 'javascript'
        }
      ],
      commits: []
    };
    setProjects((prev) => [newProject, ...prev]);
    setCurrentProjectId(newProject.id);
    setMessages(newProject.messages);
    setFiles(newProject.files);
    setCommits(newProject.commits);
    setCurrentFileId(newProject.files[0].id);
  };

  const handleSwitchProject = (id: string) => {
    const p = projects.find((proj) => proj.id === id);
    if (p) {
      setCurrentProjectId(p.id);
      setMessages(p.messages);
      setFiles(p.files);
      setCommits(p.commits);
      setCurrentFileId(p.files[0]?.id || '1');
    }
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (projects.length === 1) {
      alert('Cannot delete the last project.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this project?')) {
      const remaining = projects.filter((p) => p.id !== id);
      setProjects(remaining);
      if (currentProjectId === id) {
        handleSwitchProject(remaining[0].id);
      }
    }
  };

  const glassClass = isDarkMode
    ? 'bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl'
    : 'bg-white/60 backdrop-blur-xl border border-slate-200 shadow-xl';

  const glassInputClass = isDarkMode
    ? 'bg-black/50 border border-white/10 focus:border-white/30 text-white placeholder-white/30'
    : 'bg-white/80 border border-slate-200 focus:border-slate-400 text-slate-900 placeholder-slate-400';

  useEffect(() => {
    if (monaco) {
      const provider = monaco.languages.registerCompletionItemProvider('*', {
        provideCompletionItems: async (model, position) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });
          const match = textUntilPosition.match(/\/\/\s*ai:\s*(.*)$/);
          if (match) {
            const prompt = match[1];
            if (prompt.length < 3) return { suggestions: [] };
            try {
              const ai = getAiInstance();
              const response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: `Complete this code snippet based on the prompt: "${prompt}". Return ONLY the code, no markdown, no explanations.`
              });
              const completion = (response.text || '')
                .replace(/```[\s\S]*?\n/g, '')
                .replace(/```/g, '');
              return {
                suggestions: [
                  {
                    label: 'AI Completion',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: completion,
                    detail: 'Gemini AI Completion',
                    range: {
                      startLineNumber: position.lineNumber,
                      endLineNumber: position.lineNumber,
                      startColumn: position.column - match[0].length,
                      endColumn: position.column
                    }
                  }
                ]
              };
            } catch (e) {
              return { suggestions: [] };
            }
          }
          return { suggestions: [] };
        }
      });
      return () => provider.dispose();
    }
  }, [monaco]);

  useEffect(() => {
    setEditorTheme(isDarkMode ? 'vs-dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const ai = getAiInstance();
    // Filter out the initial welcome message if it's the only one or the first one
    const historyMessages = messages.filter((m, idx) => {
      if (idx === 0 && m.role === 'model' && m.text.includes('I am your AI Coding Assistant')) {
        return false;
      }
      return m.text;
    });
    const history = historyMessages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    chatRef.current = ai.chats.create({
      model: 'gemini-3.1-pro-preview',
      history: history.length > 0 ? (history as any) : undefined,
      config: {
        systemInstruction:
          'You are an expert AI software engineer and code generator (like Codex or Cursor). When asked to write code, provide a brief explanation, but ALWAYS include the complete, working code in a markdown code block. Specify the language in the code block (e.g., ```html, ```javascript, ```python). If the user asks for a web component, try to provide a single file (HTML with embedded CSS/JS) if possible, so it can be previewed easily.',
        tools: [{ googleSearch: {} }]
      }
    });
  }, [currentProjectId]);

  useEffect(() => {
    if (monaco) {
      monaco.editor.defineTheme('dracula', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { background: '282a36', token: '' },
          { foreground: '6272a4', token: 'comment' },
          { foreground: 'f1fa8c', token: 'string' },
          { foreground: 'bd93f9', token: 'constant.numeric' },
          { foreground: 'bd93f9', token: 'constant.language' },
          { foreground: 'ff79c6', token: 'keyword' },
          { foreground: '50fa7b', token: 'string.key' },
          { foreground: '8be9fd', token: 'variable.parameter' }
        ],
        colors: {
          'editor.background': '#282a36',
          'editor.foreground': '#f8f8f2',
          'editorCursor.foreground': '#f8f8f0',
          'editor.selectionBackground': '#44475a',
          'editor.lineHighlightBackground': '#44475a'
        }
      });

      monaco.editor.defineTheme('monokai', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { background: '272822', token: '' },
          { foreground: '75715e', token: 'comment' },
          { foreground: 'e6db74', token: 'string' },
          { foreground: 'ae81ff', token: 'constant.numeric' },
          { foreground: 'ae81ff', token: 'constant.language' },
          { foreground: 'f92672', token: 'keyword' },
          { foreground: 'a6e22e', token: 'entity.name.function' }
        ],
        colors: {
          'editor.background': '#272822',
          'editor.foreground': '#f8f8f2',
          'editorCursor.foreground': '#f8f8f0',
          'editor.selectionBackground': '#49483e',
          'editor.lineHighlightBackground': '#3e3d32'
        }
      });

      monaco.editor.defineTheme('github-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { background: '0d1117', token: '' },
          { foreground: '8b949e', token: 'comment' },
          { foreground: 'a5d6ff', token: 'string' },
          { foreground: 'ff7b72', token: 'keyword' }
        ],
        colors: {
          'editor.background': '#0d1117',
          'editor.foreground': '#c9d1d9',
          'editorCursor.foreground': '#c9d1d9',
          'editor.selectionBackground': '#3392FF44',
          'editor.lineHighlightBackground': '#161b22'
        }
      });

      monaco.editor.defineTheme('nord', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { background: '2E3440', token: '' },
          { foreground: '4C566A', token: 'comment' },
          { foreground: 'A3BE8C', token: 'string' },
          { foreground: '81A1C1', token: 'keyword' },
          { foreground: '88C0D0', token: 'entity.name.function' },
          { foreground: 'B48EAD', token: 'constant.numeric' }
        ],
        colors: {
          'editor.background': '#2E3440',
          'editor.foreground': '#D8DEE9',
          'editorCursor.foreground': '#D8DEE9',
          'editor.selectionBackground': '#434C5E',
          'editor.lineHighlightBackground': '#3B4252'
        }
      });

      monaco.editor.defineTheme('solarized-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { background: '002b36', token: '' },
          { foreground: '586e75', token: 'comment' },
          { foreground: '2aa198', token: 'string' },
          { foreground: '859900', token: 'keyword' },
          { foreground: '268bd2', token: 'entity.name.function' },
          { foreground: 'd33682', token: 'constant.numeric' }
        ],
        colors: {
          'editor.background': '#002b36',
          'editor.foreground': '#839496',
          'editorCursor.foreground': '#839496',
          'editor.selectionBackground': '#073642',
          'editor.lineHighlightBackground': '#073642'
        }
      });

      monaco.editor.defineTheme('night-owl', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { background: '011627', token: '' },
          { foreground: '637777', token: 'comment' },
          { foreground: 'ecc48d', token: 'string' },
          { foreground: 'c792ea', token: 'keyword' },
          { foreground: '82aaff', token: 'entity.name.function' },
          { foreground: 'f78c6c', token: 'constant.numeric' }
        ],
        colors: {
          'editor.background': '#011627',
          'editor.foreground': '#d6deeb',
          'editorCursor.foreground': '#80a4c2',
          'editor.selectionBackground': '#1d3b53',
          'editor.lineHighlightBackground': '#0b2942'
        }
      });
    }
  }, [monaco]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeBottomTab === 'terminal') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalHistory, activeBottomTab]);

  const handleTerminalSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInput.trim()) {
      const cmd = terminalInput.trim();
      setTerminalHistory((prev) => [...prev, { id: Date.now().toString(), type: 'command', text: `$ ${cmd}` }]);
      setTerminalInput('');

      const args = cmd.split(' ').filter(Boolean);
      const baseCmd = args[0].toLowerCase();
      let output = '';
      let isError = false;

      if (baseCmd === 'clear') {
        setTerminalHistory([]);
        return;
      } else if (baseCmd === 'help') {
        output =
          'Available commands:\n ls List files\n cat Display file content (e.g., cat index.js)\n pwd Print working directory\n echo Print text\n node Simulate node execution\n clear Clear terminal';
      } else if (baseCmd === 'ls') {
        output = files.map((f) => f.name).join(' ');
      } else if (baseCmd === 'cat') {
        if (args[1]) {
          const file = files.find((f) => f.name === args[1]);
          if (file) {
            output = file.content;
          } else {
            output = `cat: ${args[1]}: No such file or directory`;
            isError = true;
          }
        } else {
          output = 'cat: missing operand';
          isError = true;
        }
      } else if (baseCmd === 'pwd') {
        output = '/home/project';
      } else if (baseCmd === 'echo') {
        output = args.slice(1).join(' ');
      } else if (baseCmd === 'node') {
        if (args[1]) {
          const file = files.find((f) => f.name === args[1]);
          if (file) {
            output = `Simulating node execution for ${args[1]}...\n(Execution requires backend)`;
          } else {
            output = `Error: Cannot find module '${args[1]}'`;
            isError = true;
          }
        } else {
          output = 'Welcome to Node.js v18.16.0.\nType ".help" for more information.';
        }
      } else {
        output = `bash: ${baseCmd}: command not found`;
        isError = true;
      }

      if (output) {
        setTerminalHistory((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            type: isError ? 'error' : 'output',
            text: output
          }
        ]);
      }
    }
  };

  const extractCode = (text: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    let lastCode = '';
    let lastLang = 'javascript';

    while ((match = codeBlockRegex.exec(text)) !== null) {
      lastLang = match[1] || 'javascript';
      lastCode = match[2];
    }

    if (lastCode) {
      const langMap: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        jsx: 'javascript',
        tsx: 'typescript',
        py: 'python',
        sh: 'shell',
        bash: 'shell',
        html: 'html',
        css: 'css',
        json: 'json'
      };
      const mappedLang = langMap[lastLang.toLowerCase()] || lastLang.toLowerCase();
      setFiles((prev) =>
        prev.map((f) => (f.id === currentFileId ? { ...f, content: lastCode, language: mappedLang } : f))
      );
    }
  };

  const handleCreateFile = () => {
    const name = prompt('Enter file name:');
    if (name) {
      const ext = name.split('.').pop() || '';
      const langMap: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        jsx: 'javascript',
        tsx: 'typescript',
        py: 'python',
        html: 'html',
        css: 'css',
        json: 'json',
        md: 'markdown'
      };
      const current = files.find((f) => f.id === currentFileId);
      const parentId = current?.type === 'folder' ? current.id : current?.parentId || null;

      const newFile: FileNode = {
        id: Date.now().toString(),
        name,
        content: '',
        language: langMap[ext] || 'plaintext',
        type: 'file',
        parentId
      };

      setFiles((prev) => {
        if (parentId) {
          return [...prev.map((f) => (f.id === parentId ? { ...f, isOpen: true } : f)), newFile];
        }
        return [...prev, newFile];
      });
      setCurrentFileId(newFile.id);
    }
  };

  const handleCreateFolder = () => {
    const name = prompt('Enter folder name:');
    if (name) {
      const current = files.find((f) => f.id === currentFileId);
      const parentId = current?.type === 'folder' ? current.id : current?.parentId || null;

      const newFolder: FileNode = {
        id: Date.now().toString(),
        name,
        content: '',
        language: '',
        type: 'folder',
        parentId,
        isOpen: true
      };

      setFiles((prev) => {
        if (parentId) {
          return [...prev.map((f) => (f.id === parentId ? { ...f, isOpen: true } : f)), newFolder];
        }
        return [...prev, newFolder];
      });
      setCurrentFileId(newFolder.id);
    }
  };

  const handleRenameFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const file = files.find((f) => f.id === id);
    if (!file) return;
    const newName = prompt('Enter new file name:', file.name);
    if (newName && newName !== file.name) {
      const ext = newName.split('.').pop() || '';
      const langMap: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        jsx: 'javascript',
        tsx: 'typescript',
        py: 'python',
        html: 'html',
        css: 'css',
        json: 'json',
        md: 'markdown'
      };
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, name: newName, language: langMap[ext] || f.language } : f
        )
      );
    }
  };

  const handleDeleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const getDescendants = (parentId: string): string[] => {
      const children = files.filter((f) => f.parentId === parentId).map((f) => f.id);
      return [...children, ...children.flatMap(getDescendants)];
    };
    const idsToDelete = [id, ...getDescendants(id)];
    const remainingFiles = files.filter((f) => !idsToDelete.includes(f.id));

    if (remainingFiles.filter((f) => f.type !== 'folder').length === 0) {
      alert('Cannot delete the last file.');
      return;
    }

    if (window.confirm('Are you sure you want to delete this item?')) {
      setFiles(remainingFiles);
      if (idsToDelete.includes(currentFileId)) {
        const nextFile = remainingFiles.find((f) => f.type !== 'folder');
        if (nextFile) setCurrentFileId(nextFile.id);
      }
    }
  };

  const handleCommit = () => {
    if (!commitMessage.trim()) return;
    const newCommit: Commit = {
      id: Math.random().toString(36).substring(2, 9),
      message: commitMessage,
      timestamp: new Date().toISOString(),
      files: JSON.parse(JSON.stringify(files)) // Deep copy
    };
    setCommits((prev) => [newCommit, ...prev]);
    setCommitMessage('');
  };

  const handlePull = () => {
    if (commits.length === 0) {
      alert('No commits to pull.');
      return;
    }
    if (window.confirm('This will overwrite your current files with the latest commit. Continue?')) {
      const latestCommit = commits[0];
      setFiles(latestCommit.files);
      if (!latestCommit.files.find((f) => f.id === currentFileId)) {
        setCurrentFileId(latestCommit.files[0]?.id || '1');
      }
    }
  };

  const handlePush = () => {
    alert('Changes pushed successfully! (Simulated)');
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !chatRef.current || isLoading) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsLoading(true);

    if (currentProject.title === 'New Project') {
      setProjects((prev) =>
        prev.map((p) => (p.id === currentProjectId ? { ...p, title: userMessage.substring(0, 30) } : p))
      );
    }

    try {
      const response = await chatRef.current.sendMessage({ message: userMessage });
      const replyText = response.text;
      setMessages((prev) => [...prev, { role: 'model', text: replyText }]);
      extractCode(replyText);
    } catch (error: any) {
      console.error('Coder error:', error);
      setMessages((prev) => [...prev, { role: 'model', text: 'Error generating code. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    setIsImageModalOpen(true);
    setIsGeneratingImage(true);
    setGeneratedImage(null);

    try {
      const ai = getAiInstance();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: 'a futuristic cityscape' }]
        },
        config: {
          imageConfig: {
            aspectRatio: '16:9'
          }
        }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64EncodeString: string = part.inlineData.data;
          const imageUrl = `data:image/png;base64,${base64EncodeString}`;
          setGeneratedImage(imageUrl);
          break;
        }
      }
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
      setIsImageModalOpen(false);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleCopy = () => navigator.clipboard.writeText(code);

  const handleDownloadTxt = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let filename = currentFile?.name || 'code';
    if (filename.includes('.')) {
      filename = filename.substring(0, filename.lastIndexOf('.'));
    }
    a.download = `${filename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile?.name || 'generated_code.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExplain = () => {
    if (!code.trim()) return;
    setInput(`Please explain the following ${language} code in detail:\n\n\`\`\`${language}\n${code}\n\`\`\``);
  };

  const handleGenerateTests = () => {
    if (!code.trim()) return;
    setInput(`Please write comprehensive unit tests for the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``);
  };

  const languages = [
    'javascript',
    'typescript',
    'html',
    'css',
    'python',
    'java',
    'cpp',
    'csharp',
    'go',
    'rust',
    'php',
    'ruby',
    'sql',
    'json',
    'markdown',
    'shell'
  ];

  const filteredLanguages = languages.filter((l) => l.includes(searchQuery.toLowerCase()));

  const renderFileTree = (parentId: string | null = null, level: number = 0) => {
    return files
      .filter((f) => (f.parentId || null) === parentId)
      .map((file) => (
        <React.Fragment key={file.id}>
          <div
            onClick={() => {
              if (file.type === 'folder') {
                setFiles((prev) =>
                  prev.map((f) => (f.id === file.id ? { ...f, isOpen: !f.isOpen } : f))
                );
                setCurrentFileId(file.id);
              } else {
                setCurrentFileId(file.id);
              }
            }}
            className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
              currentFileId === file.id
                ? isDarkMode
                  ? 'bg-white/15 text-white'
                  : 'bg-slate-200 text-slate-900'
                : isDarkMode
                ? 'hover:bg-white/5 text-white/70'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
            style={{ paddingLeft: `${0.5 + level * 1}rem` }}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {file.type === 'folder' ? (
                <Folder size={14} className={`shrink-0 opacity-70 ${file.isOpen ? 'fill-current' : ''}`} />
              ) : (
                <File size={14} className="shrink-0 opacity-70" />
              )}
              <span className="text-sm truncate">{file.name}</span>
            </div>
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => handleRenameFile(file.id, e)}
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-slate-500 dark:text-white/70"
                title="Rename"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={(e) => handleDeleteFile(file.id, e)}
                className="p-1 rounded hover:bg-red-500/20 text-red-500"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {file.type === 'folder' && file.isOpen && renderFileTree(file.id, level + 1)}
        </React.Fragment>
      ));
  };

  return (
    <div className={`flex h-full w-full p-2 gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'} bg-transparent`}>
      <Group orientation="horizontal" className="w-full h-full">
        {/* Leftmost Panel: Explorer & Git */}
        <Panel defaultSize={20} minSize={15} maxSize={30} className="flex flex-col h-full">
          <div className={`flex flex-col h-full rounded-2xl overflow-hidden ${glassClass}`}>
            <div
              className={`flex border-b ${
                isDarkMode ? 'border-white/10 bg-black/10' : 'border-slate-200 bg-white/40'
              }`}
            >
              <button
                onClick={() => setActiveSidebarTab('explorer')}
                className={`flex-1 py-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  activeSidebarTab === 'explorer'
                    ? isDarkMode
                      ? 'bg-white/10 text-white'
                      : 'bg-slate-200 text-slate-900'
                    : isDarkMode
                    ? 'text-white/60 hover:text-white hover:bg-white/5'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Folder size={14} /> Explorer
              </button>
              <button
                onClick={() => setActiveSidebarTab('git')}
                className={`flex-1 py-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  activeSidebarTab === 'git'
                    ? isDarkMode
                      ? 'bg-white/10 text-white'
                      : 'bg-slate-200 text-slate-900'
                    : isDarkMode
                    ? 'text-white/60 hover:text-white hover:bg-white/5'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <GitBranch size={14} /> Source
              </button>
              <button
                onClick={() => setActiveSidebarTab('chats')}
                className={`flex-1 py-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  activeSidebarTab === 'chats'
                    ? isDarkMode
                      ? 'bg-white/10 text-white'
                      : 'bg-slate-200 text-slate-900'
                    : isDarkMode
                    ? 'text-white/60 hover:text-white hover:bg-white/5'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <MessageSquare size={14} /> Chats
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {activeSidebarTab === 'explorer' ? (
                <div className="space-y-1">
                  <div
                    className={`flex items-center justify-between p-2 mb-2 ${
                      isDarkMode ? 'text-white/80' : 'text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider">Project Files</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleCreateFile}
                        className={`p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors`}
                        title="New File"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={handleCreateFolder}
                        className={`p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors`}
                        title="New Folder"
                      >
                        <Folder size={14} />
                      </button>
                    </div>
                  </div>
                  {renderFileTree()}
                </div>
              ) : activeSidebarTab === 'git' ? (
                <div className="space-y-4 p-2">
                  <div className="space-y-2">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        isDarkMode ? 'text-white/80' : 'text-slate-700'
                      }`}
                    >
                      Commit Changes
                    </span>
                    <textarea
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message..."
                      className={`w-full rounded-lg p-2 text-sm outline-none resize-none transition-all ${glassInputClass}`}
                      rows={2}
                    />
                    <button
                      onClick={handleCommit}
                      disabled={!commitMessage.trim()}
                      className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${getAccentClass()} disabled:opacity-50 transition-colors`}
                    >
                      <GitCommit size={14} /> Commit
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handlePull}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border ${
                        isDarkMode
                          ? 'border-white/20 hover:bg-white/10 text-white'
                          : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                      } transition-colors`}
                    >
                      <DownloadCloud size={14} /> Pull
                    </button>
                    <button
                      onClick={handlePush}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border ${
                        isDarkMode
                          ? 'border-white/20 hover:bg-white/10 text-white'
                          : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                      } transition-colors`}
                    >
                      <UploadCloud size={14} /> Push
                    </button>
                  </div>
                  <div className="space-y-2 mt-4">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        isDarkMode ? 'text-white/80' : 'text-slate-700'
                      }`}
                    >
                      Commit History
                    </span>
                    <div className="space-y-2">
                      {commits.length === 0 ? (
                        <div
                          className={`text-center text-sm py-4 ${
                            isDarkMode ? 'text-white/40' : 'text-slate-400'
                          }`}
                        >
                          No commits yet
                        </div>
                      ) : (
                        commits.map((commit) => (
                          <div
                            key={commit.id}
                            className={`p-2 rounded-lg border ${
                              isDarkMode ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white/50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`text-xs font-mono ${
                                  isDarkMode ? 'text-white/50' : 'text-slate-500'
                                }`}
                              >
                                {commit.id}
                              </span>
                              <span
                                className={`text-xs ${
                                  isDarkMode ? 'text-white/40' : 'text-slate-400'
                                }`}
                              >
                                {new Date(commit.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p
                              className={`text-sm ${
                                isDarkMode ? 'text-white/90' : 'text-slate-800'
                              }`}
                            >
                              {commit.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  <div
                    className={`flex items-center justify-between mb-2 ${
                      isDarkMode ? 'text-white/80' : 'text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider">Projects</span>
                    <button
                      onClick={handleCreateProject}
                      className={`p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors`}
                      title="New Project"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        onClick={() => handleSwitchProject(project.id)}
                        className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          currentProjectId === project.id
                            ? isDarkMode
                              ? 'bg-white/15 text-white'
                              : 'bg-slate-200 text-slate-900'
                            : isDarkMode
                            ? 'hover:bg-white/5 text-white/70'
                            : 'hover:bg-slate-100 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <MessageSquare size={14} className="shrink-0 opacity-70" />
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm truncate">{project.title}</span>
                            <span className="text-[10px] opacity-60 truncate">
                              {new Date(project.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleDeleteProject(project.id, e)}
                            className="p-1 rounded hover:bg-red-500/20 text-red-500"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>
        <Separator className="w-2 flex items-center justify-center cursor-col-resize group">
          <div className="w-1 h-8 rounded-full bg-slate-400/30 group-hover:bg-slate-400/70 transition-colors" />
        </Separator>
        {/* Left Panel: Chat Interface */}
        <Panel defaultSize={25} minSize={20} className="flex flex-col h-full">
          <div className={`flex flex-col h-full rounded-2xl overflow-hidden ${glassClass}`}>
            <div
              className={`p-4 border-b ${
                isDarkMode ? 'border-white/10' : 'border-slate-200'
              } flex items-center gap-2 bg-black/10`}
            >
              <Terminal size={18} className={getAccentClass()} />
              <h2 className="font-semibold text-sm tracking-wide uppercase opacity-80">AI Coder Prompt</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[90%] rounded-2xl p-3.5 shadow-sm ${
                      msg.role === 'user'
                        ? `${isDarkMode ? 'bg-white/15 text-white' : 'bg-slate-800 text-white'}`
                        : `${
                            isDarkMode
                              ? 'bg-black/40 text-white/90 border border-white/5'
                              : 'bg-white/80 text-slate-800 border border-slate-200'
                          }`
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                    ) : (
                      <div className={`prose prose-sm max-w-none ${isDarkMode ? 'prose-invert' : ''}`}>
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div
                  className={`flex items-center gap-2 text-sm ${
                    isDarkMode ? 'text-white/50' : 'text-slate-500'
                  } p-2`}
                >
                  <Loader2 size={16} className="animate-spin" /> Generating code...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form
              onSubmit={handleSendMessage}
              className={`p-3 border-t ${
                isDarkMode ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white/40'
              }`}
            >
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Describe what to build..."
                  className={`w-full rounded-xl pl-4 pr-20 py-3 text-sm outline-none resize-none transition-all ${glassInputClass}`}
                  rows={3}
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage}
                    title="Generate Image (Placeholder)"
                    className={`p-2 rounded-lg ${getAccentClass()} ${
                      isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                    } disabled:opacity-50 transition-colors`}
                  >
                    <ImageIcon size={18} />
                  </button>
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className={`p-2 rounded-lg ${getAccentClass()} ${
                      isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                    } disabled:opacity-50 transition-colors`}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </Panel>
        <Separator className="w-2 flex items-center justify-center cursor-col-resize group">
          <div className="w-1 h-8 rounded-full bg-slate-400/30 group-hover:bg-slate-400/70 transition-colors" />
        </Separator>
        {/* Middle Panel: Code Editor & Preview */}
        <Panel defaultSize={55} minSize={30} className="flex flex-col h-full">
          <div className={`flex flex-col h-full rounded-2xl overflow-hidden ${glassClass}`}>
            <div
              className={`flex items-center justify-between p-3 border-b ${
                isDarkMode ? 'border-white/10 bg-black/10' : 'border-slate-200 bg-white/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <Code2 size={18} className={getAccentClass()} />
                <span className="text-sm font-semibold tracking-wide uppercase opacity-80">Workspace</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleExplain}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'text-white/60 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title="Explain Code"
                >
                  <HelpCircle size={16} />
                </button>
                <button
                  onClick={handleGenerateTests}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'text-white/60 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title="Generate Tests"
                >
                  <TestTube size={16} />
                </button>
                <button
                  onClick={handleCopy}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'text-white/60 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title="Copy Code"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={handleDownload}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'text-white/60 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title="Download File"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'text-white/60 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title="Download as .txt"
                >
                  <FileText size={16} />
                  <span className="text-xs font-medium">.txt</span>
                </button>
              </div>
            </div>
            <div className="flex-1 relative">
              <Group orientation="vertical">
                <Panel defaultSize={60} minSize={20} className="flex flex-col">
                  <div className="flex-1 relative">
                    <Editor
                      height="100%"
                      language={language}
                      theme={editorTheme}
                      value={code}
                      onChange={(val) => setCode(val || '')}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        padding: { top: 16 },
                        scrollBeyondLastLine: false,
                        fontFamily: "'JetBrains Mono', monospace"
                      }}
                      className={isDarkMode ? 'bg-[#1e1e1e]/80' : 'bg-white/80'}
                    />
                  </div>
                </Panel>
                <Separator className="h-2 flex items-center justify-center cursor-row-resize group z-10 relative">
                  <div
                    className={`absolute inset-0 ${
                      isDarkMode ? 'bg-black/40' : 'bg-slate-200/50'
                    } backdrop-blur-sm`}
                  />
                  <div className="w-8 h-1 rounded-full bg-slate-400/50 group-hover:bg-slate-400 transition-colors z-20" />
                </Separator>
                <Panel defaultSize={40} minSize={20} className="flex flex-col relative bg-white">
                  <div
                    className={`flex items-center border-b ${
                      isDarkMode ? 'bg-black/80 border-white/10' : 'bg-slate-100 border-slate-200'
                    } z-10`}
                  >
                    <button
                      onClick={() => setActiveBottomTab('preview')}
                      className={`px-4 py-2 text-[10px] font-bold tracking-wider uppercase transition-colors flex items-center gap-1.5 ${
                        activeBottomTab === 'preview'
                          ? isDarkMode
                            ? 'bg-[#1e1e1e] text-white'
                            : 'bg-white text-slate-800'
                          : isDarkMode
                          ? 'text-white/50 hover:text-white hover:bg-white/5'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                      }`}
                    >
                      <Play size={12} /> Preview
                    </button>
                    <button
                      onClick={() => setActiveBottomTab('terminal')}
                      className={`px-4 py-2 text-[10px] font-bold tracking-wider uppercase transition-colors flex items-center gap-1.5 ${
                        activeBottomTab === 'terminal'
                          ? isDarkMode
                            ? 'bg-[#1e1e1e] text-white'
                            : 'bg-white text-slate-800'
                          : isDarkMode
                          ? 'text-white/50 hover:text-white hover:bg-white/5'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                      }`}
                    >
                      <Terminal size={12} /> Terminal
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto relative">
                    {activeBottomTab === 'preview' ? (
                      <>
                        {isLoading && (
                          <div
                            className={`absolute inset-0 z-10 flex flex-col p-6 gap-4 ${
                              isDarkMode ? 'bg-[#1e1e1e]/80' : 'bg-white/80'
                            } backdrop-blur-sm animate-pulse`}
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div
                                className={`w-10 h-10 rounded-full ${
                                  isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                                }`}
                              ></div>
                              <div className="flex flex-col gap-2 flex-1">
                                <div
                                  className={`h-3 w-1/4 rounded-md ${
                                    isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                                  }`}
                                ></div>
                                <div
                                  className={`h-3 w-1/3 rounded-md ${
                                    isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                                  }`}
                                ></div>
                              </div>
                            </div>
                            <div
                              className={`h-8 w-1/3 rounded-md ${
                                isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                              }`}
                            ></div>
                            <div
                              className={`h-32 w-full rounded-md ${
                                isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                              }`}
                            ></div>
                            <div className="flex gap-4">
                              <div
                                className={`h-24 w-1/2 rounded-md ${
                                  isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                                }`}
                              ></div>
                              <div
                                className={`h-24 w-1/2 rounded-md ${
                                  isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                                }`}
                              ></div>
                            </div>
                            <div
                              className={`h-8 w-1/4 rounded-md ${
                                isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                              }`}
                            ></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div
                                className={`px-4 py-2 rounded-full flex items-center gap-2 font-medium text-sm shadow-lg ${
                                  isDarkMode
                                    ? 'bg-slate-800 text-emerald-400'
                                    : 'bg-white text-emerald-600'
                                }`}
                              >
                                <Loader2 size={16} className="animate-spin" />
                                Generating Code...
                              </div>
                            </div>
                          </div>
                        )}
                        <iframe
                          title="preview"
                          srcDoc={`
<!DOCTYPE html>
<html>
<head>
${files
  .filter((f) => f.name.endsWith('.css'))
  .map((f) => `<style>${f.content}</style>`)
  .join('\n')}
</head>
<body>
${files.find((f) => f.name.endsWith('.html'))?.content || (language === 'html' ? code : '')}
${files
  .filter((f) => f.name.endsWith('.js'))
  .map((f) => `<script>${f.content}</script>`)
  .join('\n')}
</body>
</html>
`}
                          className={`w-full h-full border-none ${isDarkMode ? 'bg-white' : 'bg-white'}`}
                          sandbox="allow-scripts allow-modals"
                        />
                      </>
                    ) : (
                      <div
                        className="flex flex-col w-full h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm p-3"
                        onClick={() => terminalInputRef.current?.focus()}
                      >
                        <div className="flex-1 overflow-y-auto space-y-1 pb-2 custom-scrollbar">
                          {terminalHistory.map((item) => (
                            <div
                              key={item.id}
                              className={`${
                                item.type === 'command'
                                  ? 'text-emerald-400'
                                  : item.type === 'error'
                                  ? 'text-red-400'
                                  : 'text-slate-300'
                              } whitespace-pre-wrap font-mono`}
                            >
                              {item.text}
                            </div>
                          ))}
                          <div ref={terminalEndRef} />
                        </div>
                        <div className="flex items-center mt-1">
                          <span className="text-emerald-400 mr-2 font-bold">$</span>
                          <input
                            ref={terminalInputRef}
                            type="text"
                            value={terminalInput}
                            onChange={(e) => setTerminalInput(e.target.value)}
                            onKeyDown={handleTerminalSubmit}
                            className="flex-1 bg-transparent outline-none text-[#d4d4d4] font-mono"
                            spellCheck={false}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </Panel>
              </Group>
            </div>
          </div>
        </Panel>
        <Separator className="w-2 flex items-center justify-center cursor-col-resize group">
          <div className="w-1 h-8 rounded-full bg-slate-400/30 group-hover:bg-slate-400/70 transition-colors" />
        </Separator>
        {/* Right Panel: Settings & Language Sidebar */}
        <Panel defaultSize={20} minSize={15} className="flex flex-col h-full">
          <div className={`flex flex-col h-full rounded-2xl overflow-hidden ${glassClass}`}>
            <div
              className={`p-4 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'} bg-black/10`}
            >
              <h2 className="font-semibold text-sm tracking-wide uppercase opacity-80 flex items-center gap-2">
                <Palette size={16} className={getAccentClass()} />
                Editor Settings
              </h2>
            </div>
            <div className="p-4 flex flex-col gap-6 overflow-y-auto">
              {/* Theme Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-wider uppercase opacity-50">Theme</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'vs-dark', label: 'Dark (VS Code)' },
                    { id: 'light', label: 'Light (VS Code)' },
                    { id: 'hc-black', label: 'High Contrast Dark' },
                    { id: 'hc-light', label: 'High Contrast Light' },
                    { id: 'dracula', label: 'Dracula' },
                    { id: 'monokai', label: 'Monokai' },
                    { id: 'github-dark', label: 'GitHub Dark' },
                    { id: 'nord', label: 'Nord' },
                    { id: 'solarized-dark', label: 'Solarized Dark' },
                    { id: 'night-owl', label: 'Night Owl' }
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setEditorTheme(theme.id)}
                      className={`text-left px-3 py-2 rounded-lg text-sm transition-all ${
                        editorTheme === theme.id
                          ? `${
                              isDarkMode ? 'bg-white/15 text-white' : 'bg-slate-800 text-white'
                            } font-medium shadow-sm`
                          : `${
                              isDarkMode
                                ? 'hover:bg-white/5 text-white/70'
                                : 'hover:bg-slate-100 text-slate-600'
                            }`
                      }`}
                    >
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Language Selection */}
              <div className="space-y-3 flex-1 flex flex-col min-h-0">
                <label className="text-xs font-bold tracking-wider uppercase opacity-50">Language</label>
                <div className="relative">
                  <Search
                    size={14}
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                      isDarkMode ? 'text-white/40' : 'text-slate-400'
                    }`}
                  />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none transition-all ${glassInputClass}`}
                  />
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {filteredLanguages.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${
                        language === lang
                          ? `${
                              isDarkMode ? 'bg-white/15 text-white' : 'bg-slate-800 text-white'
                            } font-medium shadow-sm`
                          : `${
                              isDarkMode
                                ? 'hover:bg-white/5 text-white/70'
                                : 'hover:bg-slate-100 text-slate-600'
                            }`
                      }`}
                    >
                      <span className="capitalize">{lang}</span>
                      {language === lang && (
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            isDarkMode ? 'bg-white' : 'bg-white'
                          }`}
                        />
                      )}
                    </button>
                  ))}
                  {filteredLanguages.length === 0 && (
                    <div className="text-center py-4 text-sm opacity-50">No languages found</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </Group>

      {/* Image Modal */}
      {isImageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className={`relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl ${
              isDarkMode ? 'bg-slate-900 border border-white/10' : 'bg-white border border-slate-200'
            }`}
          >
            <div
              className={`flex items-center justify-between p-4 border-b ${
                isDarkMode ? 'border-white/10' : 'border-slate-200'
              }`}
            >
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ImageIcon size={20} className={getAccentClass()} />
                Generated Image
              </h3>
              <button
                onClick={() => setIsImageModalOpen(false)}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'hover:bg-white/10 text-white/70 hover:text-white'
                    : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
                }`}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] bg-black/5">
              {isGeneratingImage ? (
                <div className="flex flex-col items-center gap-4 text-slate-500 dark:text-white/50">
                  <Loader2 size={40} className="animate-spin" />
                  <p>Generating a futuristic cityscape...</p>
                </div>
              ) : generatedImage ? (
                <div className="relative group w-full flex justify-center">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                  />
                  <a
                    href={generatedImage}
                    download="generated-image.png"
                    className={`absolute bottom-4 right-4 p-3 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity ${getAccentClass()} ${
                      isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                    }`}
                    title="Download Image"
                  >
                    <Download size={20} />
                  </a>
                </div>
              ) : (
                <div className="text-slate-500 dark:text-white/50">Failed to load image.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
