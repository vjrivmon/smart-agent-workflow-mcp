/**
 * update_documentation Tool - Smart Agent Workflow MCP v0.4.0
 *
 * Updates project documentation (CLAUDE.md, README.md) with workflow info.
 * Automatically detects sections and appends/updates content.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectRoot } from '../../lib/git.js';
import { getCurrentWorkflow, getWorkflowById } from '../workflow/state-machine.js';
import type { UpdateDocumentationArgs, UpdateDocumentationResult } from './types.js';

export const updateDocumentationDefinition = {
  name: 'update_documentation',
  description:
    'Updates project documentation (CLAUDE.md, README.md) with information from the current workflow. ' +
    'Can auto-detect sections or target specific ones. Useful for keeping docs in sync with development.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      doc_path: {
        type: 'string',
        description: 'Path to documentation file. Default: auto-detects CLAUDE.md or README.md',
      },
      workflow_id: {
        type: 'string',
        description: 'Workflow ID to extract info from. Default: current workflow',
      },
      section: {
        type: 'string',
        description: 'Section name to update (e.g., "## Features", "### Recent Changes")',
      },
      content: {
        type: 'string',
        description: 'Content to add. If not provided, auto-generates from workflow info',
      },
      mode: {
        type: 'string',
        enum: ['append', 'replace', 'prepend'],
        default: 'append',
        description: 'How to update the section: append, replace, or prepend',
      },
    },
    required: [],
  },
};

/**
 * Find the best documentation file to update
 */
async function findDocFile(cwd?: string): Promise<string | null> {
  const projectRoot = await getProjectRoot(cwd);

  // Priority order: CLAUDE.md > README.md
  const candidates = ['CLAUDE.md', 'README.md', 'docs/README.md'];

  for (const candidate of candidates) {
    const fullPath = path.join(projectRoot, candidate);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Parse markdown sections from content
 */
function parseSections(content: string): Map<string, { start: number; end: number; level: number }> {
  const sections = new Map<string, { start: number; end: number; level: number }>();
  const lines = content.split('\n');

  let currentSection: { name: string; start: number; level: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Close previous section
      if (currentSection) {
        sections.set(currentSection.name, {
          start: currentSection.start,
          end: i - 1,
          level: currentSection.level,
        });
      }

      currentSection = {
        name: headerMatch[2].trim(),
        start: i,
        level: headerMatch[1].length,
      };
    }
  }

  // Close last section
  if (currentSection) {
    sections.set(currentSection.name, {
      start: currentSection.start,
      end: lines.length - 1,
      level: currentSection.level,
    });
  }

  return sections;
}

/**
 * Generate content from workflow info
 */
function generateWorkflowContent(workflow: {
  feature_name: string;
  feature_type: string;
  description: string;
  test_results?: { passed: number; failed: number };
  build_results?: { success: boolean };
  completed_at?: string;
}): string {
  const date = workflow.completed_at
    ? new Date(workflow.completed_at).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  let content = `- **${workflow.feature_name}** (${workflow.feature_type}) - ${workflow.description}`;

  if (workflow.test_results) {
    content += ` [Tests: ${workflow.test_results.passed}✓]`;
  }

  if (workflow.build_results?.success) {
    content += ` [Build: ✓]`;
  }

  content += ` _(${date})_`;

  return content;
}

export async function updateDocumentation(
  args: UpdateDocumentationArgs
): Promise<UpdateDocumentationResult> {
  const { doc_path, workflow_id, section, content, mode = 'append' } = args;

  try {
    // Find doc file
    let targetPath = doc_path;
    if (!targetPath) {
      const found = await findDocFile();
      if (!found) {
        return {
          success: false,
          doc_path: '',
          section_updated: '',
          lines_added: 0,
          message: 'No documentation file found',
          error: 'Could not find CLAUDE.md or README.md in project',
        };
      }
      targetPath = found;
    }

    // Get workflow info if needed
    let workflowContent = content;
    if (!workflowContent) {
      const workflow = workflow_id
        ? await getWorkflowById(workflow_id)
        : await getCurrentWorkflow();

      if (workflow) {
        workflowContent = generateWorkflowContent(workflow);
      } else {
        return {
          success: false,
          doc_path: targetPath,
          section_updated: '',
          lines_added: 0,
          message: 'No workflow found to extract info from',
          error: 'Provide content manually or ensure a workflow exists',
        };
      }
    }

    // Read current content
    let docContent: string;
    try {
      docContent = await fs.readFile(targetPath, 'utf-8');
    } catch {
      // File doesn't exist, create with content
      const newContent = section
        ? `${section}\n\n${workflowContent}\n`
        : `# Documentation\n\n${workflowContent}\n`;

      await fs.writeFile(targetPath, newContent);

      return {
        success: true,
        doc_path: targetPath,
        section_updated: section || 'New file',
        lines_added: newContent.split('\n').length,
        message: `Created new documentation file: ${path.basename(targetPath)}`,
      };
    }

    // Parse sections
    const sections = parseSections(docContent);
    const lines = docContent.split('\n');

    // Find target section
    let targetSection = section;
    if (!targetSection) {
      // Auto-detect: look for "Recent Changes", "Changelog", "Updates", etc.
      const autoSections = ['Recent Changes', 'Changelog', 'Updates', 'What\'s New', 'History'];
      for (const auto of autoSections) {
        if (sections.has(auto)) {
          targetSection = auto;
          break;
        }
      }

      // If no section found, append at end
      if (!targetSection) {
        const newContent = docContent.trimEnd() + '\n\n## Recent Changes\n\n' + workflowContent + '\n';
        await fs.writeFile(targetPath, newContent);

        return {
          success: true,
          doc_path: targetPath,
          section_updated: 'Recent Changes (created)',
          lines_added: 3,
          message: 'Created "Recent Changes" section and added entry',
        };
      }
    }

    // Update the section
    const sectionInfo = sections.get(targetSection);
    if (!sectionInfo) {
      // Section doesn't exist, create it
      const headerLevel = '#'.repeat(2); // Default to h2
      const newContent = docContent.trimEnd() + `\n\n${headerLevel} ${targetSection}\n\n${workflowContent}\n`;
      await fs.writeFile(targetPath, newContent);

      return {
        success: true,
        doc_path: targetPath,
        section_updated: targetSection + ' (created)',
        lines_added: 3,
        message: `Created section "${targetSection}" and added entry`,
      };
    }

    // Insert content based on mode
    const contentLines = workflowContent.split('\n');
    let insertIndex: number;

    switch (mode) {
      case 'prepend':
        // After the header line
        insertIndex = sectionInfo.start + 1;
        // Skip any empty lines after header
        while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
          insertIndex++;
        }
        break;
      case 'replace':
        // Remove existing content and add new
        lines.splice(sectionInfo.start + 1, sectionInfo.end - sectionInfo.start);
        insertIndex = sectionInfo.start + 1;
        break;
      case 'append':
      default:
        // Before the next section or end
        insertIndex = sectionInfo.end + 1;
        break;
    }

    // Insert the new content
    lines.splice(insertIndex, 0, '', ...contentLines);

    const newContent = lines.join('\n');
    await fs.writeFile(targetPath, newContent);

    return {
      success: true,
      doc_path: targetPath,
      section_updated: targetSection,
      lines_added: contentLines.length + 1,
      message: `Updated section "${targetSection}" with ${mode} mode`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      doc_path: doc_path || '',
      section_updated: '',
      lines_added: 0,
      message: `Failed to update documentation: ${message}`,
      error: message,
    };
  }
}
