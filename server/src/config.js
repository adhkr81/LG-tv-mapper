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
  emulatorDataPath:
    process.env.EMULATOR_DATA_PATH ||
    path.join(DATA_DIR, 'emulator.json'),
  mapperMetaPath:
    process.env.MAPPER_META_PATH ||
    path.join(DATA_DIR, 'mapper-meta.json'),
};

export default config;
