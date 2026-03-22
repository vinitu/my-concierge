import { Injectable } from '@nestjs/common';

@Injectable()
export class CallbackDeliveryService {
  async send(callbackUrl: string, message: string): Promise<void> {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`callback returned ${response.status}`);
    }
  }
}

