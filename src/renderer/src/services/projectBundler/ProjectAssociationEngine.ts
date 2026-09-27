/**
 * IRIS — Project File Association & Bundler Engine
 *
 * Automatically groups and associates related HTML, CSS, and JS/TS files into
 * a cohesive project bundle for preview rendering.
 */

export interface FileNode {
  id: string
  name: string
  content: string
  language: string
  type?: 'file' | 'folder'
  parentId?: string | null
  isOpen?: boolean
}

export interface AssociatedProjectGroup {
  entryHtmlFile: FileNode
  linkedCssFiles: FileNode[]
  linkedJsFiles: FileNode[]
  unlinkedCssFiles: FileNode[]
  unlinkedJsFiles: FileNode[]
  allAssociatedFiles: FileNode[]
  bundledDocumentHtml: string
  associationStats: {
    totalFiles: number
    linkedCount: number
    implicitCount: number
    entryPointName: string
  }
}

class ProjectAssociationEngine {
  /**
   * Helper to normalize filenames and paths for link matching
   */
  private normalizePath(pathStr: string): string {
    return pathStr
      .trim()
      .replace(/^(\.\/|\/)+/, '') // Strip leading ./ or /
      .toLowerCase()
  }

  /**
   * Check if two file paths match (exact match or basename match)
   */
  private isPathMatch(refPath: string, fileNodeName: string): boolean {
    const normRef = this.normalizePath(refPath)
    const normFile = this.normalizePath(fileNodeName)

    if (normRef === normFile) return true

    // Match filename ending (e.g. "css/style.css" matches "style.css")
    const refBase = normRef.split('/').pop() || ''
    const fileBase = normFile.split('/').pop() || ''

    return refBase === fileBase && refBase.length > 0
  }

  /**
   * Extract all <link rel="stylesheet" href="..."> targets from HTML
   */
  private extractCssHrefs(htmlContent: string): string[] {
    const hrefs: string[] = []
    const linkRegex = /<link\s+[^>]*href=["']([^"']+)["'][^>]*>/gi
    let match: RegExpExecArray | null

    while ((match = linkRegex.exec(htmlContent)) !== null) {
      if (match[1]) {
        hrefs.push(match[1])
      }
    }
    return hrefs
  }

  /**
   * Extract all <script src="..."> targets from HTML
   */
  private extractJsSrcs(htmlContent: string): string[] {
    const srcs: string[] = []
    const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi
    let match: RegExpExecArray | null

    while ((match = scriptRegex.exec(htmlContent)) !== null) {
      if (match[1]) {
        srcs.push(match[1])
      }
    }
    return srcs
  }

