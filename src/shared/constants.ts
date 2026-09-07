/**
 * Text input length limits (build-plan §38). Shared between the worker (server-side
 * enforcement, Phase 8's request validation) and the client (matching client-side
 * validation, Phase 9) so the two can never drift — moved here from
 * `src/worker/lib/ai/analyzer.ts` (Phase 3, which re-exports these for backward
 * compatibility with existing worker imports) when Phase 9 needed the same values
 * client-side.
 */
export const CV_MIN_LENGTH = 200;
export const CV_MAX_LENGTH = 20_000;
export const JOB_DESCRIPTION_MAX_LENGTH = 10_000;
