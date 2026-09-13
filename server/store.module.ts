import { Global, Module } from '@nestjs/common';
import { Store } from './store.ts';

/** Tek bir PostgreSQL havuzu tüm modüllerce paylaşılır. */
@Global() @Module({providers: [Store], exports: [Store]}) export class StoreModule {}
