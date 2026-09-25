/**
 * GitHubProvider Implementation
 */

import { GitHubProvider, GitHubRepo } from '../types'

export class DefaultGitHubProvider implements GitHubProvider {
  public name = 'DefaultGitHubProvider'

  public async searchRepos(query: string, limit = 5): Promise<GitHubRepo[]> {
    try {
      const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${limit}`, {
        headers: {
          'User-Agent': 'IRIS-RealTime-Agent/1.0',
          Accept: 'application/vnd.github.v3+json'
        }
      })

      if (!res.ok) return []

      const data = await res.json()
      if (!data.items) return []

      return data.items.map((item: any) => ({
        name: item.name,
        fullName: item.full_name,
        url: item.html_url,
        description: item.description || 'No description provided.',
        stars: item.stargazers_count || 0,
        updatedAt: item.updated_at || new Date().toISOString()
      }))
    } catch (_err) {
      return []
    }
  }

  public async getRepoDetails(owner: string, repo: string): Promise<GitHubRepo | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'User-Agent': 'IRIS-RealTime-Agent/1.0',
          Accept: 'application/vnd.github.v3+json'
        }
      })

      if (!res.ok) return null

      const data = await res.json()

      // Fetch latest release if available
      let latestRelease
      try {
        const relRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
          headers: {
            'User-Agent': 'IRIS-RealTime-Agent/1.0',
            Accept: 'application/vnd.github.v3+json'
          }
        })
        if (relRes.ok) {
          const relData = await relRes.json()
          latestRelease = {
            tagName: relData.tag_name,
            publishedAt: relData.published_at,
            body: relData.body || ''
          }
        }
      } catch (_e) {}

      return {
        name: data.name,
        fullName: data.full_name,
        url: data.html_url,
        description: data.description || '',
        stars: data.stargazers_count || 0,
        latestRelease,
        updatedAt: data.updated_at
      }
    } catch (_err) {
      return null
    }
  }

  public async getReadme(owner: string, repo: string): Promise<string> {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`)
      if (res.ok) return await res.text()

      const resMaster = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`)
      if (resMaster.ok) return await resMaster.text()

      return 'README not found.'
    } catch (_err) {
      return 'Error fetching README.'
    }
  }
}

export const defaultGitHubProvider = new DefaultGitHubProvider()
