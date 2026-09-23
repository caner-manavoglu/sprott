import { Body, Controller, Delete, Get, Inject, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AuthRequest } from '../common/auth.ts';
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
  @Get(':id/workflow') async index(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.index(req, id); }
  @ApiOperation({ summary: 'Akış kurallarını kaydet (ilk tanımda workflow.create, sonrasında workflow.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: workflowBodySchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 200, schema: workflowSchema })
  @Put(':id/workflow') async save(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(saveWorkflowSchema)) body: SaveWorkflowDto) { return this.service.save(req, id, body); }
  @ApiOperation({ summary: 'Akışı kapat: tüm kurallar silinir ve geçişler yeniden serbest kalır (workflow.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, schema: workflowSchema })
  @Delete(':id/workflow') async clear(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.clear(req, id); }
}
