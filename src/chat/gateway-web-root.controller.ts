import {
  Body,
  Controller,
  Get,
  Put,
} from '@nestjs/common';
import {
  GatewayWebConfigService,
  type UpdateGatewayWebConfigBody,
} from './gateway-web-config.service';

@Controller()
export class GatewayWebRootController {
  constructor(private readonly gatewayWebConfigService: GatewayWebConfigService) {}

  @Get('config')
  async getConfig() {
    return this.gatewayWebConfigService.read();
  }

  @Put('config')
  async updateConfig(@Body() body: UpdateGatewayWebConfigBody) {
    return this.gatewayWebConfigService.write(body);
  }
}
