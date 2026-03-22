import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantWorkerConversationService } from './assistant-worker-conversation.service';

describe('AssistantWorkerConversationService', () => {
  it('stores the conversation in runtime/conversations/{direction}/{chat}/{contact}.json', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-conversation-'));
    const service = new AssistantWorkerConversationService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, provider: 'xai' }),
      } as never,
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await service.appendExchange(
      {
        callback_url: 'http://example.test/callback',
        chat: 'direct',
        contact: 'alex',
        direction: 'api',
        message: 'hello',
      },
      {
        context: '',
        message: 'hi there',
      },
    );

    const stored = await readFile(
      join(datadir, 'conversations', 'api', 'direct', 'alex.json'),
      'utf8',
    );

    expect(stored).toContain('"context": ""');
    expect(stored).toContain('"role": "user"');
    expect(stored).toContain('"role": "assistant"');
  });

  it('keeps the previous context when the model returns an empty context', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-conversation-'));
    await mkdir(join(datadir, 'conversations', 'api', 'direct'), { recursive: true });
    await writeFile(
      join(datadir, 'conversations', 'api', 'direct', 'alex.json'),
      JSON.stringify(
        {
          chat: 'direct',
          contact: 'alex',
          context: 'The conversation is in Russian. The active topic is Elon Musk.',
          direction: 'api',
          messages: [],
          updated_at: '2026-03-22T10:01:00.000Z',
        },
        null,
        2,
      ),
      'utf8',
    );
    const service = new AssistantWorkerConversationService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, provider: 'xai' }),
      } as never,
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    const result = await service.appendExchange(
      {
        callback_url: 'http://example.test/callback',
        chat: 'direct',
        contact: 'alex',
        direction: 'api',
        message: 'Что он сделал?',
      },
      {
        context: '   ',
        message: 'Он основал Tesla и SpaceX.',
      },
    );

    expect(result.context).toBe('The conversation is in Russian. The active topic is Elon Musk.');
  });

  it('keeps only the configured recent messages and stores the returned context', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-conversation-'));
    await mkdir(join(datadir, 'conversations', 'api', 'direct'), { recursive: true });
    await writeFile(
      join(datadir, 'conversations', 'api', 'direct', 'alex.json'),
      JSON.stringify(
        {
          chat: 'direct',
          contact: 'alex',
          context: 'Alex asked about dinner planning.',
          direction: 'api',
          messages: [
            {
              content: 'What is for dinner?',
              created_at: '2026-03-22T10:00:00.000Z',
              role: 'user',
            },
            {
              content: 'Pasta is planned.',
              created_at: '2026-03-22T10:00:05.000Z',
              role: 'assistant',
            },
            {
              content: 'Add salad too.',
              created_at: '2026-03-22T10:01:00.000Z',
              role: 'user',
            },
          ],
          updated_at: '2026-03-22T10:01:00.000Z',
        },
        null,
        2,
      ),
      'utf8',
    );
    const service = new AssistantWorkerConversationService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, provider: 'xai' }),
      } as never,
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    const result = await service.appendExchange(
      {
        callback_url: 'http://example.test/callback',
        chat: 'direct',
        contact: 'alex',
        direction: 'api',
        message: 'What time should dinner be ready?',
      },
      {
        context: 'Alex asked about dinner planning. Salad was requested for dinner.',
        message: 'Dinner should be ready at 19:00.',
      },
    );

    expect(result.context).toBe(
      'Alex asked about dinner planning. Salad was requested for dinner.',
    );
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]?.content).toBe('Add salad too.');
    expect(result.messages[1]?.content).toBe('What time should dinner be ready?');
    expect(result.messages[2]?.content).toBe('Dinner should be ready at 19:00.');
  });

});
