import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { ProductsController } from './products.controller.js';

@Module({ imports: [MediaModule], controllers: [ProductsController] })
export class CatalogModule {}
