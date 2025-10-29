import * as Sentry from '@sentry/nextjs';
      import type { Metadata } from 'next';

      // Add or edit your "generateMetadata" to include the Sentry trace data:
      export function generateMetadata(): Metadata {
        return {
          // ... your existing metadata
          other: {
            ...Sentry.getTraceData()
          }
        };
      }