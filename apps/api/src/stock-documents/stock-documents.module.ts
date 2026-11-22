import { Module } from '@nestjs/common';
import { StockDocumentsController } from './stock-documents.controller.js';

@Module({ controllers: [StockDocumentsController] })
export class StockDocumentsModule {}
