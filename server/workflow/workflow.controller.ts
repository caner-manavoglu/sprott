import { Body, Controller, Delete, Get, Inject, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { saveWorkflowSchema, type SaveWorkflowDto } from './dto/workflow.dto.ts';
import { workflowBodySchema, workflowSchema } from './workflow.schemas.ts';
import { WorkflowService } from './workflow.service.ts';

@ApiTags('Akış kuralları')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yetki reddedildi.' })
@Controller('api/projects')
export class WorkflowController {
  constructor(@Inject(WorkflowService) private service: WorkflowService) { }
  @ApiOperation({ summary: 'Projenin akış kuralları (workflow.view yetkisi); boş liste "kural yok, tüm geçişler serbest" demektir' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, schema: workflowSchema })
  @Get(':id/workflow') async index(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.index(user, id); }
  @ApiOperation({ summary: 'Akış kurallarını kaydet (ilk tanımda workflow.create, sonrasında workflow.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: workflowBodySchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 200, schema: workflowSchema })
  @Put(':id/workflow') async save(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(saveWorkflowSchema)) body: SaveWorkflowDto) { return this.service.save(user, id, body); }
  @ApiOperation({ summary: 'Akışı kapat: tüm kurallar silinir ve geçişler yeniden serbest kalır (workflow.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, schema: workflowSchema })
  @Delete(':id/workflow') async clear(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.clear(user, id); }
}
