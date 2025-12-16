// Converted to CommonJS
const { ErrorHandler } = require('./ErrorHandler.js');
const { Logger } = require('./Logger.js');

class Config {
  constructor() {
    this.logger = new Logger('Config');
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  loadConfiguration() {
    const config = {
      // Server configuration
      server: {
        name: process.env.SERVER_NAME || 'intellimcp-server',
        version: process.env.SERVER_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      },

      // JIRA configuration
      jira: {
        url: process.env.JIRA_URL,
        user: process.env.JIRA_USER,
        token: process.env.JIRA_TOKEN,
        projectKey: process.env.JIRA_PROJECT_KEY || 'SIM',
        timeout: parseInt(process.env.JIRA_TIMEOUT) || 30000,
        retries: parseInt(process.env.JIRA_RETRIES) || 3
      },

      // GitHub configuration
      github: {
        timeout: parseInt(process.env.GITHUB_TIMEOUT) || 10000,
        retries: parseInt(process.env.GITHUB_RETRIES) || 3,
        rateLimit: {
          maxRequests: parseInt(process.env.GITHUB_RATE_LIMIT) || 60,
          windowMs: parseInt(process.env.GITHUB_RATE_WINDOW) || 3600000 // 1 hour
        }
      },

      // Registry configuration
      registry: {
        timeout: parseInt(process.env.REGISTRY_TIMEOUT) || 10000,
        retries: parseInt(process.env.REGISTRY_RETRIES) || 3,
        npm: {
          baseUrl: process.env.NPM_REGISTRY || 'https://registry.npmjs.org',
          searchUrl: process.env.NPM_SEARCH || 'https://api.npms.io/v2/search'
        },
        maven: {
          baseUrl: process.env.MAVEN_REGISTRY || 'https://search.maven.org/solrsearch/select',
          repoUrl: process.env.MAVEN_REPO || 'https://repo1.maven.org/maven2'
        },
        pypi: {
          baseUrl: process.env.PYPI_REGISTRY || 'https://pypi.org/pypi'
        }
      },

      // Cache configuration
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300000, // 5 minutes
        libraryTTL: parseInt(process.env.CACHE_LIBRARY_TTL) || 3600000, // 1 hour
        jiraTTL: parseInt(process.env.CACHE_JIRA_TTL) || 1800000, // 30 minutes
        githubTTL: parseInt(process.env.CACHE_GITHUB_TTL) || 3600000, // 1 hour
        repoTTL: parseInt(process.env.CACHE_REPO_TTL) || 1800000 // 30 minutes
      },

      // Logging configuration
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableColors: process.env.LOG_COLORS !== 'false',
        enablePerformance: process.env.LOG_PERFORMANCE === 'true'
      },

      // Security configuration
      security: {
        maxInputLength: parseInt(process.env.MAX_INPUT_LENGTH) || 10000,
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
        rateLimiting: {
          enabled: process.env.RATE_LIMITING_ENABLED !== 'false',
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 100,
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000 // 15 minutes
        }
      },

      // Repository analysis configuration
      repository: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
        maxFiles: parseInt(process.env.MAX_FILES) || 10000,
        excludePatterns: process.env.EXCLUDE_PATTERNS?.split(',') || [
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          'target/**',
          '__pycache__/**'
        ]
      },

      // Feature flags
      features: {
        autoUpdate: process.env.FEATURE_AUTO_UPDATE !== 'false',
        githubIntegration: process.env.FEATURE_GITHUB !== 'false',
        jiraIntegration: process.env.FEATURE_JIRA !== 'false',
        repositoryAnalysis: process.env.FEATURE_REPO_ANALYSIS !== 'false',
        performanceMetrics: process.env.FEATURE_METRICS === 'true'
      }
    };

    this.logger.debug('Configuration loaded', { 
      environment: config.server.environment,
      features: config.features 
    });

    return config;
  }

  validateConfiguration() {
    const errors = [];

    // Validate JIRA configuration if enabled
    if (this.config.features.jiraIntegration) {
      if (!this.config.jira.url) {
        errors.push('JIRA_URL is required when JIRA integration is enabled');
      } else if (!this.isValidUrl(this.config.jira.url)) {
        errors.push('JIRA_URL must be a valid URL');
      }

      if (this.config.jira.url && (!this.config.jira.user || !this.config.jira.token)) {
        this.logger.warn('JIRA credentials not provided - using mock mode');
      }
    }

    // Validate timeout values
    const timeouts = [
      this.config.jira.timeout,
      this.config.github.timeout,
      this.config.registry.timeout
    ];

    timeouts.forEach((timeout, index) => {
      if (timeout < 1000 || timeout > 120000) {
        errors.push(`Timeout value ${timeout} is out of valid range (1000-120000ms)`);
      }
    });

    // Validate cache TTL values
    Object.entries(this.config.cache).forEach(([key, value]) => {
      if (key.endsWith('TTL') && (value < 60000 || value > 86400000)) {
        errors.push(`Cache TTL ${key} is out of valid range (1min-24h)`);
      }
    });

    if (errors.length > 0) {
      this.logger.error('Configuration validation failed', { errors });
      throw ErrorHandler.createError('CONFIG_VALIDATION_ERROR', 
        'Invalid configuration detected', { errors });
    }

    this.logger.info('✅ Configuration validated successfully');
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }

  // Convenience getters
  get jira() {
    return this.config.jira;
  }

  get github() {
    return this.config.github;
  }

  get registry() {
    return this.config.registry;
  }

  get cache() {
    return this.config.cache;
  }

  get logging() {
    return this.config.logging;
  }

  get security() {
    return this.config.security;
  }

  get repository() {
    return this.config.repository;
  }

  get features() {
    return this.config.features;
  }

  // Environment checks
  isDevelopment() {
    return this.config.server.environment === 'development';
  }

  isProduction() {
    return this.config.server.environment === 'production';
  }

  isTest() {
    return this.config.server.environment === 'test';
  }

  // Feature checks
  isFeatureEnabled(feature) {
    return this.config.features[feature] === true;
  }

  // Configuration summary for debugging
  getSummary() {
    return {
      server: this.config.server,
      features: this.config.features,
      jira: {
        configured: !!(this.config.jira.url && this.config.jira.user && this.config.jira.token),
        url: this.config.jira.url ? '[CONFIGURED]' : '[NOT SET]'
      },
      cache: {
        enabled: this.config.cache.enabled,
        defaultTTL: `${this.config.cache.defaultTTL}ms`
      },
      logging: {
        level: this.config.logging.level
      }
    };
  }
}

// Global configuration instance
const config = new Config();

// CommonJS export
module.exports = { Config, config };
