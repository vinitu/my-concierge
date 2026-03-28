import {
  All,
  Controller,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DashboardServiceRegistryService } from './dashboard-service-registry.service';
import { DashboardMetricsService } from './observability/dashboard-metrics.service';

@Controller()
export class DashboardProxyController {
  constructor(
    private readonly dashboardMetricsService: DashboardMetricsService,
    private readonly dashboardServiceRegistryService: DashboardServiceRegistryService,
  ) {}

  @All('assistant-api')
  async proxyAssistantApiRoot(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.proxy('assistant-api', '', request, response);
  }

  @All('assistant-api/*path')
  async proxyAssistantApiPath(
    @Param('path') path: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.proxy('assistant-api', this.normalizePath(path), request, response);
  }

  @All('assistant-worker')
  async proxyAssistantWorkerRoot(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.proxy('assistant-worker', '', request, response);
  }

  @All('assistant-worker/*path')
  async proxyAssistantWorkerPath(
    @Param('path') path: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.proxy('assistant-worker', this.normalizePath(path), request, response);
  }

  @All('assistant-memory')
  async proxyAssistantMemoryRoot(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.proxy('assistant-memory', '', request, response);
  }

  @All('assistant-memory/*path')
  async proxyAssistantMemoryPath(
    @Param('path') path: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.proxy('assistant-memory', this.normalizePath(path), request, response);
  }

  @All('gateway-telegram')
  async proxyGatewayTelegramRoot(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.proxy('gateway-telegram', '', request, response);
  }

  @All('gateway-telegram/*path')
  async proxyGatewayTelegramPath(
    @Param('path') path: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.proxy('gateway-telegram', this.normalizePath(path), request, response);
  }

  @All('gateway-email')
  async proxyGatewayEmailRoot(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.proxy('gateway-email', '', request, response);
  }

  @All('gateway-email/*path')
  async proxyGatewayEmailPath(
    @Param('path') path: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.proxy('gateway-email', this.normalizePath(path), request, response);
  }

  @All('gateway-web')
  async proxyGatewayWebRoot(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.proxy('gateway-web', '', request, response);
  }

  @All('gateway-web/*path')
  async proxyGatewayWebPath(
    @Param('path') path: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.proxy('gateway-web', this.normalizePath(path), request, response);
  }

  private async proxy(
    serviceKey: string,
    path: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const definition = this.dashboardServiceRegistryService.findByKey(serviceKey);

    if (!definition || definition.kind !== 'application' || !definition.upstream_url) {
      response.status(404).json({
        message: `Unknown dashboard service prefix: ${serviceKey}`,
      });
      return;
    }

    const search = this.extractSearch(request.originalUrl);
    const normalizedPath = path ? `/${path}` : '';
    const target = `${definition.upstream_url}${normalizedPath}${search}`;
    const method = request.method.toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method);

    const upstream = await fetch(target, {
      body: hasBody ? JSON.stringify(request.body ?? {}) : undefined,
      headers: this.forwardHeaders(request),
      method,
      redirect: 'manual',
    }).catch(() => null);

    if (!upstream) {
      response.status(502).json({
        message: `Failed to proxy request to ${serviceKey}`,
        target,
      });
      return;
    }

    response.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') {
        return;
      }
      response.setHeader(key, value);
    });

    const contentType = upstream.headers.get('content-type') ?? '';

    if (contentType.includes('text/html')) {
      const html = await upstream.text();
      response.send(this.rewriteHtmlForPrefix(html, serviceKey));
      return;
    }

    if (contentType.includes('application/json')) {
      response.send(await upstream.text());
      return;
    }

    response.send(Buffer.from(await upstream.arrayBuffer()));
  }

  private extractSearch(originalUrl: string): string {
    const index = originalUrl.indexOf('?');

    if (index < 0) {
      return '';
    }

    return originalUrl.slice(index);
  }

  private forwardHeaders(request: Request): Record<string, string> {
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(request.headers)) {
      if (
        key.toLowerCase() === 'host' ||
        key.toLowerCase() === 'content-length' ||
        typeof value !== 'string'
      ) {
        continue;
      }

      headers[key] = value;
    }

    if (!headers['content-type'] && request.body && Object.keys(request.body).length > 0) {
      headers['content-type'] = 'application/json';
    }

    return headers;
  }

  private rewriteHtmlForPrefix(html: string, serviceKey: string): string {
    const prefix = `/${serviceKey}`;
    this.dashboardMetricsService.recordEndpointRequest('/:service/*');

    return html
      .replaceAll('href="/', `href="${prefix}/`)
      .replaceAll("href='/", `href='${prefix}/`)
      .replaceAll('src="/', `src="${prefix}/`)
      .replaceAll("src='/", `src='${prefix}/`)
      .replaceAll('action="/', `action="${prefix}/`)
      .replaceAll("action='/", `action='${prefix}/`)
      .replaceAll("fetch('/", `fetch('${prefix}/`)
      .replaceAll('fetch("/', `fetch("${prefix}/`);
  }

  private normalizePath(path: string | string[]): string {
    if (Array.isArray(path)) {
      return path.join('/');
    }

    return path;
  }
}
