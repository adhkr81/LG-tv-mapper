import 'dotenv/config';

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  serial: {
    port: process.env.SERIAL_PORT || 'COM3',
    baudRate: parseInt(process.env.SERIAL_BAUD || '115200', 10),
  },
  usbWatchPath: process.env.USB_WATCH_PATH || '',
};

export default config;
