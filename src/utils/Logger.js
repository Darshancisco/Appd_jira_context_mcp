class Logger {
  constructor(context = 'IntelliMCP') {
    this.context = context;
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.enableColors = process.env.NODE_ENV !== 'production';
  }

  static levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  };

  static colors = {
    error: '\x1b[31m', // Red
    warn: '\x1b[33m',  // Yellow
    info: '\x1b[36m',  // Cyan
    debug: '\x1b[35m', // Magenta
    trace: '\x1b[37m', // White
    reset: '\x1b[0m'
  };

  shouldLog(level) {
    return Logger.levels[level] <= Logger.levels[this.logLevel];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const color = this.enableColors ? Logger.colors[level] : '';
    const reset = this.enableColors ? Logger.colors.reset : '';
    
    const baseMessage = `${color}[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}${reset}`;
    
    if (Object.keys(meta).length > 0) {
      return `${baseMessage}\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return baseMessage;
  }

  error(message, meta = {}) {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta));
    }
  }

  warn(message, meta = {}) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  info(message, meta = {}) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  debug(message, meta = {}) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  trace(message, meta = {}) {
    if (this.shouldLog('trace')) {
      console.log(this.formatMessage('trace', message, meta));
    }
  }

  // Performance logging
  time(label) {
    if (this.shouldLog('debug')) {
      console.time(`${this.context}:${label}`);
    }
  }

  timeEnd(label) {
    if (this.shouldLog('debug')) {
      console.timeEnd(`${this.context}:${label}`);
    }
  }

  // Structured logging for operations
  logOperation(operation, status, details = {}) {
    const level = status === 'success' ? 'info' : status === 'error' ? 'error' : 'warn';
    const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '⚠️';
    
    this[level](`${emoji} ${operation}`, {
      status,
      ...details
    });
  }

  // API call logging
  logApiCall(method, url, status, duration, error = null) {
    const meta = {
      method,
      url,
      status,
      duration: `${duration}ms`
    };

    if (error) {
      meta.error = error.message;
      this.error(`API call failed: ${method} ${url}`, meta);
    } else {
      this.info(`API call: ${method} ${url}`, meta);
    }
  }

  // JIRA specific logging
  logJiraOperation(operation, ticketNumber, result) {
    this.logOperation(`JIRA ${operation}`, result.success ? 'success' : 'error', {
      ticket: ticketNumber,
      ...result
    });
  }

  // Library analysis logging
  logLibraryAnalysis(libraryName, fromVersion, toVersion, confidence) {
    this.info(`📚 Library detected: ${libraryName}`, {
      upgrade: `${fromVersion} → ${toVersion}`,
      confidence: `${Math.round(confidence * 100)}%`
    });
  }

  // Repository analysis logging
  logRepositoryAnalysis(analysis) {
    this.info('📁 Repository analyzed', {
      languages: analysis.detected_languages,
      files: analysis.total_files,
      dependencies: analysis.dependency_files.length
    });
  }

  // Performance metrics
  logPerformanceMetrics(operation, metrics) {
    this.debug(`📊 Performance: ${operation}`, metrics);
  }
}

// CommonJS export
module.exports = { Logger };
