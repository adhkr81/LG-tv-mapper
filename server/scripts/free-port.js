import { execSync } from 'child_process';
import config from '../src/config.js';

const port = config.port;

function listenersOnPort(p) {
  try {
    const out = execSync(`netstat -ano`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${p}`) || !line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

const pids = listenersOnPort(port);
if (!pids.length) {
  console.log(`[free-port] :${port} is free`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    console.log(`[free-port] Stopping PID ${pid} on :${port}`);
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
  } catch (err) {
    console.warn(`[free-port] Could not stop PID ${pid}:`, err.message);
  }
}

process.exit(0);
