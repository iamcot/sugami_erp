import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller.js';

@Module({ controllers: [ListingsController] })
export class ListingsModule {}
