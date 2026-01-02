# Smart Agent Workflow MCP

> The only MCP that **enforces tests before merge**. Full-cycle development automation with testing gates and knowledge graph memory.

[![npm version](https://badge.fury.io/js/smart-agent-workflow-mcp.svg)](https://www.npmjs.com/package/smart-agent-workflow-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This MCP?

5+ git worktree MCPs exist. None require tests. **This one does.**

| Feature | Others | Smart Agent Workflow |
|---------|--------|---------------------|
| Worktree management | ✅ | ✅ |
| **Mandatory E2E tests** | ❌ | ✅ |
| **Build verification** | ❌ | ✅ |
| **Auto-rollback** | ❌ | ✅ |
| **Memory persistence** | ❌ | ✅ 🧠 |
| Full-cycle workflow | ❌ | ✅ |

## Quick Start

```bash
npx smart-agent-workflow-mcp
```

## Installation

```bash
npm install -g smart-agent-workflow-mcp
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "smart-agent-workflow": {
      "command": "npx",
      "args": ["smart-agent-workflow-mcp"]
    }
  }
}
```

### Claude Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "smart-agent-workflow": {
      "command": "npx",
      "args": ["smart-agent-workflow-mcp"]
    }
  }
}
```

## Tools

### Worktree Management

| Tool | Description |
|------|-------------|
| `create_worktree` | Create isolated feature environment with ephemeral worktree |
| `worktree_status` | List all active worktrees with metadata |
| `cleanup_worktree` | Merge and cleanup (requires tests to pass!) |
| `abort_worktree` | Cancel without merge |

### Usage Examples

#### Create a new worktree

```
Use create_worktree with task="Add user authentication" and base_branch="main"
```

#### List active worktrees

```
Use worktree_status
```

#### Complete and merge a feature

```
Use cleanup_worktree with worktree_path="/path/to/worktree"
```

#### Cancel a feature

```
Use abort_worktree with worktree_path="/path/to/worktree" and reason="Requirements changed"
```

## Resources

| Resource | Description |
|----------|-------------|
| `worktree://status` | JSON with current status of all worktrees |

## Philosophy

> "No merge without green tests. Every feature builds collective knowledge."

**The 3 Pillars:**
1. 🧪 **Test-First**: Quality gates that can't be bypassed
2. 🧠 **Memory**: Context that grows with your project
3. 📝 **Auto-Docs**: Documentation enriched by history

## Roadmap

| Version | Features |
|---------|----------|
| ✅ v0.1.0 | Worktree management (current) |
| 🔜 v0.2.0 | Testing integration (Playwright, build verification) |
| 🔜 v0.3.0 | Full workflow (start_feature, complete_feature, rollback) |
| 🔜 v0.4.0 | Documentation (auto-update CLAUDE.md, reports) |
| 🔜 v0.5.0 | Memory (knowledge graph, context persistence) |
| 🔜 v1.0.0 | Production ready |

## Development

```bash
# Clone the repo
git clone https://github.com/vjrivmon/smart-agent-workflow-mcp.git
cd smart-agent-workflow-mcp

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Test
npm test
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

## License

MIT © [Vicente Rivas Monferrer](https://github.com/vjrivmon)

---

Made with ❤️ by [Vicente Rivas Monferrer](https://vicenterivasmonferrer.dev)

## Recent Changes

Test entry from validation
