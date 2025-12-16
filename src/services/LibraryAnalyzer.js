// Converted to CommonJS for compatibility
const { Logger } = require('../utils/Logger.js');
const { ErrorHandler } = require('../utils/ErrorHandler.js');

class LibraryAnalyzer {
  constructor() {
    this.logger = new Logger('LibraryAnalyzer');
    
    this.patterns = {
      // Enhanced version patterns for different formats
      jira_format: {
        regex: /\|\|current_version\|([\d.]+)\|.*?\|\|remediation\|([\d.]+)\|/is,
        confidence: 0.9,
        description: 'JIRA specific format with current_version and remediation fields'
      },
      from_to: {
        regex: /(?:from|current)\s+([\d.]+).*?(?:to|target|upgrade)\s+([\d.]+)/gi,
        confidence: 0.8,
        description: 'Standard from-to version format'
      },
      upgrade_format: {
        regex: /upgrade.*?(?:from|current)\s+([\d.]+).*?(?:to|target)\s+([\d.]+)/gi,
        confidence: 0.8,
        description: 'Upgrade-specific format'
      },
      maven_coordinates: {
        regex: /([\w.-]+:[\w.-]+)\s*(?:from\s+)?([\d.]+)\s+(?:to\s+)?([\d.]+)/gi,
        confidence: 0.9,
        description: 'Maven coordinates with versions'
      },
      version_range: {
        regex: /([\w.-]+)\s+([\d.]+)\s*[-→~]\s*([\d.]+)/gi,
        confidence: 0.7,
        description: 'Library name with version range'
      },
      vulnerability_format: {
        regex: /(?:vulnerability|cve).*?(?:in|with|affects)\s+([\w.-]+).*?([\d.]+).*?(?:to|upgrade|fix)\s+([\d.]+)/gi,
        confidence: 0.8,
        description: 'Security vulnerability format'
      },
      security_advisory: {
        regex: /(?:security|advisory).*?([\w.-]+:[\w.-]+).*?version\s+([\d.]+).*?(?:upgrade|update).*?([\d.]+)/gi,
        confidence: 0.8,
        description: 'Security advisory format'
      },
      dependency_update: {
        regex: /(?:update|bump)\s+([\w.-]+)\s+(?:from\s+)?([\d.]+)\s+(?:to\s+)?([\d.]+)/gi,
        confidence: 0.7,
        description: 'Dependency update format'
      }
    };

    this.libraryKeywords = {
      javascript: [
        'react', 'vue', 'angular', 'lodash', 'axios', 'express', 'webpack',
        'babel', 'eslint', 'jest', 'mocha', 'chai', 'moment', 'dayjs',
        'socket.io', 'cors', 'helmet', 'bcrypt', 'jsonwebtoken', 'passport'
      ],
      java: [
        'commons-lang', 'commons-io', 'commons-collections', 'spring', 'jackson',
        'junit', 'logback', 'log4j', 'slf4j', 'h2', 'mysql', 'postgresql',
        'bcrypt', 'jwt', 'gson', 'okhttp', 'httpclient', 'dom4j', 'xerces'
      ],
      python: [
        'django', 'flask', 'requests', 'numpy', 'pandas', 'matplotlib',
        'pytest', 'sqlalchemy', 'celery', 'redis', 'pillow', 'beautifulsoup4'
      ],
      go: [
        'gin', 'echo', 'gorilla', 'gorm', 'cobra', 'viper', 'logrus',
        'testify', 'redis', 'jwt-go', 'bcrypt', 'uuid'
      ],
      rust: [
        'serde', 'tokio', 'actix-web', 'clap', 'reqwest', 'sqlx',
        'anyhow', 'thiserror', 'log', 'env_logger', 'uuid', 'chrono'
      ]
    };
  }

