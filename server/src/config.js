import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  serial: {
    port: process.env.SERIAL_PORT || 'COM3',
    baudRate: parseInt(process.env.SERIAL_BAUD || '115200', 10),
  },
  usbWatchPath: process.env.USB_WATCH_PATH || '',
  projectsDir: path.join(DATA_DIR, 'projects'),
};

export default config;
