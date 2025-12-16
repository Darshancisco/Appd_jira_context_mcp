// Converted to CommonJS
const { Logger } = require('./Logger.js');

class PerformanceMonitor {
  constructor() {
    this.logger = new Logger('Performance');
    this.metrics = new Map();
    this.enabled = process.env.FEATURE_METRICS === 'true';
  }

  startTimer(operation) {
    if (!this.enabled) return null;
    
    const timer = {
      operation,
      startTime: process.hrtime.bigint(),
      startMemory: process.memoryUsage()
    };
    
    this.metrics.set(operation, timer);
    return timer;
  }

  endTimer(operation) {
    if (!this.enabled) return null;
    
    const timer = this.metrics.get(operation);
    if (!timer) return null;

    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const duration = Number(endTime - timer.startTime) / 1000000; // Convert to milliseconds
    const memoryDelta = {
      rss: endMemory.rss - timer.startMemory.rss,
      heapUsed: endMemory.heapUsed - timer.startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - timer.startMemory.heapTotal
    };

    const metrics = {
      operation,
      duration: `${duration.toFixed(2)}ms`,
      memory: {
        rss: `${(memoryDelta.rss / 1024 / 1024).toFixed(2)}MB`,
        heapUsed: `${(memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(memoryDelta.heapTotal / 1024 / 1024).toFixed(2)}MB`
      }
    };

    this.logger.debug(`📊 ${operation} completed`, metrics);
    this.metrics.delete(operation);
    
    return metrics;
  }

  measureAsync(operation, asyncFunction) {
    if (!this.enabled) {
      return asyncFunction();
    }

    return new Promise(async (resolve, reject) => {
      const timer = this.startTimer(operation);
      
      try {
        const result = await asyncFunction();
        this.endTimer(operation);
        resolve(result);
      } catch (error) {
        this.endTimer(operation);
        this.logger.error(`❌ ${operation} failed`, { 
          error: error.message,
          duration: timer ? `${Number(process.hrtime.bigint() - timer.startTime) / 1000000}ms` : 'unknown'
        });
        reject(error);
      }
    });
  }

  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`
      },
      cpu: {
        user: `${(cpuUsage.user / 1000).toFixed(2)}ms`,
        system: `${(cpuUsage.system / 1000).toFixed(2)}ms`
      },
      uptime: `${(process.uptime() / 60).toFixed(2)}min`,
      activeTimers: this.metrics.size
    };
  }

  logSystemMetrics() {
    if (this.enabled) {
      this.logger.info('📊 System metrics', this.getSystemMetrics());
    }
  }

  // Specific operation measurements
  async measureJiraFetch(ticketNumber, fetchFunction) {
    return this.measureAsync(`jira-fetch-${ticketNumber}`, fetchFunction);
  }

  async measureLibraryAnalysis(libraryName, analysisFunction) {
    return this.measureAsync(`library-analysis-${libraryName}`, analysisFunction);
  }

  async measureRepositoryAnalysis(directory, analysisFunction) {
    return this.measureAsync(`repo-analysis-${path.basename(directory)}`, analysisFunction);
  }

  async measureGitHubFetch(repoPath, fetchFunction) {
    return this.measureAsync(`github-fetch-${repoPath.replace('/', '-')}`, fetchFunction);
  }
}

// Global performance monitor
const performanceMonitor = new PerformanceMonitor();

// CommonJS export
module.exports = { PerformanceMonitor, performanceMonitor };
