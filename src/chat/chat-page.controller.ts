import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GatewayWebRuntimeService } from './gateway-web-runtime.service';
import {
  ensureGatewayWebSessionId,
  GATEWAY_WEB_SESSION_COOKIE,
  parseCookieValue,
} from './gateway-web-session';

interface GatewayWebBootstrap {
  history: Array<{
    content: string;
    created_at: string;
    role: 'assistant' | 'user';
  }>;
  sessionId: string;
}

@Controller()
export class ChatPageController {
  constructor(private readonly gatewayWebRuntimeService: GatewayWebRuntimeService) {}

  @Get()
  async renderChatPage(@Req() request: Request, @Res() response: Response): Promise<void> {
    const sessionId = ensureGatewayWebSessionId(
      parseCookieValue(request.headers.cookie, GATEWAY_WEB_SESSION_COOKIE),
    );
    const conversation = await this.gatewayWebRuntimeService.readConversation(sessionId);
    const page = await readFile(join(process.cwd(), 'public', 'index.html'), 'utf8');
    const bootstrap: GatewayWebBootstrap = {
      history: conversation.messages,
      sessionId,
    };

    response.cookie(GATEWAY_WEB_SESSION_COOKIE, sessionId, {
      httpOnly: false,
      maxAge: 1000 * 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    response.type('html').send(this.injectBootstrap(page, bootstrap));
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