  /**
   * Select primary Entry Point HTML file from available project files
   */
  public selectEntryPointHtml(files: FileNode[], activeFileId?: string): FileNode {
    const htmlFiles = files.filter(
      (f) => f.type !== 'folder' && (f.name.endsWith('.html') || f.language === 'html')
    )

    if (htmlFiles.length === 0) {
      // Create a virtual default index.html if none exists
      return {
        id: 'virtual_index_html',
        name: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>IRIS Cohesive Project</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>`,
        language: 'html'
      }
    }

    // 1. If active file is HTML, prioritize it
    if (activeFileId) {
      const activeFile = htmlFiles.find((f) => f.id === activeFileId)
      if (activeFile) return activeFile
    }

    // 2. Prioritize index.html
    const indexHtml = htmlFiles.find((f) => f.name.toLowerCase() === 'index.html')
    if (indexHtml) return indexHtml

    // 3. Fallback to first available HTML file
    return htmlFiles[0]
  }

  /**
   * Analyze and group all related files into a cohesive project group
   */
  public analyzeAndBundleGroup(
    files: FileNode[],
    activeFileId?: string,
    overrideEntryId?: string
  ): AssociatedProjectGroup {
    const nonFolderFiles = files.filter((f) => f.type !== 'folder')

    // 1. Determine entry HTML file
    const selectedEntry = overrideEntryId
      ? nonFolderFiles.find((f) => f.id === overrideEntryId) ||
        this.selectEntryPointHtml(nonFolderFiles, activeFileId)
      : this.selectEntryPointHtml(nonFolderFiles, activeFileId)

    let htmlDoc = selectedEntry.content || ''

    // Extract explicit references in entry HTML
    const cssHrefs = this.extractCssHrefs(htmlDoc)
    const jsSrcs = this.extractJsSrcs(htmlDoc)

    const allCssFiles = nonFolderFiles.filter(
      (f) => f.name.endsWith('.css') || f.language === 'css'
    )
    const allJsFiles = nonFolderFiles.filter(
      (f) =>
        f.name.endsWith('.js') ||
        f.name.endsWith('.ts') ||
        f.name.endsWith('.jsx') ||
        f.name.endsWith('.tsx') ||
        f.language === 'javascript' ||
        f.language === 'typescript'
    )

    // 2. Classify Linked vs Unlinked CSS Files
    const linkedCssFiles: FileNode[] = []
    const unlinkedCssFiles: FileNode[] = []

    allCssFiles.forEach((cssFile) => {
      const isLinked = cssHrefs.some((href) => this.isPathMatch(href, cssFile.name))
      if (isLinked) {
        linkedCssFiles.push(cssFile)
      } else {
        unlinkedCssFiles.push(cssFile)
      }
    })

    // 3. Classify Linked vs Unlinked JS Files
    const linkedJsFiles: FileNode[] = []
    const unlinkedJsFiles: FileNode[] = []

    allJsFiles.forEach((jsFile) => {
      const isLinked = jsSrcs.some((src) => this.isPathMatch(src, jsFile.name))
      if (isLinked) {
        linkedJsFiles.push(jsFile)
      } else {
        unlinkedJsFiles.push(jsFile)
      }
    })

    // Console logging & error capturing wrapper
    const consoleBridgeScript = `
    <script>
      (function() {
        const parent = window.parent;
        if (!parent) return;
        ['log', 'warn', 'error', 'info'].forEach(level => {
          const orig = console[level];
          console[level] = function(...args) {
            if (orig) orig.apply(console, args);
            try {
              parent.postMessage({
                type: 'IRIS_PREVIEW_CONSOLE_LOG',
                level,
                args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)),
                timestamp: new Date().toLocaleTimeString()
              }, '*');
            } catch(e) {}
          };
        });
        window.addEventListener('error', function(e) {
          try {
            parent.postMessage({
              type: 'IRIS_PREVIEW_CONSOLE_LOG',
              level: 'error',
              args: [(e.message || 'Uncaught Error') + (e.filename ? ' at ' + e.filename + ':' + e.lineno : '')],
              timestamp: new Date().toLocaleTimeString()
            }, '*');
          } catch(err) {}
        });
      })();
    </script>
    `

    // 4. Construct cohesive bundled HTML document
    let bundledHtml = htmlDoc

    // Inject console bridge script into head
    if (bundledHtml.includes('<head>')) {
      bundledHtml = bundledHtml.replace('<head>', `<head>${consoleBridgeScript}`)
    } else if (bundledHtml.includes('<html>')) {
      bundledHtml = bundledHtml.replace('<html>', `<html><head>${consoleBridgeScript}</head>`)
    } else {
      bundledHtml = `${consoleBridgeScript}${bundledHtml}`
    }

    // Replace <link href="..."> tags with inline <style> content
    cssHrefs.forEach((href) => {
      const matchedCss = allCssFiles.find((f) => this.isPathMatch(href, f.name))
      if (matchedCss) {
        const tagRegex = new RegExp(
          `<link\\s+[^>]*href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
          'gi'
        )
        bundledHtml = bundledHtml.replace(
          tagRegex,
          `<style data-filename="${matchedCss.name}">\n${matchedCss.content}\n</style>`
        )
      }
    })

    // Replace <script src="..."> tags with inline <script> content
    jsSrcs.forEach((src) => {
      const matchedJs = allJsFiles.find((f) => this.isPathMatch(src, f.name))
      if (matchedJs) {
        const tagRegex = new RegExp(
          `<script\\s+[^>]*src=["']${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*<\\/script>`,
          'gi'
        )
        bundledHtml = bundledHtml.replace(
          tagRegex,
          `<script data-filename="${matchedJs.name}">\n${matchedJs.content}\n</script>`
        )
      }
    })

    // Include unlinked CSS stylesheets so no orphan styles are omitted from preview
    if (unlinkedCssFiles.length > 0) {
      const unlinkedStyles = unlinkedCssFiles
        .map((f) => `<style data-filename="${f.name}" data-implicit="true">\n${f.content}\n</style>`)
        .join('\n')

      if (bundledHtml.includes('</head>')) {
        bundledHtml = bundledHtml.replace('</head>', `${unlinkedStyles}\n</head>`)
      } else {
        bundledHtml = `${unlinkedStyles}\n${bundledHtml}`
      }
    }

    // Include unlinked JS files so no orphan scripts are omitted from preview
    if (unlinkedJsFiles.length > 0) {
      const unlinkedScripts = unlinkedJsFiles
        .map(
          (f) =>
            `<script data-filename="${f.name}" data-implicit="true">\n${f.content}\n</script>`
        )
        .join('\n')

      if (bundledHtml.includes('</body>')) {
        bundledHtml = bundledHtml.replace('</body>', `${unlinkedScripts}\n</body>`)
      } else {
        bundledHtml = `${bundledHtml}\n${unlinkedScripts}`
      }
    }

    const allAssociated = [
      selectedEntry,
      ...linkedCssFiles,
      ...linkedJsFiles,
      ...unlinkedCssFiles,
      ...unlinkedJsFiles
    ]

    return {
      entryHtmlFile: selectedEntry,
      linkedCssFiles,
      linkedJsFiles,
      unlinkedCssFiles,
      unlinkedJsFiles,
      allAssociatedFiles: allAssociated,
      bundledDocumentHtml: bundledHtml,
      associationStats: {
        totalFiles: nonFolderFiles.length,
        linkedCount: linkedCssFiles.length + linkedJsFiles.length,
        implicitCount: unlinkedCssFiles.length + unlinkedJsFiles.length,
        entryPointName: selectedEntry.name
      }
    }
  }
}

export const projectAssociationEngine = new ProjectAssociationEngine()
