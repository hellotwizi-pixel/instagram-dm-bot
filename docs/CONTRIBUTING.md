# Contributing Guide

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables:
   - `IG_PAGE_ACCESS_TOKEN`: Instagram page access token
   - `IG_VERIFY_TOKEN`: Webhook verification token
   - `GOOGLE_SHEETS_ID`: (Optional) Google Sheets ID for keyword management

## Running Locally

```bash
npm run dev
```

This starts Vercel dev server at `http://localhost:3000`

## Testing

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui
```

## Building

```bash
npm run build
```

## Code Style

- TypeScript strict mode enabled
- Use Prettier for formatting: `npm run format` (if added)
- Follow existing code patterns

## Commit Guidelines

- Use clear, descriptive commit messages
- Reference issue numbers when applicable
- Write tests for new features

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Add/update tests
4. Ensure all tests pass
5. Submit PR with description

## Deployment

```bash
npm run deploy
```

This deploys to Vercel production.
