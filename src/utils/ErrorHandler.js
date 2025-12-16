class ErrorHandler {
  static createError(type, message, details = {}) {
    const error = new Error(message);
    error.type = type;
    error.details = details;
    error.timestamp = new Date().toISOString();
    return error;
  }

  static handleApiError(error, context = '') {
    console.error(`API Error in ${context}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      timestamp: new Date().toISOString()
    });

    if (error.response?.status === 401) {
      return this.createError('AUTHENTICATION_ERROR', 
        'Authentication failed. Please check your credentials.', 
        { status: 401, context });
    }

    if (error.response?.status === 403) {
      return this.createError('AUTHORIZATION_ERROR', 
        'Access denied. Please check your permissions.', 
        { status: 403, context });
    }

    if (error.response?.status === 404) {
      return this.createError('NOT_FOUND_ERROR', 
        'Resource not found.', 
        { status: 404, context });
    }

    if (error.response?.status >= 500) {
      return this.createError('SERVER_ERROR', 
        'Server error occurred. Please try again later.', 
        { status: error.response.status, context });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return this.createError('CONNECTION_ERROR', 
        'Connection failed. Please check your network and URL.', 
        { code: error.code, context });
    }

    if (error.code === 'ETIMEDOUT') {
      return this.createError('TIMEOUT_ERROR', 
        'Request timed out. Please try again.', 
        { code: error.code, context });
    }

    return this.createError('UNKNOWN_ERROR', 
      `Unexpected error: ${error.message}`, 
      { originalError: error.message, context });
  }

  static validateInput(input, schema) {
    const errors = [];

    Object.entries(schema).forEach(([field, rules]) => {
      const value = input[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        return;
      }

      if (value !== undefined && value !== null) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${field} must be of type ${rules.type}`);
        }

        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }

        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must be no more than ${rules.maxLength} characters`);
        }

        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${field} format is invalid`);
        }

        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static sanitizeInput(input) {
    if (typeof input === 'string') {
      return input
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .slice(0, 10000); // Limit length
    }

    if (typeof input === 'object' && input !== null) {
      const sanitized = {};
      Object.entries(input).forEach(([key, value]) => {
        sanitized[key] = this.sanitizeInput(value);
      });
      return sanitized;
    }

    return input;
  }

  static formatErrorResponse(error) {
    return {
      error: true,
      type: error.type || 'UNKNOWN_ERROR',
      message: error.message,
      details: error.details || {},
      timestamp: error.timestamp || new Date().toISOString(),
      suggestions: this.getSuggestions(error.type)
    };
  }

  static getSuggestions(errorType) {
    const suggestions = {
      'AUTHENTICATION_ERROR': [
        'Verify your username and password/token',
        'Check if your account is not locked',
        'Ensure you have the correct permissions'
      ],
      'CONNECTION_ERROR': [
        'Check your internet connection',
        'Verify the server URL is correct',
        'Check if the server is running'
      ],
      'TIMEOUT_ERROR': [
        'Try again in a few moments',
        'Check your network connection',
        'The server might be experiencing high load'
      ],
      'NOT_FOUND_ERROR': [
        'Verify the resource identifier is correct',
        'Check if the resource exists',
        'Ensure you have access to the resource'
      ]
    };

    return suggestions[errorType] || [
      'Try the operation again',
      'Check the server logs for more details',
      'Contact support if the issue persists'
    ];
  }
}

// CommonJS export
module.exports = { ErrorHandler };
