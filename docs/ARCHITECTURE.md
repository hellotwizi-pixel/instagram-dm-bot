# Architecture

## Project Structure

```
instagram-dm-bot/
├── api/                  # Vercel API routes
│   └── webhook.ts       # Instagram webhook endpoint
├── src/
│   ├── config/          # Configuration files
│   ├── constants/       # Application constants
│   ├── handlers/        # Event handlers
│   ├── middleware/      # Middleware functions
│   ├── services/        # Business logic services
│   │   ├── instagramApi.ts
│   │   ├── googleSheetsLoader.ts
│   │   └── keywordMatcher.ts
│   ├── utils/           # Utility functions
│   ├── __tests__/       # Unit tests
│   └── types.ts         # TypeScript type definitions
├── docs/                # Documentation
├── scripts/             # Helper scripts
├── .env                 # Environment variables
├── package.json
├── tsconfig.json
├── vercel.json
└── vitest.config.ts
```

## Main Flow

1. **Webhook Reception** (`api/webhook.ts`)
   - Receives Instagram webhook events
   - Validates webhook token

2. **Event Processing** (`handlers/webhookHandler.ts`)
   - Processes incoming messages
   - Extracts comment text

3. **Keyword Matching** (`services/keywordMatcher.ts`)
   - Loads keywords from Google Sheets or config
   - Matches comment text against keywords
   - Caches keywords for 5 seconds

4. **DM Sending** (`services/instagramApi.ts`)
   - Sends private reply (DM) to commenter
   - Uses Instagram Graph API

## Dependencies

- **TypeScript**: Type safety
- **Vercel**: Hosting and serverless functions
- **Instagram Graph API**: For DM functionality
- **Google Sheets API**: For dynamic keyword management
- **Vitest**: Testing framework
