# mastra-f4-repro

Minimal reproduction for the `@mastra/client-js` AgentController `subscribe()` bug:
no reconnect after a dropped SSE stream, silent death on clean server close, and no
auth-refresh path for long-lived sessions. See `BUG_REPORT.md` for the full issue
text (ready to paste into GitHub once the repro is pushed to a public repo and the
placeholder link is filled in).

```bash
npm install
node repro.mjs   # exits 0 when all findings reproduce
```

- `server.mjs` — mock Mastra server: speaks just enough SSE for
  `AgentControllerSession.subscribe()`, emits 3 events, then closes the connection
  (cleanly or abruptly depending on the session path), and counts requests so the
  repro can prove no reconnect attempt arrives.
- `repro.mjs` — subscribes with the real SDK and asserts the three findings.

Verified against `@mastra/client-js@1.31.1` (latest as of 2026-07-09).
