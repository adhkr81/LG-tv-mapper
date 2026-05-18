import { SerialPort } from 'serialport';
import { ReadlineParser } from 'serialport';
import config from '../config.js';

/** @type {SerialPort | null} */
let port = null;
/** @type {ReadlineParser | null} */
let parser = null;
/** @type {'disconnected' | 'connecting' | 'connected' | 'shell-ready'} */
let status = 'disconnected';

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

      // Collect incoming data for debugging
      parser.on('data', (line) => {
        console.log('[Serial RX]', line);
      });

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
