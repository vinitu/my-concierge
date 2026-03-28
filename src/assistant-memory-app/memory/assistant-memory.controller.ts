import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type {
  AssistantProfile,
  ConversationAppendRequest,
  ConversationReadRequest,
  ConversationSearchRequest,
  ConversationSearchResponse,
  ConversationState,
  ConversationThreadListResponse,
  EpisodeWriteCandidate,
  FactWriteCandidate,
  FederatedMemorySearchRequest,
  MemoryArchiveResponse,
  MemoryCompactResponse,
  MemoryEntry,
  MemoryKind,
  MemoryReindexResponse,
  MemorySearchResponse,
  MemoryWriteRequest,
  MemoryWriteResult,
  PreferenceWriteCandidate,
  ProfileUpdateRequest,
  ProfileUpdateResponse,
  ProjectWriteCandidate,
  RuleWriteCandidate,
  RoutineWriteCandidate,
  TypedMemorySearchRequest,
} from '../../contracts/assistant-memory';
import { AssistantMemoryService } from './assistant-memory.service';

@Controller('v1')
export class AssistantMemoryController {
  constructor(private readonly assistantMemoryService: AssistantMemoryService) {}

  @Get('profile')
  getProfile(): Promise<AssistantProfile> {
    return this.assistantMemoryService.getProfile();
  }

  @Put('profile')
  updateProfile(@Body() body: ProfileUpdateRequest): Promise<ProfileUpdateResponse> {
    return this.assistantMemoryService.updateProfile(body);
  }

  @Post('search')
  @HttpCode(200)
  search(@Body() body: FederatedMemorySearchRequest): Promise<MemorySearchResponse> {
    return this.assistantMemoryService.search(body);
  }

  @Post('preferences/search')
  @HttpCode(200)
  searchPreferences(@Body() body: TypedMemorySearchRequest): Promise<MemorySearchResponse> {
    return this.assistantMemoryService.searchByKind('preference', body);
  }

  @Post('preferences/write')
  @HttpCode(200)
  writePreferences(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: MemoryWriteRequest<PreferenceWriteCandidate>,
  ): Promise<MemoryWriteResult> {
    return this.assistantMemoryService.writeByKind('preference', idempotencyKey, body.entries);
  }

  @Get('preferences/:memoryId')
  getPreference(@Param('memoryId') memoryId: string): Promise<MemoryEntry> {
    return this.assistantMemoryService.getMemoryByKind('preference', memoryId);
  }

  @Post('preferences/:memoryId/archive')
  @HttpCode(200)
  archivePreference(@Param('memoryId') memoryId: string): Promise<MemoryArchiveResponse> {
    return this.assistantMemoryService.archiveByKind('preference', memoryId);
  }

  @Post('facts/search')
  @HttpCode(200)
  searchFacts(@Body() body: TypedMemorySearchRequest): Promise<MemorySearchResponse> {
    return this.assistantMemoryService.searchByKind('fact', body);
  }

  @Post('facts/write')
  @HttpCode(200)
  writeFacts(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: MemoryWriteRequest<FactWriteCandidate>,
  ): Promise<MemoryWriteResult> {
    return this.assistantMemoryService.writeByKind('fact', idempotencyKey, body.entries);
  }

  @Get('facts/:memoryId')
  getFact(@Param('memoryId') memoryId: string): Promise<MemoryEntry> {
    return this.assistantMemoryService.getMemoryByKind('fact', memoryId);
  }

  @Post('facts/:memoryId/archive')
  @HttpCode(200)
  archiveFact(@Param('memoryId') memoryId: string): Promise<MemoryArchiveResponse> {
    return this.assistantMemoryService.archiveByKind('fact', memoryId);
  }

  @Post('routines/search')
  @HttpCode(200)
  searchRoutines(@Body() body: TypedMemorySearchRequest): Promise<MemorySearchResponse> {
    return this.assistantMemoryService.searchByKind('routine', body);
  }

  @Post('routines/write')
  @HttpCode(200)
  writeRoutines(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: MemoryWriteRequest<RoutineWriteCandidate>,
  ): Promise<MemoryWriteResult> {
    return this.assistantMemoryService.writeByKind('routine', idempotencyKey, body.entries);
  }

  @Get('routines/:memoryId')
  getRoutine(@Param('memoryId') memoryId: string): Promise<MemoryEntry> {
    return this.assistantMemoryService.getMemoryByKind('routine', memoryId);
  }

