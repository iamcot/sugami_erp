import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { StorageService } from './storage.service.js';

@Module({ controllers: [MediaController], providers: [StorageService], exports: [StorageService] })
export class MediaModule {}
