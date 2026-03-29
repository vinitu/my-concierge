import { Body, Controller, Get, Put } from "@nestjs/common";
import type {
  AssistantMemoryConfig,
  UpdateAssistantMemoryConfigBody,
} from "../contracts/assistant-memory";
import { AssistantMemoryConfigService } from "./assistant-memory-config.service";

@Controller()
export class AssistantMemoryConfigController {
  constructor(
    private readonly assistantMemoryConfigService: AssistantMemoryConfigService,
  ) {}

  @Get("config")
  getConfig(): Promise<AssistantMemoryConfig> {
    return this.assistantMemoryConfigService.read();
  }

  @Put("config")
  updateConfig(
    @Body() body: UpdateAssistantMemoryConfigBody,
  ): Promise<AssistantMemoryConfig> {
    return this.assistantMemoryConfigService.write(body);
  }
}
