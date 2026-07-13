import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Transaction } from './entities/transaction.entity';
import { TransactionRepository } from './repositories/transaction.repository';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { PaymentService } from '@/common/services/payment.service';
import { Contribution } from '@/modules/contributions/entities/contribution.entity';
import { Penalty } from '@/modules/penalties/entities/penalty.entity';
import { Loan } from '../loans/entities';

const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'references');

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Contribution, Penalty, Loan]),
    MulterModule.register({
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          cb(null, uploadsDir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname);
          cb(null, `${crypto.randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  ],
  controllers: [TransactionsController],
  providers: [TransactionRepository, TransactionsService, PaymentService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
