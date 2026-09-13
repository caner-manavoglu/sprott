import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { resolve } from 'node:path';
import { AppModule } from './app.module.ts';
import { Store } from './store.ts';
import { sessionMiddleware } from './common/session.middleware.ts';

export async function createApp() {
  const app = await NestFactory.create(AppModule, {logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log']});
  app.useGlobalPipes({transform(value, metadata) {
    if (metadata.type === 'body' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new BadRequestException('Geçersiz istek gövdesi.');
    return value;
  }});
  app.use('/api', sessionMiddleware(app.get(Store)));
  const config = new DocumentBuilder()
    .setTitle('Sprott REST API')
    .setDescription('Önce POST /api/login üzerinden giriş yapın, dönen "token" değerini sağ üstteki Authorize düğmesine yapıştırın. Token’sız istekler 401 döner. Yönetici işlemleri açıklamalarda belirtilmiştir.')
    .setVersion('0.1.0')
    .addBearerAuth({type: 'http', scheme: 'bearer', bearerFormat: 'opaque', description: 'POST /api/login yanıtındaki token.'}, 'bearer')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config, {autoTagControllers: false}), {
    jsonDocumentUrl: 'api/docs-json', swaggerOptions: {persistAuthorization: true},
  });
  app.use(express.static(resolve('dist')));
  // SPA: /dashboard, /projeler/12 gibi derin bağlantılar yenilendiğinde de arayüz döner.
  app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
    if (request.method !== 'GET' || request.path.startsWith('/api')) return next();
    response.sendFile(resolve('dist/index.html'), error => {if (error) next();});
  });
  app.enableShutdownHooks();
  return app;
}
if (process.env.NODE_ENV !== 'test') { const app = await createApp(); await app.listen(Number(process.env.PORT || 3000), '127.0.0.1'); }
