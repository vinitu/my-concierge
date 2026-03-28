import { Injectable } from '@nestjs/common';
import { AssistantRuntimeError } from './assistant-runtime-error';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

interface BraveWebSearchResponse {
  web?: {
    results?: Array<{
      description?: string;
      profile?: {
        long_name?: string;
      };
      title?: string;
      url?: string;
    }>;
  };
}

@Injectable()
export class BraveSearchService {
  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
  ) {}

  async search(query: string, requestedCount?: number): Promise<{
    query: string;
    results: Array<{
      snippet: string;
      title: string;
      url: string;
    }>;
  }> {
    const config = await this.assistantWorkerConfigService.read();
    const apiKey = config.brave_api_key.trim();

    if (!apiKey) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        'Brave API key is not configured in assistant-worker settings',
      );
    }

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        'Brave web search requires a non-empty query',
      );
    }

    const count = this.normalizeCount(requestedCount);
    const searchUrl = new URL('/res/v1/web/search', config.brave_base_url);
    searchUrl.searchParams.set('q', trimmedQuery);
    searchUrl.searchParams.set('count', String(count));

    try {
      const response = await fetch(searchUrl, {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
        method: 'GET',
        signal: AbortSignal.timeout(config.brave_timeout_ms),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AssistantRuntimeError(
          'TOOL_ERROR',
          `Brave web search returned ${response.status}: ${body}`,
        );
      }

      const payload = (await response.json()) as BraveWebSearchResponse;
      const results = (payload.web?.results ?? [])
        .filter((entry) => typeof entry.url === 'string' && entry.url.trim())
        .map((entry) => ({
          snippet: entry.description?.trim() ?? '',
          title:
            entry.title?.trim() ??
            entry.profile?.long_name?.trim() ??
            entry.url!.trim(),
          url: entry.url!.trim(),
        }));

      return {
        query: trimmedQuery,
        results,
      };
    } catch (error) {
      if (error instanceof AssistantRuntimeError) {
        throw error;
      }

      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        'Brave web search request failed',
        error,
      );
    }
  }

  private normalizeCount(value: unknown): number {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return Math.min(10, Math.max(1, value));
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value.trim(), 10);

      if (Number.isInteger(parsed)) {
        return Math.min(10, Math.max(1, parsed));
      }
    }

    return 5;
  }
}
