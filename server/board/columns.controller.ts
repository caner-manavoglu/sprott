import { BadRequestException, Body, Controller, Delete, Inject, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Store, idField, textField } from '../store.ts';
import { type AuthRequest, allow } from '../common/auth.ts';
import { boardSchema, columnSchema, orderSchema, renameColumnSchema } from './board.schemas.ts';

@ApiTags('Sütunlar')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yetki reddedildi.'})
@Controller('api/columns')
export class ColumnsController {
  constructor(@Inject(Store) private store: Store) {}
  /** Sütunlar bir projeye aittir; düzenleme için o projeye yazma izni gerekir. */
  private async scope(req: AuthRequest, projectId: number) {
    return this.store.writable(allow(req, 'project.update'), projectId);
  }
  @ApiOperation({summary: 'Projeye sütun ekle (project.update yetkisi)'})
  @ApiBody({schema: columnSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 201, schema: boardSchema})
  @Post() async add(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    const projectId = await this.scope(req, idField(body.projectId)), name = textField(body.name, 'Sütun adı', 60);
    await this.store.transaction(async client => {
      await client.query('LOCK TABLE columns IN EXCLUSIVE MODE');
      await client.query('INSERT INTO columns(name,position,"projectId") SELECT $1,COALESCE(MAX(position),0)+1,$2 FROM columns WHERE "projectId"=$2', [name, projectId]);
    });
    return this.store.board(projectId);
  }
  // ':id' rotasından önce tanımlı olmalı, yoksa 'order' bir kimlik sanılır.
  @ApiOperation({summary: 'Sütun sırasını kaydet (project.update yetkisi)'})
  @ApiBody({schema: orderSchema})
  @ApiResponse({status: 400, description: 'Projenin her sütunu tam bir kez gönderilmeli.'})
  @ApiResponse({status: 200, schema: boardSchema})
  @Patch('order') async reorder(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    if (!Array.isArray(body.columnIds) || !body.columnIds.length || !body.columnIds.every(id => typeof id === 'number')) throw new BadRequestException('Geçersiz sütun sırası.');
    const ids = body.columnIds.map(idField);
    const projectId = await this.scope(req, await this.store.columnProject(ids[0]));
    await this.store.transaction(async client => {
      await client.query('LOCK TABLE columns IN EXCLUSIVE MODE');
      const existing = (await client.query('SELECT id FROM columns WHERE "projectId"=$1', [projectId])).rows.map(row => row.id);
      if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some(id => !existing.includes(id))) throw new BadRequestException('Projenin her sütununu tam bir kez gönderin. Panoyu yenileyip tekrar deneyin.');
      await client.query('UPDATE columns SET position = ordered.position FROM unnest($1::int[]) WITH ORDINALITY AS ordered(id,position) WHERE columns.id=ordered.id', [ids]);
    });
    return this.store.board(projectId);
  }
  @ApiOperation({summary: 'Sütunun adını değiştir (project.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiBody({schema: renameColumnSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: boardSchema})
  @Patch(':id') async rename(@Req() req: AuthRequest, @Param('id') rawId: string, @Body() body: Record<string, unknown>) {
    const id = idField(rawId), projectId = await this.scope(req, await this.store.columnProject(id));
    const name = textField(body.name, 'Sütun adı', 60);
    if (!(await this.store.db.query('UPDATE columns SET name=$1 WHERE id=$2', [name, id])).rowCount) throw new NotFoundException('Sütun bulunamadı.');
    return this.store.board(projectId);
  }
  @ApiOperation({summary: 'Boş sütunu sil (project.update yetkisi; projenin son sütunu korunur)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: boardSchema})
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') rawId: string) {
    const id = idField(rawId), projectId = await this.scope(req, await this.store.columnProject(id));
    await this.store.transaction(async client => {
      // Serialize deletes so concurrent requests cannot remove the project's final column.
      await client.query('LOCK TABLE columns IN EXCLUSIVE MODE');
      if ((await client.query('SELECT id FROM tasks WHERE "columnId"=$1 LIMIT 1', [id])).rowCount) throw new BadRequestException('Önce bu sütundaki task’ları başka sütuna taşıyın.');
      if (Number((await client.query('SELECT COUNT(*) AS count FROM columns WHERE "projectId"=$1', [projectId])).rows[0].count) <= 1) throw new BadRequestException('Panoda en az bir sütun olmalı.');
      if (!(await client.query('DELETE FROM columns WHERE id=$1', [id])).rowCount) throw new NotFoundException('Sütun bulunamadı.');
    });
    return this.store.board(projectId);
  }
}
