# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HYDIE (How's Your Development Involvement and Engagement) is a SvelteKit application that tracks and visualizes GitHub code review activity. It fetches PR review data from a configured GitHub repository via the Octokit API and displays it in a table showing review counts per user over a 14-day period.

## Commands

- `npm run dev` - Start development server (http://localhost:5173)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run check` - TypeScript type checking with svelte-check
- `npm run lint` - Run Prettier and ESLint
- `npm run format` - Format code with Prettier
- `npm run test:unit` - Run Vitest unit tests (interactive watch mode)
- `npm run test:unit -- --run` - Run unit tests once
- `npm run test:e2e` - Run Playwright e2e tests (builds app first)
- `npm run test` - Run all tests (unit + e2e)

## Architecture

### Tech Stack

- SvelteKit 2 with Svelte 5 (uses `$props()`, `$state()` runes syntax)
- Node adapter for server-side deployment
- Vitest with separate workspaces for client (jsdom) and server (node) tests
- Playwright for e2e testing

### Key Directories

- `src/lib/services/` - Server-side services (CodeReviewsService handles GitHub API calls)
- `src/lib/components/` - Reusable Svelte components
- `src/lib/utils/` - Utilities (ApiError, ApiResponse for standardized error handling)
- `src/routes/api/` - API endpoints
- `e2e/` - Playwright tests

### Data Flow

1. `CodeReviewsService` fetches PR reviews from GitHub using Octokit
2. Data is cached in `data.json` at project root with sync status tracking
3. Main page loads data via `+page.server.ts` and displays review counts per user/date
4. Sync triggered via POST to `/api/github/code-reviews/sync`

### Environment Variables (Required)

- `GITHUB_OWNER` - Repository owner (user or org)
- `GITHUB_REPO` - Repository name
- `GITHUB_TOKEN` - Personal access token with PR read permissions

### Testing Conventions

- Client-side Svelte tests: `*.svelte.test.ts` or `*.svelte.spec.ts`
- Server-side tests: `*.test.ts` or `*.spec.ts` (excluding `.svelte.` pattern)
- E2E tests go in `e2e/` directory
