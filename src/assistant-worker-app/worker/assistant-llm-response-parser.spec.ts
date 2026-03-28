import {
  parseAssistantLlmPlanResult,
  parseAssistantLlmResult,
} from './assistant-llm-response-parser';

describe('assistant-llm-response-parser', () => {
  it('accepts synthesis payloads that use reply instead of message', () => {
    expect(
      parseAssistantLlmResult(
        JSON.stringify({
          context: '',
          reply: 'Привет!',
        }),
      ),
    ).toEqual({
      context: '',
      memory_writes: [],
      message: 'Привет!',
      tool_observations: [],
    });
  });

  it('accepts response instead of message', () => {
    expect(
      parseAssistantLlmResult(
        JSON.stringify({
          context: 'User greeted in Russian.',
          response: 'Привет!',
        }),
      ),
    ).toEqual({
      context: 'User greeted in Russian.',
      memory_writes: [],
      message: 'Привет!',
      tool_observations: [],
    });
  });

  it('extracts json object when model wraps it with extra text', () => {
    expect(
      parseAssistantLlmResult(
        'Here is the result:\n{"message":"Привет!","context":""}\nThank you.',
      ),
    ).toEqual({
      context: '',
      memory_writes: [],
      message: 'Привет!',
      tool_observations: [],
    });
  });

  it('treats bare final payload as a valid planning result', () => {
    expect(
      parseAssistantLlmPlanResult(
        JSON.stringify({
          message: 'Привет!',
          context: '',
        }),
      ),
    ).toEqual({
      final: {
        context: '',
        memory_writes: [],
        message: 'Привет!',
        tool_observations: [],
      },
      tool_call: null,
    });
  });
});
