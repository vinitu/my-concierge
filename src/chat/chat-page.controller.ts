import {
  Controller,
  Delete,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GatewayWebRuntimeService } from './gateway-web-runtime.service';
import {
  ensureGatewayWebConversationId,
  GATEWAY_WEB_CONVERSATION_COOKIE,
  parseCookieValue,
} from './gateway-web-session';
import { GatewayWebConfigService } from './gateway-web-config.service';

interface GatewayWebBootstrap {
  conversationId: string;
  history: Array<{
    content: string;
    created_at: string;
    role: 'assistant' | 'user';
  }>;
  userId: string;
}

@Controller()
export class ChatPageController {
  constructor(
    private readonly gatewayWebRuntimeService: GatewayWebRuntimeService,
    private readonly gatewayWebConfigService: GatewayWebConfigService,
  ) {}

  @Get()
  async renderChatPage(@Req() request: Request, @Res() response: Response): Promise<void> {
    const conversationId = ensureGatewayWebConversationId(
      parseCookieValue(request.headers.cookie, GATEWAY_WEB_CONVERSATION_COOKIE),
    );
    const config = await this.gatewayWebConfigService.read();
    const userId = config.user_id;
    const conversation = await this.gatewayWebRuntimeService.readConversation(
      userId,
      conversationId,
    );
    const page = await readFile(join(process.cwd(), 'public', 'index.html'), 'utf8');
    const bootstrap: GatewayWebBootstrap = {
      conversationId,
      history: conversation.messages,
      userId,
    };

    response.cookie(GATEWAY_WEB_CONVERSATION_COOKIE, conversationId, {
      httpOnly: false,
      maxAge: 1000 * 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    response.type('html').send(this.injectBootstrap(page, bootstrap));
  }

  @Delete('conversation')
  async clearConversation(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const currentConversationId = ensureGatewayWebConversationId(
      parseCookieValue(request.headers.cookie, GATEWAY_WEB_CONVERSATION_COOKIE),
    );
    const nextConversationId = ensureGatewayWebConversationId(undefined);
    const config = await this.gatewayWebConfigService.read();

    this.gatewayWebRuntimeService.clearConversation(config.user_id, nextConversationId);

    response.cookie(GATEWAY_WEB_CONVERSATION_COOKIE, nextConversationId, {
      httpOnly: false,
      maxAge: 1000 * 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    response.status(200).json({
      cleared: true,
      conversation_id: nextConversationId,
      previous_conversation_id: currentConversationId,
      user_id: config.user_id,
    });
  }

  private injectBootstrap(template: string, bootstrap: GatewayWebBootstrap): string {
    const payload = JSON.stringify(bootstrap).replaceAll('<', '\\u003c');
    const script = `<script>window.__MYCONCIERGE_BOOTSTRAP__ = ${payload};</script>`;

    return template.includes('<!-- GATEWAY_BOOTSTRAP -->')
      ? template.replace('<!-- GATEWAY_BOOTSTRAP -->', script)
      : template.includes('</body>')
      ? template.replace('</body>', `${script}\n    </body>`)
      : `${template}\n${script}`;
  }
}
