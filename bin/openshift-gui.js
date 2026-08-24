#!/usr/bin/env node

import('../dist/index.js').catch((err) => {
  console.error('Failed to run OpenShift CLI TUI:', err);
  process.exit(1);
});
