# `@stacklatte/chart-mcp`

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants (Claude Code, Cursor, Windsurf, Claude Desktop, VS Code, anything that speaks MCP) build **exact, type-checked charts** with [Stacklatte Charts](https://github.com/Asterix19/charts): React, Angular, React Native and plain TypeScript.

Instead of guessing props from memory, the assistant asks the server. It gets code that is type-checked against the real packages, the validated `ChartConfig` JSON, and a complete prompt for the chart you described.

## Add it to your project

Claude Code:

```sh
claude mcp add stacklatte-charts -- npx -y @stacklatte/chart-mcp
```

Cursor, Windsurf, Claude Desktop and other clients (`mcp.json` / `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "stacklatte-charts": { "command": "npx", "args": ["-y", "@stacklatte/chart-mcp"] }
  }
}
```

Then ask: *"Add a stock list with a blue sparkline per row using Stacklatte Charts"* or *"Make a candlestick chart with SMA 20, RSI 9 and volume for my Next.js app"*.

## Tools

| Tool | What it does |
|---|---|
| `list_capabilities` | Every chart option (data, view, overlays, panels, markers, custom theme) with allowed values and defaults, the presets and the frameworks. |
| `generate_chart` | Code for `react`, `angular`, `react-native` or `typescript`, plus install command, validated `ChartConfig`, a plain-English spec and a ready-made prompt. Pass a `preset` (`trading`, `area`, `sparkline`, `everything`) and/or `settings`. Unknown or out-of-range settings are rejected with a clear error. |
| `validate_chart_config` | Checks a `ChartConfig` against the library's strict validator and returns itemised errors with paths. |
| `get_docs` | The API docs written for AI agents: `overview` (llms.txt), `full` (llms-full.txt) or a keyword `query`. |
| `report_issue` | How to report a problem: bugs@stacklatte.com, with a prefilled mailto and template. |

It also serves the docs as the resource `stacklatte-charts://llms.txt`.

## Try the same thing in a browser

The [Chart Lab](https://stacklatte.com/lab) uses the same generator: build a chart with every control, then copy the code, the `ChartConfig` or the AI prompt.

## Report issues

Email **bugs@stacklatte.com** (or open an [issue](https://github.com/Asterix19/charts/issues)). Include the package versions (`npm ls @stacklatte/chart-react @stacklatte/chart-engine`), your framework and what you expected. The Chart Lab's "Report an issue" button prefills all of that for you.

MIT. Part of [Stacklatte Charts](https://github.com/Asterix19/charts).
