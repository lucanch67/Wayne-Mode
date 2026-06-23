// Vercel Web Analytics initialization
// This script initializes Vercel Analytics for the Wayne Mode dashboard

import { inject } from './node_modules/@vercel/analytics/dist/index.mjs';

// Initialize analytics with production mode
inject({
  mode: 'production',
  debug: false
});
