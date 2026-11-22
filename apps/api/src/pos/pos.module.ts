import { Module } from '@nestjs/common';
import { PosController } from './pos.controller.js';
import { ReceiptsController } from './receipts.controller.js';

@Module({ controllers: [PosController, ReceiptsController] })
export class PosModule {}
