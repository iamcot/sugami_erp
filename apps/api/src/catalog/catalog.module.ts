import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { ProductsController } from './products.controller.js';
import { ProductEditController } from './product-edit.controller.js';

@Module({ imports: [MediaModule], controllers: [ProductsController, ProductEditController] })
export class CatalogModule {}
