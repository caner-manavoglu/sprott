import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller.ts';
import { McpService } from './mcp.service.ts';

@Module({ controllers: [McpController], providers: [McpService] })
export class McpModule { }
