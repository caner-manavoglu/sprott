import { Body, Controller, Delete, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { type AuthRequest } from '../common/auth.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { issueTokenSchema, type IssueTokenDto } from './dto/mcp.dto.ts';
import { McpService } from './mcp.service.ts';

@Controller('api/mcp')
export class McpController {
  constructor(@Inject(McpService) private service: McpService) { }
  @Get('token') async status(@Req() req: AuthRequest) { return this.service.status(req); }
  @Get('connections') async connections(@Req() req: AuthRequest) { return this.service.connections(req); }
  @Delete('connections/:id') async revokeOne(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.revokeOne(req, id); }
  @Post('token') async issue(@Req() req: AuthRequest, @Body(new DtoPipe(issueTokenSchema)) body: IssueTokenDto = {}) { return this.service.issue(req, body); }
  @Delete('token') async revoke(@Req() req: AuthRequest) { return this.service.revoke(req); }
  @Post('tools') async execute(@Req() req: AuthRequest, @Body() body: unknown) { return this.service.execute(req, body); }
  @Post('http') async http(@Req() req: AuthRequest, @Res() res: Response, @Body() body: unknown) { return this.service.http(req, res, body); }
  @Get('http') unsupportedGet(@Res() res: Response) { return this.service.unsupportedGet(res); }
  @Delete('http') unsupportedDelete(@Res() res: Response) { return this.service.unsupportedDelete(res); }
}
