import { Module } from '@nestjs/common';
import { PancakeController } from './pancake.controller.js';

@Module({ controllers: [PancakeController] })
export class PancakeModule {}
