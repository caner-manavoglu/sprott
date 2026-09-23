import { Body, Controller, Delete, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, ParseId } from '../common/auth.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import type { User } from '../common/fields.ts';
import { issueTokenSchema, type IssueTokenDto } from './dto/mcp.dto.ts';
import { McpService } from './mcp.service.ts';

@Controller('api/mcp')
export class McpController {
  constructor(@Inject(McpService) private service: McpService) { }
  @Get('token') async status(@CurrentUser() user: User) { return this.service.status(user); }
  @Get('connections') async connections(@CurrentUser() user: User) { return this.service.connections(user); }
  @Delete('connections/:id') async revokeOne(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.revokeOne(user, id); }
  @Post('token') async issue(@CurrentUser() user: User, @Body(new DtoPipe(issueTokenSchema)) body: IssueTokenDto) { return this.service.issue(user, body); }
  @Delete('token') async revoke(@CurrentUser() user: User) { return this.service.revoke(user); }
  // MCP istemcileri oturum çereziyle değil, kendi bearer token'larıyla doğrulanır.
  @Post('tools') async execute(@Req() req: Request, @Body() body: unknown) { return this.service.execute(req, body); }
  @Post('http') async http(@Req() req: Request, @Res() res: Response, @Body() body: unknown) { return this.service.http(req, res, body); }
  @Get('http') unsupportedGet(@Res() res: Response) { return this.service.unsupportedGet(res); }
  @Delete('http') unsupportedDelete(@Res() res: Response) { return this.service.unsupportedDelete(res); }
}
