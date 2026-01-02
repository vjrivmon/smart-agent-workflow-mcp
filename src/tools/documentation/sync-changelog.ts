/**
 * sync_changelog Tool - Smart Agent Workflow MCP v0.4.0
 *
 * Syncs CHANGELOG.md with workflow completions.
 * Follows Keep a Changelog format (https://keepachangelog.com).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectRoot } from '../../lib/git.js';
import { getCurrentWorkflow, getWorkflowById } from '../workflow/state-machine.js';
import type { SyncChangelogArgs, SyncChangelogResult } from './types.js';

export const syncChangelogDefinition = {
  name: 'sync_changelog',
  description:
    'Syncs CHANGELOG.md with workflow information. Follows Keep a Changelog format. ' +
    'Automatically detects version from package.json and categorizes changes based on feature type.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      changelog_path: {
        type: 'string',
        description: 'Path to CHANGELOG.md. Default: ./CHANGELOG.md',
      },
      version: {
        type: 'string',
        description: 'Version to add entry for. Default: from package.json or [Unreleased]',
      },
      category: {
        type: 'string',
        enum: ['added', 'changed', 'fixed', 'removed', 'deprecated', 'security'],
        description: 'Change category. Default: auto-detected from workflow type',
      },
      entry: {
        type: 'string',
        description: 'Entry text. Default: auto-generated from workflow',
      },
      workflow_id: {
        type: 'string',
        description: 'Workflow ID to extract info from. Default: current workflow',
      },
    },
    required: [],
  },
};

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;

/**
 * Map feature type to changelog category
 */
function featureTypeToCategory(
  featureType: string
): 'added' | 'changed' | 'fixed' | 'removed' | 'deprecated' | 'security' {
  switch (featureType.toLowerCase()) {
    case 'feature':
      return 'added';
    case 'bugfix':
    case 'fix':
      return 'fixed';
    case 'refactor':
      return 'changed';
    case 'docs':
    case 'documentation':
      return 'changed';
    case 'security':
      return 'security';
    case 'deprecation':
      return 'deprecated';
    case 'removal':
      return 'removed';
    default:
      return 'changed';
  }
}

/**
 * Get version from package.json
 */
async function getPackageVersion(cwd?: string): Promise<string | null> {
  try {
    const projectRoot = await getProjectRoot(cwd);
    const packagePath = path.join(projectRoot, 'package.json');
    const content = await fs.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(content);
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * Parse changelog to find sections
 */
function parseChangelog(content: string): {
  header: string;
  versions: Map<string, { start: number; end: number; content: string }>;
  lines: string[];
} {
  const lines = content.split('\n');
  const versions = new Map<string, { start: number; end: number; content: string }>();

  let headerEnd = 0;
  let currentVersion: { name: string; start: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Version header: ## [1.0.0] or ## [Unreleased]
    const versionMatch = line.match(/^##\s+\[([^\]]+)\]/);

    if (versionMatch) {
      // Close previous version
      if (currentVersion) {
        const versionContent = lines.slice(currentVersion.start, i).join('\n');
        versions.set(currentVersion.name, {
          start: currentVersion.start,
          end: i - 1,
          content: versionContent,
        });
      } else {
        headerEnd = i;
      }

      currentVersion = {
        name: versionMatch[1],
        start: i,
      };
    }
  }

  // Close last version
  if (currentVersion) {
    const versionContent = lines.slice(currentVersion.start).join('\n');
    versions.set(currentVersion.name, {
      start: currentVersion.start,
      end: lines.length - 1,
      content: versionContent,
    });
  }

  const header = lines.slice(0, headerEnd).join('\n');

  return { header, versions, lines };
}

/**
 * Format category name for display
 */
function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Add entry to a version section
 */
function addEntryToVersion(
  versionContent: string,
  category: string,
  entry: string
): string {
  const lines = versionContent.split('\n');
  const categoryHeader = `### ${formatCategory(category)}`;

  // Find category section
  let categoryIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === categoryHeader) {
      categoryIndex = i;
      break;
    }
  }

  if (categoryIndex === -1) {
    // Category doesn't exist, add it
    // Find where to insert (after version header, before next category or end)
    let insertIndex = 1; // After version header
    while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
      insertIndex++;
    }

    lines.splice(insertIndex, 0, '', categoryHeader, '', `- ${entry}`);
  } else {
    // Find end of category (next ### or end of content)
    let insertIndex = categoryIndex + 1;
    while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
      insertIndex++;
    }

    // Insert after category header and any existing items
    while (
      insertIndex < lines.length &&
      !lines[insertIndex].startsWith('###') &&
      !lines[insertIndex].startsWith('## ')
    ) {
      insertIndex++;
    }

    // Insert before the next section
    lines.splice(insertIndex, 0, `- ${entry}`);
  }

  return lines.join('\n');
}