  @Post('routines/:memoryId/archive')
  @HttpCode(200)
  archiveRoutine(@Param('memoryId') memoryId: string): Promise<MemoryArchiveResponse> {
    return this.assistantMemoryService.archiveByKind('routine', memoryId);
  }

  @Post('projects/search')
  @HttpCode(200)
  searchProjects(@Body() body: TypedMemorySearchRequest): Promise<MemorySearchResponse> {
    return this.assistantMemoryService.searchByKind('project', body);
  }

  @Post('projects/write')
  @HttpCode(200)
  writeProjects(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: MemoryWriteRequest<ProjectWriteCandidate>,
  ): Promise<MemoryWriteResult> {
    return this.assistantMemoryService.writeByKind('project', idempotencyKey, body.entries);
  }

  @Get('projects/:memoryId')
  getProject(@Param('memoryId') memoryId: string): Promise<MemoryEntry> {
    return this.assistantMemoryService.getMemoryByKind('project', memoryId);
  }

  @Post('projects/:memoryId/archive')
  @HttpCode(200)
  archiveProject(@Param('memoryId') memoryId: string): Promise<MemoryArchiveResponse> {
    return this.assistantMemoryService.archiveByKind('project', memoryId);
  }

  @Post('episodes/search')
  @HttpCode(200)
  searchEpisodes(@Body() body: TypedMemorySearchRequest): Promise<MemorySearchResponse> {
    return this.assistantMemoryService.searchByKind('episode', body);
  }

  @Post('episodes/write')
  @HttpCode(200)
  writeEpisodes(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: MemoryWriteRequest<EpisodeWriteCandidate>,
  ): Promise<MemoryWriteResult> {
    return this.assistantMemoryService.writeByKind('episode', idempotencyKey, body.entries);
  }

  @Get('episodes/:memoryId')
  getEpisode(@Param('memoryId') memoryId: string): Promise<MemoryEntry> {
    return this.assistantMemoryService.getMemoryByKind('episode', memoryId);
  }

  @Post('episodes/:memoryId/archive')
  @HttpCode(200)
  archiveEpisode(@Param('memoryId') memoryId: string): Promise<MemoryArchiveResponse> {
    return this.assistantMemoryService.archiveByKind('episode', memoryId);
  }

  @Post('rules/search')
  @HttpCode(200)
  searchRules(@Body() body: TypedMemorySearchRequest): Promise<MemorySearchResponse> {
    return this.assistantMemoryService.searchByKind('rule', body);
  }

  @Post('rules/write')
  @HttpCode(200)
  writeRules(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: MemoryWriteRequest<RuleWriteCandidate>,
  ): Promise<MemoryWriteResult> {
    return this.assistantMemoryService.writeByKind('rule', idempotencyKey, body.entries);
  }

  @Get('rules/:memoryId')
  getRule(@Param('memoryId') memoryId: string): Promise<MemoryEntry> {
    return this.assistantMemoryService.getMemoryByKind('rule', memoryId);
  }

  @Post('rules/:memoryId/archive')
  @HttpCode(200)
  archiveRule(@Param('memoryId') memoryId: string): Promise<MemoryArchiveResponse> {
    return this.assistantMemoryService.archiveByKind('rule', memoryId);
  }

  @Post('compact')
  @HttpCode(200)
  compactMemories(): Promise<MemoryCompactResponse> {
    return this.assistantMemoryService.compact();
  }

  @Post('reindex')
  @HttpCode(200)
  reindexMemories(): Promise<MemoryReindexResponse> {
    return this.assistantMemoryService.reindex();
  }

  @Get('conversations')
  listConversations(): Promise<ConversationThreadListResponse> {
    return this.assistantMemoryService.listConversations();
  }

  @Post('conversations/read')
  @HttpCode(200)
  readConversation(@Body() body: ConversationReadRequest): Promise<ConversationState> {
    return this.assistantMemoryService.readConversation(body);
  }

  @Post('conversations/append')
  @HttpCode(200)
  appendConversation(@Body() body: ConversationAppendRequest): Promise<ConversationState> {
    return this.assistantMemoryService.appendConversation(body);
  }

  @Post('conversations/search')
  @HttpCode(200)
  searchConversation(
    @Body() body: ConversationSearchRequest,
  ): Promise<ConversationSearchResponse> {
    return this.assistantMemoryService.searchConversation(body);
  }

  static typePath(kind: MemoryKind): string {
    return `${kind}s`;
  }
}
