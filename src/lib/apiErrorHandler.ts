import { AIUnavailableError } from '@/services/ai';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export function aiUnavailableResponse(retryAt: string | undefined): NextResponse {
  return NextResponse.json(
    {
      status: 'ai_unavailable',
      retryAt,
      message: "AI generation is temporarily unavailable. We'll retry automatically.",
    },
    { status: 503 },
  );
}

export function handleAIError(e: unknown): NextResponse {
  if (e instanceof AIUnavailableError) return aiUnavailableResponse(e.retryAt);
  logger.error('api', 'Unexpected error', { error: e });
  return NextResponse.json(
    { status: 'error', message: 'Something went wrong on our end.' },
    { status: 500 },
  );
}
