/**
 * docs://project Resource - Smart Agent Workflow MCP v0.4.0
 *
 * Provides information about project documentation.
 * Lists available docs, sections, and gives a documentation score.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectRoot } from '../lib/git.js';
import type { ProjectDocsInfo } from '../tools/documentation/types.js';

export const projectDocsResource = {
  uri: 'docs://project',
  name: 'Project Documentation',
  description:
    'Information about project documentation: available files, sections, and improvement suggestions.',
  mimeType: 'application/json',
};

/**
 * Parse markdown sections from content
 */
function parseMarkdownSections(content: string): string[] {
  const sections: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      sections.push(match[2].trim());
    }
  }

  return sections;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file modification time
 */
async function getLastModified(filePath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Calculate documentation score
 */
function calculateDocScore(info: Partial<ProjectDocsInfo>): number {
  let score = 0;

  // Essential docs (40 points)
  if (info.has_readme) score += 20;
  if (info.has_changelog) score += 20;

  // Nice to have (30 points)
  if (info.has_claude_md) score += 15;
  if (info.has_contributing) score += 15;

  // Content quality (30 points)
  const readmeSections = info.readme_sections?.length || 0;
  if (readmeSections >= 5) score += 15;
  else if (readmeSections >= 3) score += 10;
  else if (readmeSections >= 1) score += 5;

  const claudeSections = info.claude_md_sections?.length || 0;
  if (claudeSections >= 10) score += 15;
  else if (claudeSections >= 5) score += 10;
  else if (claudeSections >= 1) score += 5;

  return Math.min(100, score);
}

/**
 * Generate improvement suggestions
 */
function generateSuggestions(info: Partial<ProjectDocsInfo>): string[] {
  const suggestions: string[] = [];

  if (!info.has_readme) {
    suggestions.push('Create a README.md with project overview, installation, and usage instructions');
  } else if ((info.readme_sections?.length || 0) < 3) {
    suggestions.push('Expand README.md with more sections: Installation, Usage, Contributing, License');
  }

  if (!info.has_changelog) {
    suggestions.push('Create CHANGELOG.md to track version history (use sync_changelog tool)');
  }

  if (!info.has_claude_md) {
    suggestions.push('Create CLAUDE.md for AI-assisted development context');
  }

  if (!info.has_contributing) {
    suggestions.push('Add CONTRIBUTING.md to help new contributors');
  }

  if (info.has_readme && !info.readme_sections?.some((s) => s.toLowerCase().includes('api'))) {
    suggestions.push('Consider adding API documentation section to README.md');
  }

  if (suggestions.length === 0) {
    suggestions.push('Documentation is comprehensive! Consider adding examples or tutorials.');
  }

  return suggestions;
}

export async function getProjectDocsResource(): Promise<string> {
  try {
    const projectRoot = await getProjectRoot();

    // Check for common documentation files
    const readmePath = path.join(projectRoot, 'README.md');
    const claudePath = path.join(projectRoot, 'CLAUDE.md');
    const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
    const contributingPath = path.join(projectRoot, 'CONTRIBUTING.md');

    const [hasReadme, hasClaudeMd, hasChangelog, hasContributing] = await Promise.all([
      fileExists(readmePath),
      fileExists(claudePath),
      fileExists(changelogPath),
      fileExists(contributingPath),
    ]);

    // Get sections from existing files
    let readmeSections: string[] = [];
    let claudeMdSections: string[] = [];
    let lastUpdated: string | null = null;

    if (hasReadme) {
      const content = await fs.readFile(readmePath, 'utf-8');
      readmeSections = parseMarkdownSections(content);
      lastUpdated = await getLastModified(readmePath);
    }

    if (hasClaudeMd) {
      const content = await fs.readFile(claudePath, 'utf-8');
      claudeMdSections = parseMarkdownSections(content);
      const claudeModified = await getLastModified(claudePath);
      if (claudeModified && (!lastUpdated || claudeModified > lastUpdated)) {
        lastUpdated = claudeModified;
      }
    }

    const info: ProjectDocsInfo = {
      has_readme: hasReadme,
      has_claude_md: hasClaudeMd,
      has_changelog: hasChangelog,
      has_contributing: hasContributing,
      readme_sections: readmeSections,
      claude_md_sections: claudeMdSections,
      last_updated: lastUpdated || undefined,
      documentation_score: 0,
      suggestions: [],
    };

    info.documentation_score = calculateDocScore(info);
    info.suggestions = generateSuggestions(info);

    return JSON.stringify(info, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return JSON.stringify({
      error: message,
      has_readme: false,
      has_claude_md: false,
      has_changelog: false,
      has_contributing: false,
      documentation_score: 0,
      suggestions: ['Unable to analyze project documentation'],
    });
  }
}
