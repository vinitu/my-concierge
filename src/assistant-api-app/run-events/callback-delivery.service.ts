import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { RunEvent } from "../../contracts/assistant-transport";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

@Injectable()
export class CallbackDeliveryService {
  constructor(private readonly configService: ConfigService) {}

  async deliver(event: RunEvent): Promise<boolean> {
    const baseUrl = this.baseUrlForDirection(event.direction);
    if (event.eventType === "run.started") {
      return true;
    }

    if (event.eventType.startsWith("memory.")) {
      return this.send(
        this.callbackUrl(baseUrl, "event", event.conversationId),
        {
          conversation_id: event.conversationId,
          direction: event.direction,
          message: this.messageForMemoryEvent(event),
          payload: event.payload,
          type: event.eventType,
          user_id: event.userId,
        },
      );
    }

    if (event.eventType === "run.thinking") {
      return this.send(
        this.callbackUrl(baseUrl, "thinking", event.conversationId),
        {
          conversation_id: event.conversationId,
          direction: event.direction,
          seconds: Number(event.payload.seconds ?? 1),
          user_id: event.userId,
        },
      );
    }

    const message =
      typeof event.payload.message === "string" &&
      event.payload.message.trim().length > 0
        ? event.payload.message
        : event.eventType === "run.failed"
          ? "The assistant run failed."
          : "";

    return this.send(
      this.callbackUrl(baseUrl, "response", event.conversationId),
      {
        conversation_id: event.conversationId,
        direction: event.direction,
        error: event.eventType === "run.failed",
        message,
        user_id: event.userId,
      },
    );
  }

  private async send(
    url: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return response.ok;
  }

  private callbackUrl(
    baseUrl: string,
    kind: "event" | "response" | "thinking",
    conversationId: string,
  ): string {
    return `${trimTrailingSlash(baseUrl)}/${kind}/${encodeURIComponent(conversationId)}`;
  }

  private messageForMemoryEvent(event: RunEvent): string {
    const payloadMessage =
      typeof event.payload?.message === "string" ? event.payload.message.trim() : "";
    if (payloadMessage.length > 0) {
      return payloadMessage;
    }

    const parts = event.eventType.split(".");
    const kind = parts.length >= 3 ? parts[1] : "memory";
    const action = parts.length >= 3 ? parts[2] : "event";
    return `Memory ${kind} ${action}.`;
  }

  private baseUrlForDirection(direction: string): string {
    const normalized = direction.trim().toLowerCase();
    if (normalized === "email") {
      return this.configService.get<string>(
        "GATEWAY_EMAIL_CALLBACK_URL",
        "http://gateway-email:3000",
      );
    }
    if (normalized === "telegram") {
      return this.configService.get<string>(
        "GATEWAY_TELEGRAM_CALLBACK_URL",
        "http://gateway-telegram:3000",
      );
    }
    return this.configService.get<string>(
      "GATEWAY_WEB_CALLBACK_URL",
      "http://gateway-web:3000",
    );
  }
}
