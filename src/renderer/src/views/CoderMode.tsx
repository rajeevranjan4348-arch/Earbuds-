import React, { useState, useRef, useEffect } from 'react'
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
  GitPullRequest,
  UploadCloud,
  DownloadCloud,
  Edit2,
  Play,
  FileText,
  MessageSquare,
  Image as ImageIcon,
  X,
  TestTube,
  RefreshCw,
  Check,
  Eye,
  Settings
} from 'lucide-react'
import Editor, { useMonaco } from '@monaco-editor/react'
import { useTheme } from '../contexts/ThemeContext'
import ReactMarkdown from 'react-markdown'
import { Panel, Group, Separator } from 'react-resizable-panels'
import { TabbedBrowserPreview } from '../components/Coder/TabbedBrowserPreview'

export interface FileNode {
  id: string
  name: string
  content: string
  language: string
  type?: 'file' | 'folder'
  parentId?: string | null
  isOpen?: boolean
}

export interface Commit {
  id: string
  message: string
  timestamp: string
  files: FileNode[]
}

export interface TerminalOutput {
  id: string
  type: 'command' | 'output' | 'error'
  text: string
}

export interface CoderProject {
  id: string
  title: string
  updatedAt: string
  messages: { role: string; text: string }[]
  files: FileNode[]
  commits: Commit[]
}

