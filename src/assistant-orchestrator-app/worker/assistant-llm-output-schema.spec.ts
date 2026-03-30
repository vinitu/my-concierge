import {
  assistantPlanningOutputParser,
  assistantSynthesisOutputParser,
} from './assistant-llm-output-schema';

describe('assistant-llm-output-schema', () => {
  it('parses planning output in unified type contract', async () => {
    await expect(
      assistantPlanningOutputParser.parse(
        JSON.stringify({
          context: 'User said "привет" in Russian.',
          message: 'Привет!',
          type: 'final',
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

  it('rejects unsupported tool names in planning output', async () => {
    await expect(
      assistantPlanningOutputParser.parse(
        JSON.stringify({
          tool_arguments: {},
          tool_name: 'legacy_fact_search',
          type: 'tool_call',
        }),
      ),
    ).rejects.toThrow('Invalid enum value');
  });
});