export async function syncChangelog(args: SyncChangelogArgs): Promise<SyncChangelogResult> {
  const { changelog_path, version, category, entry, workflow_id } = args;

  try {
    const projectRoot = await getProjectRoot();
    const changelogFile = changelog_path || path.join(projectRoot, 'CHANGELOG.md');

    // Get workflow info if needed
    let entryText = entry;
    let entryCategory = category;

    if (!entryText || !entryCategory) {
      const workflow = workflow_id
        ? await getWorkflowById(workflow_id)
        : await getCurrentWorkflow();

      if (workflow) {
        if (!entryText) {
          entryText = `**${workflow.feature_name}**: ${workflow.description}`;
        }
        if (!entryCategory) {
          entryCategory = featureTypeToCategory(workflow.feature_type);
        }
      } else if (!entryText) {
        return {
          success: false,
          changelog_path: changelogFile,
          version: '',
          category: '',
          entry_added: '',
          message: 'No workflow found and no entry text provided',
          error: 'Provide entry text or ensure a workflow exists',
        };
      }
    }

    if (!entryCategory) {
      entryCategory = 'changed';
    }

    // Determine version
    let targetVersion = version;
    if (!targetVersion) {
      targetVersion = (await getPackageVersion()) || 'Unreleased';
    }

    // Read or create changelog
    let content: string;
    try {
      content = await fs.readFile(changelogFile, 'utf-8');
    } catch {
      // Create new changelog
      content = CHANGELOG_HEADER;
    }

    const { header, versions, lines } = parseChangelog(content);

    // Check if version section exists
    if (!versions.has(targetVersion)) {
      // Create new version section
      const date = new Date().toISOString().split('T')[0];
      const versionHeader =
        targetVersion === 'Unreleased'
          ? `## [Unreleased]`
          : `## [${targetVersion}] - ${date}`;

      const newVersionSection = `${versionHeader}\n\n### ${formatCategory(entryCategory)}\n\n- ${entryText}\n`;

      // Insert after header
      const headerLines = header ? header.split('\n').length : 0;
      lines.splice(headerLines, 0, '', newVersionSection);

      const newContent = lines.join('\n');
      await fs.writeFile(changelogFile, newContent);

      return {
        success: true,
        changelog_path: changelogFile,
        version: targetVersion,
        category: entryCategory,
        entry_added: entryText,
        message: `Created new version section [${targetVersion}] with entry`,
      };
    }

    // Add to existing version
    const versionInfo = versions.get(targetVersion)!;
    const updatedVersionContent = addEntryToVersion(
      versionInfo.content,
      entryCategory,
      entryText
    );

    // Replace version content in lines
    const newLines = [
      ...lines.slice(0, versionInfo.start),
      ...updatedVersionContent.split('\n'),
      ...lines.slice(versionInfo.end + 1),
    ];

    const newContent = newLines.join('\n');
    await fs.writeFile(changelogFile, newContent);

    return {
      success: true,
      changelog_path: changelogFile,
      version: targetVersion,
      category: entryCategory,
      entry_added: entryText,
      message: `Added entry to [${targetVersion}] under ${formatCategory(entryCategory)}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      changelog_path: changelog_path || 'CHANGELOG.md',
      version: '',
      category: '',
      entry_added: '',
      message: `Failed to sync changelog: ${message}`,
      error: message,
    };
  }
}