export const CoderMode: React.FC = () => {
  const { getAccentClass, isDarkMode } = useTheme()

  const [projects, setProjects] = useState<CoderProject[]>(() => {
    const saved = localStorage.getItem('omnichat_coder_projects')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Error parsing projects:', e)
      }
    }

    // Migration from old format
    const oldMsgs = localStorage.getItem('omnichat_coder_messages')
    const oldFiles = localStorage.getItem('omnichat_coder_files')
    const oldCommits = localStorage.getItem('omnichat_coder_commits')

    if (oldMsgs || oldFiles || oldCommits) {
      let parsedMsgs = [
        {
          role: 'model',
          text: 'I am your AI Coding Assistant. Describe the component, script, or application you want to build.'
        }
      ]
      let parsedFiles: FileNode[] = [
        {
          id: '1',
          name: 'index.html',
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IRIS Web App Preview</title>
  <style>
    body {
      margin: 0;
      padding: 2rem;
      background: #09090b;
      color: #f4f4f5;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      text-align: center;
      max-width: 450px;
    }
    h1 { color: #10b981; margin-top: 0; font-size: 1.5rem; }
    p { color: #a1a1aa; font-size: 0.9rem; line-height: 1.5; }
    button {
      background: #10b981;
      color: #000;
      border: none;
      padding: 0.6rem 1.2rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 1rem;
      transition: all 0.2s;
    }
    button:hover { background: #34d399; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚡ IRIS AI Coder IDE</h1>
    <p>Describe your app or component in the AI Chat panel to generate live code, multi-file projects, and instant previews!</p>
    <button onclick="alert('Hello from IRIS AI Coder!')">Test Interactive Handler</button>
  </div>
</body>
</html>`,
          language: 'html'
        },
        {
          id: '2',
          name: 'app.js',
          content: `// IRIS AI Coder Script
console.log("IRIS AI Coder initialized successfully!");
function calculateStats(a, b) {
  return { sum: a + b, product: a * b };
}
console.log(calculateStats(10, 20));`,
          language: 'javascript'
        }
      ]
      let parsedCommits: Commit[] = []

      try {
        if (oldMsgs) parsedMsgs = JSON.parse(oldMsgs)
      } catch (e) {}
      try {
        if (oldFiles) parsedFiles = JSON.parse(oldFiles)
      } catch (e) {}
      try {
        if (oldCommits) {
          const c = JSON.parse(oldCommits)
          if (c.length === 0 || Array.isArray(c[0].files)) parsedCommits = c
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
      ]
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
          {
            id: '1',
            name: 'index.html',
            content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>IRIS Web App</title>
  <style>
    body {
      background: #09090b;
      color: #10b981;
      font-family: sans-serif;
      text-align: center;
      padding: 3rem;
    }
  </style>
</head>
<body>
  <h1>Welcome to IRIS AI Coder IDE</h1>
  <p style="color:#a1a1aa;">Type your request in the chat panel to generate code automatically.</p>
</body>
</html>`,
            language: 'html'
          },
          {
            id: '2',
            name: 'index.js',
            content: '// Your generated code will appear here\nconsole.log("IRIS IDE Ready");',
            language: 'javascript'
          }
        ],
        commits: []
      }
    ]
  })

  const [currentProjectId, setCurrentProjectId] = useState<string>(() => {
    const saved = localStorage.getItem('omnichat_coder_current_project')
    return saved || projects[0]?.id || '1'
  })

  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0]

  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
    currentProject.messages
  )
  const [files, setFiles] = useState<FileNode[]>(currentProject.files)
  const [commits, setCommits] = useState<Commit[]>(currentProject.commits)

  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [currentFileId, setCurrentFileId] = useState<string>(currentProject.files[0]?.id || '1')

  const [commitMessage, setCommitMessage] = useState('')
  const [activeSidebarTab, setActiveSidebarTab] = useState<'explorer' | 'git' | 'chats'>(
    'explorer'
  )

  const currentFile = files.find((f) => f.id === currentFileId) || files[0]
  const code = currentFile?.content || ''
  const language = currentFile?.language || 'javascript'

  const setCode = (newContent: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === currentFileId ? { ...f, content: newContent } : f))
    )
  }

  const [editorTheme, setEditorTheme] = useState<string>('vs-dark')
  const [searchQuery, setSearchQuery] = useState('')

  const [terminalHistory, setTerminalHistory] = useState<TerminalOutput[]>([
    {
      id: '0',
      type: 'output',
      text: 'Welcome to IRIS Autonomous Terminal.\nType "help" for simulated shell commands or "run" to execute current file.'
    }
  ])
  const [terminalInput, setTerminalInput] = useState('')
  const [activeBottomTab, setActiveBottomTab] = useState<'preview' | 'terminal'>('preview')
  const [copied, setCopied] = useState(false)

  const terminalInputRef = useRef<HTMLInputElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const monaco = useMonaco()

  useEffect(() => {
    localStorage.setItem('omnichat_coder_projects', JSON.stringify(projects))
  }, [projects])

  useEffect(() => {
    localStorage.setItem('omnichat_coder_current_project', currentProjectId)
  }, [currentProjectId])

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
          }
        }
        return p
      })
    )
  }, [messages, files, commits, currentProjectId])

  const handleCreateProject = () => {
    const newProject: CoderProject = {
      id: Date.now().toString(),
      title: `Project ${projects.length + 1}`,
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
          name: 'index.html',
          content: '<h1>New IRIS Project</h1>',
          language: 'html'
        }
      ],
      commits: []
    }
    setProjects((prev) => [newProject, ...prev])
    setCurrentProjectId(newProject.id)
    setMessages(newProject.messages)
    setFiles(newProject.files)
    setCommits(newProject.commits)
    setCurrentFileId(newProject.files[0].id)
  }

  const handleSwitchProject = (id: string) => {
    const p = projects.find((proj) => proj.id === id)
    if (p) {
      setCurrentProjectId(p.id)
      setMessages(p.messages)
      setFiles(p.files)
      setCommits(p.commits)
      setCurrentFileId(p.files[0]?.id || '1')
    }
  }

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (projects.length === 1) {
      alert('Cannot delete the last project.')
      return
    }
    if (window.confirm('Are you sure you want to delete this project?')) {
      const remaining = projects.filter((p) => p.id !== id)
      setProjects(remaining)
      if (currentProjectId === id) {
        handleSwitchProject(remaining[0].id)
      }
    }
  }

  const glassClass = isDarkMode
    ? 'bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl'
    : 'bg-white/60 backdrop-blur-xl border border-slate-200 shadow-xl'

  const glassInputClass = isDarkMode
    ? 'bg-black/50 border border-white/10 focus:border-white/30 text-white placeholder-white/30'
    : 'bg-white/80 border border-slate-200 focus:border-slate-400 text-slate-900 placeholder-slate-400'

  // Monaco Inline AI Completion provider
  useEffect(() => {
    if (monaco) {
      const provider = monaco.languages.registerCompletionItemProvider('*', {
        provideCompletionItems: async (model, position) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          })

          const match = textUntilPosition.match(/\/\/\s*ai:\s*(.*)$/)
          if (match) {
            const prompt = match[1]
            if (prompt.length < 3) return { suggestions: [] }

            try {
              const ai = getAiInstance()
              const response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: `Complete this code snippet based on the prompt: "${prompt}". Return ONLY the code, no markdown, no explanations.`
              })
              const completion = (response.text || '')
                .replace(/```[\s\S]*?\n/g, '')
                .replace(/```/g, '')

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
              }
            } catch (e) {
              return { suggestions: [] }
            }
          }
          return { suggestions: [] }
        }
      })
      return () => provider.dispose()
    }
  }, [monaco])

  useEffect(() => {
    setEditorTheme(isDarkMode ? 'vs-dark' : 'light')
  }, [isDarkMode])

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
      })

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
      })

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
      })
    }
  }, [monaco])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (activeBottomTab === 'terminal') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [terminalHistory, activeBottomTab])

  const handleTerminalSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInput.trim()) {
      const cmd = terminalInput.trim()
      setTerminalHistory((prev) => [
        ...prev,
        { id: Date.now().toString(), type: 'command', text: `$ ${cmd}` }
      ])
      setTerminalInput('')

      const args = cmd.split(' ').filter(Boolean)
      const baseCmd = args[0].toLowerCase()

      let output = ''
      let isError = false

      if (baseCmd === 'clear') {
        setTerminalHistory([])
        return
      } else if (baseCmd === 'help') {
        output =
          'Available commands:\n ls - List files\n cat [file] - Display file content\n pwd - Print working directory\n run - Run active code file\n clear - Clear terminal'
      } else if (baseCmd === 'ls') {
        output = files.map((f) => f.name).join('  ')
      } else if (baseCmd === 'cat') {
        if (args[1]) {
          const file = files.find((f) => f.name === args[1])
          if (file) {
            output = file.content
          } else {
            output = `cat: ${args[1]}: No such file`
            isError = true
          }
        } else {
          output = 'cat: missing file argument'
          isError = true
        }
      } else if (baseCmd === 'pwd') {
        output = `/home/projects/${currentProject.title.toLowerCase().replace(/\s+/g, '-')}`
      } else if (baseCmd === 'echo') {
        output = args.slice(1).join(' ')
      } else if (baseCmd === 'run') {
        output = `Executing ${currentFile?.name || 'file'}...\n-- Output --\nCode executed successfully without errors.`
      } else {
        output = `bash: ${baseCmd}: command not found. Type "help" for commands.`
        isError = true
      }

      if (output) {
        setTerminalHistory((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            type: isError ? 'error' : 'output',
            text: output
          }
        ])
      }
    }
  }

  const extractCode = (text: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
    let match
    let lastCode = ''
    let lastLang = 'javascript'

    while ((match = codeBlockRegex.exec(text)) !== null) {
      lastLang = match[1] || 'javascript'
      lastCode = match[2]
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
      }
      const mappedLang = langMap[lastLang.toLowerCase()] || lastLang.toLowerCase()

      setFiles((prev) =>
        prev.map((f) =>
          f.id === currentFileId ? { ...f, content: lastCode, language: mappedLang } : f
        )
      )
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return
    const userPrompt = input.trim()
    setInput('')
    setIsLoading(true)

    setMessages((prev) => [...prev, { role: 'user', text: userPrompt }])

    try {
      const conversationHistory = messages
        .filter((m) => m.text && !(m.role === 'model' && m.text.includes('I am your AI Coding Assistant')))
        .slice(-20)
        .map((m) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          text: m.text
        }))

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: userPrompt,
          conversationHistory,
          source: 'coder',
          agentRole: 'coder',
          systemInstruction:
            'You are IRIS AI Engineer, an expert software engineer and code generator. When asked to write code, provide a brief explanation, but ALWAYS include complete, working code in markdown code blocks with a language specifier. For web components, prefer a self-contained HTML file with embedded CSS and JS so it can preview immediately. Preserve the user\'s existing UI unless explicitly asked to change it.'
        })
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || payload?.message || `AI request failed (HTTP ${response.status})`)
      }

      const aiResponse = payload?.text || payload?.rawText || 'I have completed your request.'

      setMessages((prev) => [...prev, { role: 'model', text: aiResponse }])
      extractCode(aiResponse)
    } catch (err: any) {
      console.error('Error sending message:', err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: `Error generating response: ${err?.message || 'Please verify API key settings.'}`
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateFile = () => {
    const name = prompt('Enter file name (e.g. index.js, style.css, app.py):')
    if (name) {
      const ext = name.split('.').pop() || ''
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
      }
      const newFile: FileNode = {
        id: Date.now().toString(),
        name,
        content: `// ${name}\n`,
        language: langMap[ext] || 'plaintext',
        type: 'file'
      }
      setFiles((prev) => [...prev, newFile])
      setCurrentFileId(newFile.id)
    }
  }

  const handleCreateFolder = () => {
    const name = prompt('Enter folder name:')
    if (name) {
      const newFolder: FileNode = {
        id: Date.now().toString(),
        name,
        content: '',
        language: '',
        type: 'folder',
        isOpen: true
      }
      setFiles((prev) => [...prev, newFolder])
    }
  }

  const handleRenameFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const file = files.find((f) => f.id === id)
    if (!file) return
    const newName = prompt('Enter new file name:', file.name)
    if (newName && newName !== file.name) {
      const ext = newName.split('.').pop() || ''
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
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, name: newName, language: langMap[ext] || f.language } : f
        )
      )
    }
  }

  const handleDeleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (files.length === 1) {
      alert('Cannot delete the last remaining file.')
      return
    }
    if (window.confirm('Delete this file?')) {
      const remaining = files.filter((f) => f.id !== id)
      setFiles(remaining)
      if (currentFileId === id && remaining.length > 0) {
        setCurrentFileId(remaining[0].id)
      }
    }
  }

  const handleCommit = () => {
    if (!commitMessage.trim()) return
    const newCommit: Commit = {
      id: Math.random().toString(36).substring(2, 9),
      message: commitMessage,
      timestamp: new Date().toISOString(),
      files: JSON.parse(JSON.stringify(files))
    }
    setCommits((prev) => [newCommit, ...prev])
    setCommitMessage('')
  }

  const handlePull = () => {
    if (commits.length === 0) {
      alert('No commits available to pull.')
      return
    }
    if (window.confirm('Overwrite current files with latest commit?')) {
      const latestCommit = commits[0]
      setFiles(latestCommit.files)
      if (!latestCommit.files.find((f) => f.id === currentFileId)) {
        setCurrentFileId(latestCommit.files[0]?.id || '1')
      }
    }
  }

  const handlePush = () => {
    alert(`Pushed commit ${commits[0]?.id || 'HEAD'} to remote origin/main successfully!`)
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadFile = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = currentFile?.name || 'code.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Construct iframe live web preview document
  const getPreviewHtml = () => {
    const htmlFile = files.find((f) => f.name.endsWith('.html') || f.language === 'html')
    const cssFile = files.find((f) => f.name.endsWith('.css') || f.language === 'css')
    const jsFile = files.find(
      (f) =>
        f.name.endsWith('.js') ||
        f.language === 'javascript' ||
        f.name.endsWith('.ts') ||
        f.language === 'typescript'
    )

    if (htmlFile) {
      let fullHtml = htmlFile.content
      if (cssFile && !fullHtml.includes(cssFile.content)) {
        fullHtml = fullHtml.replace(
          '</head>',
          `<style>${cssFile.content}</style></head>`
        )
      }
      if (jsFile && !fullHtml.includes(jsFile.content)) {
        fullHtml = fullHtml.replace(
          '</body>',
          `<script>${jsFile.content}</script></body>`
        )
      }
      return fullHtml
    }

    // Default fallback container
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 1.5rem; background: #09090b; color: #f4f4f5; font-family: monospace; }
    ${cssFile?.content || ''}
  </style>
</head>
<body>
  <div id="app"></div>
  <pre>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  <script>${jsFile?.content || ''}</script>
</body>
</html>`
  }

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* IDE Header Bar */}
      <div className="h-12 bg-zinc-900 border-b border-white/10 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold tracking-wider">
            <Code2 size={18} />
            <span>IRIS AI CODER IDE</span>
          </div>

          <div className="h-4 w-[1px] bg-white/10" />

          {/* Project Selector */}
          <select
            value={currentProjectId}
            onChange={(e) => handleSwitchProject(e.target.value)}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-emerald-500 font-mono cursor-pointer"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-zinc-900 text-zinc-200">
                {p.title}
              </option>
            ))}
          </select>

          <button
            onClick={handleCreateProject}
            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-emerald-400 text-xs transition cursor-pointer"
            title="Create New Project"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Theme Selector */}
          <select
            value={editorTheme}
            onChange={(e) => setEditorTheme(e.target.value)}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-zinc-300 font-mono outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="vs-dark">Theme: VS-Dark</option>
            <option value="light">Theme: Light</option>
            <option value="dracula">Theme: Dracula</option>
            <option value="monokai">Theme: Monokai</option>
            <option value="github-dark">Theme: GitHub Dark</option>
          </select>

          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded border border-white/10 transition cursor-pointer"
            title="Copy current code"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownloadFile}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded border border-white/10 transition cursor-pointer"
            title="Download active file"
          >
            <Download size={13} />
            <span>Download</span>
          </button>

          <button
            onClick={() => setActiveBottomTab(activeBottomTab === 'preview' ? 'terminal' : 'preview')}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-500 text-black font-mono font-bold text-xs rounded hover:bg-emerald-400 transition cursor-pointer"
          >
            <Play size={13} />
            <span>{activeBottomTab === 'preview' ? 'Show Terminal' : 'Show Preview'}</span>
          </button>
        </div>
      </div>

      {/* Main IDE Workspace - Resizable Panels */}
      <div className="flex-1 min-h-0 w-full">
        <Group direction="horizontal">
          {/* Left Sidebar: File Tree & Navigation */}
          <Panel defaultSize={20} minSize={15} maxSize={35}>
            <div className="h-full flex flex-col bg-zinc-950 border-r border-white/10">
              {/* Sidebar Tab Selector */}
              <div className="flex border-b border-white/10 bg-zinc-900/50">
                <button
                  onClick={() => setActiveSidebarTab('explorer')}
                  className={`flex-1 py-2 text-[11px] font-mono uppercase tracking-wider flex items-center justify-center gap-1 transition cursor-pointer ${
                    activeSidebarTab === 'explorer'
                      ? 'text-emerald-400 border-b-2 border-emerald-500 bg-white/5'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Folder size={13} />
                  <span>Explorer</span>
                </button>
                <button
                  onClick={() => setActiveSidebarTab('git')}
                  className={`flex-1 py-2 text-[11px] font-mono uppercase tracking-wider flex items-center justify-center gap-1 transition cursor-pointer ${
                    activeSidebarTab === 'git'
                      ? 'text-emerald-400 border-b-2 border-emerald-500 bg-white/5'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <GitBranch size={13} />
                  <span>Git ({commits.length})</span>
                </button>
              </div>

              {/* Sidebar Content */}
              {activeSidebarTab === 'explorer' && (
                <div className="flex-1 flex flex-col p-2 overflow-y-auto">
                  {/* File Search */}
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded pl-8 pr-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  {/* Actions Header */}
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] text-zinc-400 font-mono uppercase tracking-wider">
                    <span>Files</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleCreateFile}
                        className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-emerald-400 transition cursor-pointer"
                        title="New File"
                      >
                        <File size={13} />
                      </button>
                      <button
                        onClick={handleCreateFolder}
                        className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-emerald-400 transition cursor-pointer"
                        title="New Folder"
                      >
                        <Folder size={13} />
                      </button>
                    </div>
                  </div>

                  {/* File List */}
                  <div className="flex-1 space-y-1 mt-1">
                    {filteredFiles.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => setCurrentFileId(file.id)}
                        className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono cursor-pointer transition ${
                          file.id === currentFileId
                            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold'
                            : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {file.type === 'folder' ? (
                            <Folder size={14} className="text-amber-400 shrink-0" />
                          ) : (
                            <FileCodeIcon filename={file.name} />
                          )}
                          <span className="truncate">{file.name}</span>
                        </div>

                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition shrink-0">
                          <button
                            onClick={(e) => handleRenameFile(file.id, e)}
                            className="p-1 hover:text-emerald-400 transition cursor-pointer"
                            title="Rename"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteFile(file.id, e)}
                            className="p-1 hover:text-red-400 transition cursor-pointer"
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

              {activeSidebarTab === 'git' && (
                <div className="flex-1 flex flex-col p-3 space-y-4 overflow-y-auto">
                  <div className="space-y-2">
                    <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                      Stage & Commit
                    </span>
                    <input
                      type="text"
                      placeholder="Commit message..."
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500 font-mono"
                    />
                    <button
                      onClick={handleCommit}
                      disabled={!commitMessage.trim()}
                      className="w-full py-1.5 bg-emerald-500 text-black font-mono font-bold text-xs rounded hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <GitCommit size={14} />
                      <span>Commit Changes</span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handlePull}
                      className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded border border-white/10 transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <DownloadCloud size={13} />
                      <span>Pull</span>
                    </button>
                    <button
                      onClick={handlePush}
                      className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded border border-white/10 transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <UploadCloud size={13} />
                      <span>Push</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                      Commit History ({commits.length})
                    </span>
                    <div className="space-y-1.5">
                      {commits.map((c) => (
                        <div
                          key={c.id}
                          className="p-2 bg-black/40 border border-white/10 rounded text-xs font-mono space-y-1"
                        >
                          <div className="flex items-center justify-between text-emerald-400 font-semibold">
                            <span>#{c.id}</span>
                            <span className="text-[10px] text-zinc-500">
                              {new Date(c.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-zinc-300">{c.message}</div>
                        </div>
                      ))}
                      {commits.length === 0 && (
                        <div className="text-xs text-zinc-500 font-mono italic">
                          No commits created yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Separator className="w-[1px] bg-white/10 hover:bg-emerald-500 transition cursor-col-resize" />

          {/* Center Editor Panel */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col bg-zinc-950">
              {/* Editor Tab Bar */}
              <div className="h-9 bg-zinc-900/80 border-b border-white/10 flex items-center px-3 gap-2 overflow-x-auto shrink-0">
                <FileCodeIcon filename={currentFile?.name || ''} />
                <span className="text-xs font-mono text-zinc-200 font-semibold">
                  {currentFile?.name || 'Untitled'}
                </span>
                <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase ml-2">
                  {language}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono ml-auto">
                  Inline AI: Type <code className="text-emerald-400">{'// ai: prompt'}</code>
                </span>
              </div>

              {/* Monaco Code Editor */}
              <div className="flex-1 relative min-h-0">
                <Editor
                  height="100%"
                  language={language}
                  theme={editorTheme}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  options={{
                    fontSize: 13,
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    lineNumbersMinChars: 3
                  }}
                />
              </div>

              {/* Bottom Panel: Tabbed Browser Preview / Integrated Terminal */}
              <div className="h-80 border-t border-white/10 bg-black flex flex-col shrink-0">
                <div className="h-8 bg-zinc-900 border-b border-white/10 px-3 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveBottomTab('preview')}
                      className={`text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        activeBottomTab === 'preview'
                          ? 'text-emerald-400'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Eye size={13} />
                      <span>Tabbed Browser Preview System</span>
                    </button>
                    <button
                      onClick={() => setActiveBottomTab('terminal')}
                      className={`text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        activeBottomTab === 'terminal'
                          ? 'text-emerald-400'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Terminal size={13} />
                      <span>Integrated Terminal</span>
                    </button>
                  </div>
                </div>

                {activeBottomTab === 'preview' ? (
                  <div className="flex-1 w-full bg-black relative min-h-0 overflow-hidden">
                    <TabbedBrowserPreview
                      files={files}
                      currentFileId={currentFileId}
                      activeCode={code}
                    />
                  </div>
                ) : (
                  <div className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1 bg-black">
                    {terminalHistory.map((item) => (
                      <div
                        key={item.id}
                        className={
                          item.type === 'command'
                            ? 'text-emerald-400 font-bold'
                            : item.type === 'error'
                              ? 'text-red-400'
                              : 'text-zinc-300 whitespace-pre-wrap'
                        }
                      >
                        {item.text}
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-emerald-400">$</span>
                      <input
                        ref={terminalInputRef}
                        type="text"
                        value={terminalInput}
                        onChange={(e) => setTerminalInput(e.target.value)}
                        onKeyDown={handleTerminalSubmit}
                        placeholder="Type command (e.g. ls, cat index.html, run, help)..."
                        className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-zinc-100 placeholder-zinc-600"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <Separator className="w-[1px] bg-white/10 hover:bg-emerald-500 transition cursor-col-resize" />

          {/* Right AI Assistant Chat Panel */}
          <Panel defaultSize={30} minSize={20}>
            <div className="h-full flex flex-col bg-zinc-950 border-l border-white/10">
              {/* AI Header */}
              <div className="h-9 bg-zinc-900/80 border-b border-white/10 px-3 flex items-center gap-2 shrink-0">
                <MessageSquare size={14} className="text-emerald-400" />
                <span className="text-xs font-mono font-bold text-zinc-200">
                  IRIS AI Coder Assistant
                </span>
                {isLoading && <Loader2 size={13} className="animate-spin text-emerald-400 ml-auto" />}
              </div>

              {/* Chat Message List */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans text-xs">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl max-w-[90%] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-100 ml-auto'
                        : 'bg-zinc-900/80 border border-white/10 text-zinc-200 mr-auto'
                    }`}
                  >
                    <div className="font-mono text-[10px] text-zinc-400 mb-1 font-bold uppercase">
                      {m.role === 'user' ? 'You' : 'IRIS AI Engineer'}
                    </div>
                    <ReactMarkdown
                      components={{
                        pre({ children }: any) {
                          return (
                            <div className="bg-black/60 p-2 rounded border border-white/10 font-mono text-[11px] overflow-x-auto my-2 text-emerald-300">
                              {children}
                            </div>
                          )
                        },
                        code({ className, children, ...props }: any) {
                          const isBlock =
                            String(children).includes('\n') || (className && className.includes('language-'))
                          if (isBlock) {
                            return (
                              <code className="font-mono text-[11px] text-emerald-300 whitespace-pre" {...props}>
                                {children}
                              </code>
                            )
                          }
                          return (
                            <code
                              className="bg-black/40 px-1 py-0.5 rounded text-emerald-300 font-mono text-[11px]"
                              {...props}
                            >
                              {children}
                            </code>
                          )
                        }
                      }}
                    >
                      {m.text}
                    </ReactMarkdown>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-white/10 bg-zinc-900/50 shrink-0">
                <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-xl p-2 focus-within:border-emerald-500/50 transition">
                  <textarea
                    rows={2}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder="Describe app, script, or component to generate..."
                    className="flex-1 bg-transparent border-none outline-none resize-none text-xs text-zinc-100 placeholder-zinc-500 font-sans"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isLoading}
                    className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 disabled:opacity-40 transition cursor-pointer shrink-0"
                  >
                    {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  )
}

function FileCodeIcon({ filename }: { filename: string }) {
  if (filename.endsWith('.html')) return <FileText size={14} className="text-amber-400 shrink-0" />
  if (filename.endsWith('.css')) return <FileText size={14} className="text-cyan-400 shrink-0" />
  if (filename.endsWith('.js') || filename.endsWith('.ts'))
    return <FileText size={14} className="text-emerald-400 shrink-0" />
  if (filename.endsWith('.py')) return <FileText size={14} className="text-yellow-400 shrink-0" />
  return <File size={14} className="text-zinc-400 shrink-0" />
}

export default CoderMode
