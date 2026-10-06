function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

const logger = {
  info(message, data) {
    console.log(formatMessage('INFO', message), data || '');
  },
  warn(message, data) {
    console.warn(formatMessage('WARN', message), data || '');
  },
  error(message, error) {
    console.error(formatMessage('ERROR', message));
    if (error) {
      console.error(error);
    }
  }
};

module.exports = { logger };
