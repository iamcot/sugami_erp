import { Module } from '@nestjs/common';
import { PurchasingController } from './purchasing.controller.js';

@Module({ controllers: [PurchasingController] })
export class PurchasingModule {}
