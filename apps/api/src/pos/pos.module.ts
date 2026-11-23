import { Module } from '@nestjs/common';
import { ShippingModule } from '../shipping/shipping.module.js';
import { PosController } from './pos.controller.js';
import { ReceiptsController } from './receipts.controller.js';

@Module({ imports: [ShippingModule], controllers: [PosController, ReceiptsController] })
export class PosModule {}
