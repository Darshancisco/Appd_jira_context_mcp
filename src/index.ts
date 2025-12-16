#!/usr/bin/env node

import dotenv from 'dotenv';
import { JiraMcpServer } from './server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Load environment variables
dotenv.config();

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 3000;

// Validate required environment variables
if (!JIRA_BASE_URL) {
  console.error('❌ JIRA_BASE_URL environment variable is required');
  process.exit(1);
}

if (!JIRA_USERNAME) {
  console.error('❌ JIRA_USERNAME environment variable is required');
  process.exit(1);
}

if (!JIRA_API_TOKEN) {
  console.error('❌ JIRA_API_TOKEN environment variable is required');
  process.exit(1);
}

// Optional database configuration
const dbConfig = process.env.DB_HOST ? {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true",
} : undefined;

if (dbConfig) {
  console.error(`[DEBUG] 🗄️  Database configuration found: ${dbConfig.host}:${dbConfig.port}`);
  if (dbConfig.database) {
    console.error(`[DEBUG] Default database: ${dbConfig.database}`);
  }
}

// Initialize the server
const server = new JiraMcpServer(JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN, dbConfig);

// Start the appropriate transport based on NODE_ENV
async function start() {
  console.error('[DEBUG] Starting Jira Resolution MCP server...');

  // Default to stdio mode (for Cursor/MCP clients)
  // Only use HTTP mode if explicitly set with NODE_ENV=http
  if (process.env.NODE_ENV === 'http') {
    console.error(`[DEBUG] 🌐 Starting HTTP server on port ${HTTP_PORT}`);
    await server.startHttpServer(HTTP_PORT);
  } else {
    console.error('[DEBUG] 🔌 Using stdio transport (MCP mode)');
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

start().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}); 