  extractLibraries(description, language = 'javascript') {
    const libraries = [];
    const cleanDescription = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Try each pattern
    Object.entries(this.patterns).forEach(([patternName, regex]) => {
      let match;
      const patternCopy = new RegExp(regex.source, regex.flags);
      let iterationCount = 0;
      const maxIterations = 10;
      
      while ((match = patternCopy.exec(cleanDescription)) !== null && iterationCount < maxIterations) {
        iterationCount++;
        
        const libraryInfo = this.extractLibraryFromMatch(match, patternName, cleanDescription, language);
        if (libraryInfo) {
          // Avoid duplicates
          const existing = libraries.find(lib => 
            lib.name === libraryInfo.name && 
            lib.fromVersion === libraryInfo.fromVersion &&
            lib.toVersion === libraryInfo.toVersion
          );
          
          if (!existing) {
            libraries.push(libraryInfo);
          }
        }
      }
    });

    return libraries;
  }

  extractLibraryFromMatch(match, patternName, description, language) {
    switch (patternName) {
      case 'jira_format':
        return {
          name: this.guessLibraryFromContext(description, language),
          fromVersion: match[1],
          toVersion: match[2],
          context: 'jira_format',
          confidence: 0.8
        };
      
      case 'from_to':
      case 'upgrade_format':
        return {
          name: this.guessLibraryFromContext(description, language),
          fromVersion: match[1],
          toVersion: match[2],
          context: patternName,
          confidence: 0.7
        };
      
      case 'maven_coordinates':
        return {
          name: match[1],
          fromVersion: match[2],
          toVersion: match[3],
          context: 'maven_coordinates',
          confidence: 0.9
        };
      
      case 'version_range':
        return {
          name: match[1],
          fromVersion: match[2],
          toVersion: match[3],
          context: 'version_range',
          confidence: 0.6
        };
      
      case 'vulnerability_format':
        return {
          name: match[1],
          fromVersion: match[2],
          toVersion: match[3],
          context: 'vulnerability_format',
          confidence: 0.5
        };
      
      default:
        return null;
    }
  }

  guessLibraryFromContext(description, language) {
    const descriptionLower = description.toLowerCase();
    const keywords = this.libraryKeywords[language] || this.libraryKeywords.javascript;
    
    // Find the most likely library based on keywords
    for (const keyword of keywords) {
      if (descriptionLower.includes(keyword.toLowerCase())) {
        return keyword;
      }
    }
    
    // Try to extract from Maven coordinates
    const mavenPattern = /([\w.-]+:[\w.-]+)/g;
    const mavenMatches = description.match(mavenPattern);
    if (mavenMatches && mavenMatches.length > 0) {
      return mavenMatches[0];
    }
    
    // Fallback: try to find any library-like name
    const libraryPattern = /(?:upgrade|update|vulnerability.*?(?:in|with))\s+([\w-]+)/i;
    const match = description.match(libraryPattern);
    if (match) {
      return match[1];
    }
    
    return 'unknown-library';
  }

  // Alias method for backwards compatibility
  extractLibraryInfo(description, language = 'javascript') {
    return this.extractLibraries(description, language);
  }

  extractContext(description) {
    const context = {
      keywords: [],
      securityTerms: [],
      upgradeTerms: [],
      mentionedLibraries: []
    };

    const descriptionLower = description.toLowerCase();

    // Security terms
    const securityTerms = [
      'vulnerability', 'cve', 'security', 'exploit', 'malicious', 'attack',
      'xss', 'sql injection', 'rce', 'deserialization', 'authentication',
      'authorization', 'encryption', 'hash', 'password', 'token'
    ];

    securityTerms.forEach(term => {
      if (descriptionLower.includes(term)) {
        context.securityTerms.push(term);
      }
    });

    // Upgrade terms
    const upgradeTerms = [
      'upgrade', 'update', 'version', 'dependency', 'library', 'package',
      'breaking change', 'incompatible', 'deprecated', 'removed', 'changed'
    ];

    upgradeTerms.forEach(term => {
      if (descriptionLower.includes(term)) {
        context.upgradeTerms.push(term);
      }
    });

    return context;
  }
}

// CommonJS export
module.exports = { LibraryAnalyzer };
