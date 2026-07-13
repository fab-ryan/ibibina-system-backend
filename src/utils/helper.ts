import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { isIn } from 'class-validator';
import * as path from 'path';
import * as fs from 'fs';
import { memoryStorage, diskStorage } from 'multer';

export interface AssociativeArray {
  [key: string]: string | boolean | number;
}

export const filterQueryBuilderFromRequest = <T extends ObjectLiteral>(
  q: SelectQueryBuilder<T>,
  filters?: AssociativeArray,
) => {
  if (filters) {
    const keys = Object.keys(filters);

    const alias = q.alias;

    for (const key of keys) {
      const value = filters[key];

      if (isIn(key, ['limit', 'offset', 'page'])) continue;

      if (key === 'from') {
        q.andWhere(`${alias}.createdAt >= '${value}'`);
        continue;
      }
      if (key === 'to') {
        q.andWhere(`${alias}.createdAt <= '${value}'`);
        continue;
      }
    }
  }
};

export const multerOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: Express.Multer.File, callback: any) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
      return callback(new Error('Only image files are allowed!'), false);
    }
    callback(null, true);
  },
};

export const localDocumentMulterOptions = (dir = 'documents') => {
  return {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', dir);
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const fileName = file.originalname.split('.')[0];
        const date = new Date().toISOString().split('T')[0];
        const filename = `${fileName}-${date}${ext}`;
        cb(null, filename);
      },
    }),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit for documents
    },

    // fileFilter: (req: any, file: Express.Multer.File, callback: any) => {
    //   if (!file.originalname.match(/\.(pdf|doc|docx|jpg|jpeg|png|gif|webp)$/)) {
    //     return callback(new Error('Only PDF, DOC, DOCX, JPG, JPEG, PNG, GIF, and WEBP files are allowed'), false);
    //   }
    //   callback(null, true);
    // },
  };
};
