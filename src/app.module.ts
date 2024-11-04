import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FileManagerModule } from './file-manager/file-manager.module';

@Module({
  imports: [FileManagerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
