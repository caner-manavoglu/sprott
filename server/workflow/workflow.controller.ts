import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Store, idField } from '../store.ts';
import { type AuthRequest, allow } from '../common/auth.ts';
import { workflowBodySchema, workflowSchema } from './workflow.schemas.ts';

type Transition = {fromColumnId: number; toColumnId: number};

@ApiTags('Akış kuralları')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yetki reddedildi.'})
@Controller('api/projects')
export class WorkflowController {
  constructor(@Inject(Store) private store: Store) {}
  private async current(projectId: number): Promise<Transition[]> {
    return (await this.store.db.query(
      'SELECT "fromColumnId","toColumnId" FROM workflow_transitions WHERE "projectId"=$1', [projectId])).rows;
  }
  /** Gövdeden gelen çiftler: projeye ait sütunlar olmalı, aynı sütuna geçiş anlamsız olduğu için atılır. */
  private async pairs(projectId: number, value: unknown): Promise<Transition[]> {
    if (!Array.isArray(value)) throw new BadRequestException('Akış kuralları listesi geçersiz.');
    const columnIds = (await this.store.db.query('SELECT id FROM columns WHERE "projectId"=$1', [projectId])).rows.map(row => row.id as number);
    const seen = new Set<string>(), pairs: Transition[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') throw new BadRequestException('Akış kuralları listesi geçersiz.');
      const fromColumnId = idField((item as Transition).fromColumnId), toColumnId = idField((item as Transition).toColumnId);
      if (!columnIds.includes(fromColumnId) || !columnIds.includes(toColumnId)) throw new BadRequestException('Akış kuralı yalnızca projenin sütunları arasında tanımlanabilir.');
      if (fromColumnId === toColumnId) continue;
      const key = `${fromColumnId}-${toColumnId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({fromColumnId, toColumnId});
    }
    return pairs;
  }
  @ApiOperation({summary: 'Projenin akış kuralları (workflow.view yetkisi); boş liste "kural yok, tüm geçişler serbest" demektir'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 200, schema: workflowSchema})
  @Get(':id/workflow') async index(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = allow(req, 'workflow.view');
    const projectId = await this.store.reachable(user, idField(id));
    const transitions = await this.current(projectId);
    return {enabled: transitions.length > 0, transitions};
  }
  @ApiOperation({summary: 'Akış kurallarını kaydet (ilk tanımda workflow.create, sonrasında workflow.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiBody({schema: workflowBodySchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 200, schema: workflowSchema})
  @Put(':id/workflow') async save(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    // İlk kez kural yazmak "oluşturma", var olanı değiştirmek "güncelleme" yetkisine bağlıdır.
    const projectId = idField(id);
    const exists = (await this.store.db.query('SELECT 1 FROM workflow_transitions WHERE "projectId"=$1 LIMIT 1', [projectId])).rowCount;
    const user = allow(req, exists ? 'workflow.update' : 'workflow.create');
    await this.store.reachable(user, projectId);
    const pairs = await this.pairs(projectId, body.transitions);
    if (!pairs.length) throw new BadRequestException('En az bir geçiş seçmelisiniz. Kuralları tamamen kaldırmak için akışı kapatın.');
    await this.store.transaction(async client => {
      await client.query('DELETE FROM workflow_transitions WHERE "projectId"=$1', [projectId]);
      for (const pair of pairs) await client.query(
        'INSERT INTO workflow_transitions("projectId","fromColumnId","toColumnId") VALUES($1,$2,$3)',
        [projectId, pair.fromColumnId, pair.toColumnId],
      );
    });
    return {enabled: true, transitions: await this.current(projectId)};
  }
  @ApiOperation({summary: 'Akışı kapat: tüm kurallar silinir ve geçişler yeniden serbest kalır (workflow.delete yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 200, schema: workflowSchema})
  @Delete(':id/workflow') async clear(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = allow(req, 'workflow.delete');
    const projectId = await this.store.reachable(user, idField(id));
    await this.store.db.query('DELETE FROM workflow_transitions WHERE "projectId"=$1', [projectId]);
    return {enabled: false, transitions: []};
  }
}
