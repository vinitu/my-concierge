import {
  assistantPlanningOutputParser,
  assistantSynthesisOutputParser,
} from './assistant-llm-output-schema';

describe('assistant-llm-output-schema', () => {
  it('parses planning final output that uses response field', async () => {
    await expect(
      assistantPlanningOutputParser.parse(
        JSON.stringify({
          final: {
            context: 'User said "привет" in Russian.',
            response: 'Привет!',
          },
        }),
      ),
    ).resolves.toEqual({
      final: {
        context: 'User said "привет" in Russian.',
        memory_writes: [],
        message: 'Привет!',
        tool_observations: [],
      },
      tool_call: null,
    });
  });

  it('parses synthesis output that uses reply field', async () => {
    await expect(
      assistantSynthesisOutputParser.parse(
        JSON.stringify({
          context: '',
          reply: 'Привет!',
        }),
      ),
    ).resolves.toEqual({
      context: '',
      memory_writes: [],
      message: 'Привет!',
      tool_observations: [],
    });
  });
});
