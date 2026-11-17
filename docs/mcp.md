# MCP server (`@stacklatte/chart-mcp`)

An MCP server so AI assistants can build exact charts instead of guessing props. It runs locally over stdio and needs no API key.

```sh
claude mcp add stacklatte-charts -- npx -y @stacklatte/chart-mcp
```

For Cursor, Windsurf, Claude Desktop and other clients, add this to the client's MCP config:

```json
{
  "mcpServers": {
    "stacklatte-charts": { "command": "npx", "args": ["-y", "@stacklatte/chart-mcp"] }
  }
}
```

## Tools

- **`list_capabilities`**: every chart option with its allowed values and default, the four presets (`trading`, `area`, `sparkline`, `everything`) and the frameworks.
- **`generate_chart`**: `{ framework: 'react' | 'angular' | 'react-native' | 'typescript', preset?, settings? }` returns the code, the install command, the validated `ChartConfig`, a plain-English spec and a complete prompt. `settings` uses the ids from `list_capabilities`, for example `{ rsi: true, rsiPeriod: 9, chartType: 'area', zoom: 120 }`. Unknown keys and out-of-range values are rejected.
- **`validate_chart_config`**: runs the library's strict validator on a `ChartConfig` and returns itemised errors.
- **`get_docs`**: `overview` (llms.txt), `full` (llms-full.txt) or `query` for the paragraphs that mention a word.
- **`report_issue`**: where to send bug reports (bugs@stacklatte.com) with a prefilled template.

The same generator powers the website's [Chart Lab](https://stacklatte.com/lab), and its output is type-checked against the built packages in this repository's test suite.

## Reporting issues

Email bugs@stacklatte.com, or open an issue at https://github.com/Asterix19/charts/issues. Include `npm ls @stacklatte/chart-react @stacklatte/chart-engine`, your framework and what you expected.
