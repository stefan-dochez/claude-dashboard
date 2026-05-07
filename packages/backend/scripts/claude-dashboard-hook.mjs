#!/usr/bin/env node
// Claude Dashboard hook bridge.
// Receives a hook payload on stdin and POSTs an event to the dashboard backend.
// Always exits 0 — failures here must not block Claude Code.

const {
  CLAUDE_DASHBOARD_INSTANCE_ID: instanceId,
  CLAUDE_DASHBOARD_PORT: port,
  CLAUDE_DASHBOARD_TOKEN: token,
} = process.env;

if (!instanceId || !port || !token) {
  process.exit(0);
}

const failsafe = setTimeout(() => process.exit(0), 2000);

let stdin = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => { stdin += chunk; });
process.stdin.on('end', async () => {
  let event = null;
  let sessionId = null;
  try {
    const payload = JSON.parse(stdin);
    event = typeof payload.hook_event_name === 'string' ? payload.hook_event_name : null;
    sessionId = typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch { /* keep nulls — backend can still react on instanceId */ }

  try {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 1500);
    await fetch(`http://127.0.0.1:${port}/api/hook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ instanceId, event, sessionId }),
      signal: controller.signal,
    });
    clearTimeout(abortTimer);
  } catch { /* swallow */ }

  clearTimeout(failsafe);
  process.exit(0);
});
