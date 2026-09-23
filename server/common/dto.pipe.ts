import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Explicit pipe: works with tsx without relying on emitted decorator metadata. */
export class DtoPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) { }
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map(issue => issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : 'Geçersiz istek gövdesi.'));
    }
    return result.data;
  }
}
