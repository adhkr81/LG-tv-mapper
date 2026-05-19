import { SerialPort } from 'serialport';
import { ReadlineParser } from 'serialport';
import config from '../config.js';

/** @type {SerialPort | null} */
let port = null;
/** @type {ReadlineParser | null} */
let parser = null;
/** @type {'disconnected' | 'connecting' | 'connected' | 'shell-ready'} */
let status = 'disconnected';
/** Stored reference to the parser's data handler so we can remove/re-add it */
let parserDataHandler = null;

/**
 * Get current serial connection status.
 */
export function getStatus() {
  return { status, port: config.serial.port, baudRate: config.serial.baudRate };
}

/**
 * Connect to the serial port and initialize the TV shell.
 */
export function connect() {
  return new Promise((resolve, reject) => {
    if (port && port.isOpen) {
      resolve({ status });
      return;
    }

    status = 'connecting';

    try {
      port = new SerialPort({
        path: config.serial.port,
        baudRate: config.serial.baudRate,
        autoOpen: false,
        // Enable RTS/CTS hardware flow control to help with large transfers
        rtscts: true,
        // Increase read buffer
        highWaterMark: 64 * 1024,
      });

      parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      port.on('error', (err) => {
        console.error('[Serial] Error:', err.message);
        status = 'disconnected';
      });

      port.on('close', () => {
        console.log('[Serial] Port closed');
        status = 'disconnected';
      });

      // Store and attach the parser's data handler
      parserDataHandler = (line) => {
        console.log('[Serial RX]', line);
      };
      parser.on('data', parserDataHandler);

      port.open((err) => {
        if (err) {
          status = 'disconnected';
          reject(new Error(`Failed to open ${config.serial.port}: ${err.message}`));
          return;
        }

        console.log(`[Serial] Opened ${config.serial.port} at ${config.serial.baudRate}`);
        status = 'connected';

        // Initialize: send debug -> s to get to shell
        initShell()
          .then(() => {
            status = 'shell-ready';
            resolve({ status });
          })
          .catch((initErr) => {
            console.error('[Serial] Shell init failed:', initErr.message);
            // Still connected, just not in shell mode
            resolve({ status });
          });
      });
    } catch (err) {
      status = 'disconnected';
      reject(err);
    }
  });
}

/**
 * Send initialization commands to enter TV shell mode.
 */
function initShell() {
  return new Promise((resolve, reject) => {
    if (!port || !port.isOpen) {
      reject(new Error('Port not open'));
      return;
    }

    // Send "debug" to enter debug mode
    setTimeout(() => {
      port.write('debug\r\n', (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('[Serial TX] debug');

        // Wait, then send "s" to enter shell
        setTimeout(() => {
          port.write('s\r\n', (err2) => {
            if (err2) {
              reject(err2);
              return;
            }
            console.log('[Serial TX] s');

            // Give the TV a moment to enter shell mode
            setTimeout(() => {
              resolve();
            }, 2000);
          });
        }, 2000);
      });
    }, 500);
  });
}

/**
 * Disconnect the serial port.
 */
export function disconnect() {
  return new Promise((resolve) => {
    if (!port || !port.isOpen) {
      status = 'disconnected';
      resolve({ status });
      return;
    }

    port.close((err) => {
      if (err) console.error('[Serial] Close error:', err.message);
      port = null;
      parser = null;
      status = 'disconnected';
      resolve({ status });
    });
  });
}

/**
 * Execute a command over serial and return after a timeout.
 * @param {string} command
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<string>} collected output
 */
export function execute(command, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!port || !port.isOpen) {
      reject(new Error('Serial port not connected'));
      return;
    }

    if (status !== 'shell-ready' && status !== 'connected') {
      reject(new Error(`Serial not ready (status: ${status})`));
      return;
    }

    const lines = [];
    const onData = (line) => {
      lines.push(line);
    };

    parser.on('data', onData);

    port.write(command + '\r\n', (err) => {
      if (err) {
        parser.removeListener('data', onData);
        reject(err);
        return;
      }

      console.log('[Serial TX]', command);

      // Wait for response to accumulate
      setTimeout(() => {
        parser.removeListener('data', onData);
        resolve(lines.join('\n'));
      }, timeoutMs);
    });
  });
}

/**
 * Execute a command and stream raw data until a terminator marker is seen.
 * Useful for receiving base64-encoded file contents over the shell.
 * @param {string} command
 * @param {string} terminator
 * @param {number} [timeoutMs=60000]
 * @returns {Promise<Buffer>} collected raw data (as Buffer) up to the terminator
 */
export function executeStream(command, terminator = '__END__', timeoutMs = 60000, beginMarker = null) {
  return new Promise((resolve, reject) => {
    if (!port || !port.isOpen) {
      reject(new Error('Serial port not connected'));
      return;
    }

    if (status !== 'shell-ready' && status !== 'connected') {
      reject(new Error(`Serial not ready (status: ${status})`));
      return;
    }

    let buffers = [];
    let totalLen = 0;
    const termBuf = Buffer.from(terminator, 'utf8');
    const beginBuf = beginMarker ? Buffer.from(beginMarker, 'utf8') : null;
    let started = !beginBuf;

    const onData = (chunk) => {
      try {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
        buffers.push(buf);
        totalLen += buf.length;

        const collected = Buffer.concat(buffers, totalLen);

        if (!started && beginBuf) {
          const bi = collected.indexOf(beginBuf);
          if (bi !== -1) {
            // drop everything up to and including beginBuf
            const rest = collected.slice(bi + beginBuf.length);
            buffers = [rest];
            totalLen = rest.length;
            started = true;
          }
        }

        if (started) {
          const ti = collected.indexOf(termBuf);
          if (ti !== -1) {
            port.removeListener('data', onData);
            clearTimeout(timer);
            // Pause and re-pipe the parser to resume normal line-based reading
            try {
              port.pause();
              port.pipe(parser);
              if (parserDataHandler) parser.on('data', parserDataHandler);
            } catch (e) {
              console.error('[Serial] Failed to re-pipe parser:', e.message);
            }
            const result = collected.slice(0, ti);
            resolve(result);
          }
        }
      } catch (err) {
        // ignore
      }
    };

    // Remove parser's listener and unpipe to get raw data directly
    try {
      if (parserDataHandler) parser.removeListener('data', parserDataHandler);
      port.unpipe(parser);
      // Resume the port data flow after unpiping
      port.resume();
    } catch (e) {
      console.error('[Serial] Failed to unpipe parser:', e.message);
    }

    const timer = setTimeout(() => {
      port.removeListener('data', onData);
      try {
        port.pause();
        port.pipe(parser);
        if (parserDataHandler) parser.on('data', parserDataHandler);
      } catch (e) {
        console.error('[Serial] Failed to re-pipe on timeout:', e.message);
      }
      reject(new Error('Stream timed out'));
    }, timeoutMs);

    port.on('data', onData);

    port.write(command + '\r\n', (err) => {
      if (err) {
        port.removeListener('data', onData);
        clearTimeout(timer);
        try {
          port.pause();
          port.pipe(parser);
          if (parserDataHandler) parser.on('data', parserDataHandler);
        } catch (e) {
          console.error('[Serial] Failed to re-pipe on error:', e.message);
        }
        reject(err);
        return;
      }
      console.log('[Serial TX]', command);
    });
  });
}
