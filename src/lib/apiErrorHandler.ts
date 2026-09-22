import { AIUnavailableError } from '@/services/ai';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export function handleAIError(e: unknown): NextResponse {
  if (e instanceof AIUnavailableError) {
    return NextResponse.json(
      {
        status: 'ai_unavailable',
        retryAt: e.retryAt,
        message: "AI generation is temporarily unavailable. We'll retry automatically.",
      },
      { status: 503 },
    );
  }
  logger.error('api', 'Unexpected error', { error: e });
  return NextResponse.json(
    { status: 'error', message: 'Something went wrong on our end.' },
    { status: 500 },
  );
}
