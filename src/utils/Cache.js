class Cache {
  constructor(defaultTTL = 300000) { // 5 minutes default
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  generateKey(...parts) {
    return parts.filter(p => p !== undefined && p !== null).join(':');
  }

  set(key, value, ttl = this.defaultTTL) {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });
    this.stats.sets++;
    
    // Clean up expired entries periodically
    if (this.cache.size % 100 === 0) {
      this.cleanup();
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  clear() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.debug(`🧹 Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size
    };
  }

  // Specific cache methods for different data types
  
  cacheLibraryInfo(libraryName, language, info, ttl = 3600000) { // 1 hour
    const key = this.generateKey('library', libraryName, language);
    this.set(key, info, ttl);
  }

  getLibraryInfo(libraryName, language) {
    const key = this.generateKey('library', libraryName, language);
    return this.get(key);
  }

  cacheJiraTicket(ticketNumber, ticketData, ttl = 1800000) { // 30 minutes
    const key = this.generateKey('jira', ticketNumber);
    this.set(key, ticketData, ttl);
  }

  getJiraTicket(ticketNumber) {
    const key = this.generateKey('jira', ticketNumber);
    return this.get(key);
  }

  cacheGitHubReleases(repoPath, releases, ttl = 3600000) { // 1 hour
    const key = this.generateKey('github', 'releases', repoPath);
    this.set(key, releases, ttl);
  }

  getGitHubReleases(repoPath) {
    const key = this.generateKey('github', 'releases', repoPath);
    return this.get(key);
  }

  cacheRepositoryAnalysis(workingDirectory, analysis, ttl = 1800000) { // 30 minutes
    const key = this.generateKey('repo', 'analysis', workingDirectory);
    this.set(key, analysis, ttl);
  }

  getRepositoryAnalysis(workingDirectory) {
    const key = this.generateKey('repo', 'analysis', workingDirectory);
    return this.get(key);
  }

  // Invalidation methods
  invalidateLibrary(libraryName, language) {
    const key = this.generateKey('library', libraryName, language);
    return this.delete(key);
  }

  invalidateJiraTicket(ticketNumber) {
    const key = this.generateKey('jira', ticketNumber);
    return this.delete(key);
  }

  invalidateRepository(workingDirectory) {
    const key = this.generateKey('repo', 'analysis', workingDirectory);
    return this.delete(key);
  }

  // Bulk operations
  invalidatePattern(pattern) {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
}

// Global cache instance
const globalCache = new Cache();

// CommonJS export
module.exports = { Cache, globalCache };
