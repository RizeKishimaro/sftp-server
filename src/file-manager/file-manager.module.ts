import { Module } from '@nestjs/common';
import { FileManagerService } from './file-manager.service';
import { FileManagerGateway } from './file-manager.gateway';

@Module({
  providers: [FileManagerGateway, FileManagerService],
})
export class FileManagerModule {}
