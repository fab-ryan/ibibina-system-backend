import {
  I18nModule as I18nModuleBase,
  AcceptLanguageResolver,
  QueryResolver,
  HeaderResolver,
  CookieResolver,
} from 'nestjs-i18n';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    I18nModuleBase.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        global: true,
        fallbackLanguage: configService.getOrThrow('FALLBACK_LANGUAGE', 'kin'),
        loaderOptions: {
          path: path.join(__dirname, '../../i18n/'),
          watch: configService.get('I18N_WATCH'),
        },
        logging: configService.get('I18N_LOGGING'),
        typesOutputPath: path.join(
          process.cwd(),
          'src/common/constants/i18n.generated.ts',
        ),
      }),
      resolvers: [
        {
          use: QueryResolver,
          options: ['lang'],
        },
        new HeaderResolver(['x-lang']),
        new CookieResolver(),
        AcceptLanguageResolver,
      ],
      inject: [ConfigService],
    }),
  ],
})
export class I18nModule {}
