import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.ts';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('.env içinde DATABASE_URL gerekli.');
    const url = new URL(connectionString);
    const schema = url.searchParams.get('schema') || 'public';
    url.searchParams.delete('schema');
    // Raw report queries and generated ORM queries must use the same schema.
    url.searchParams.set('options', `${url.searchParams.get('options') || ''} -c search_path=${schema}`.trim());
    super({
      adapter: new PrismaPg({ connectionString: url.toString(), connectionTimeoutMillis: 5000 }, { schema }),
      transactionOptions: { maxWait: 10000, timeout: 30000 }
    });
  }
  onModuleDestroy() { return this.$disconnect(); }
}
