import { ResponseDto } from '@/common/dto';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export class SwaggerConfig {
  public static readonly TITLE = 'API Ibibina';
  public static readonly DESCRIPTION = 'API documentation for the Ibibina application';
  public static readonly VERSION = '1.0.0';
  public static readonly TAGS = ['Authentication', 'Users', 'Setup'];
  public static readonly BEARER_AUTH_NAME = 'Bearer';
  public static readonly BEARER_AUTH_DESCRIPTION =
    'Enter your JWT token to access protected endpoints';
  public static readonly PATH = 'docs';

  public static readonly bearerAuth = {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  };

  public static configuration() {
    return {
      swagger: '2.0',
      info: {
        title: this.TITLE,
        description: this.DESCRIPTION,
        version: this.VERSION,
      },
      basePath: `/${this.PATH}`,
      securityDefinitions: {
        bearerAuth: this.bearerAuth,
      },
    };
  }

  public static documentBuilder(app: INestApplication<any>) {
    const swaggerDocument = new DocumentBuilder()
      .setTitle(this.TITLE)
      .setDescription(this.DESCRIPTION)
      .setVersion(this.VERSION)
      .setContact(this.DESCRIPTION, '', '')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      })
      .addGlobalParameters({
        in: 'header',
        name: 'x-lang',
        required: false,
        description: 'Language en,fr,kin,.....',
        schema: {
          type: 'string',
          default: 'en',
        },
      })
      .build();

    const document = SwaggerModule.createDocument(app, swaggerDocument, {
      ignoreGlobalPrefix: false,
      extraModels: [ResponseDto],
    });
    SwaggerModule.setup(this.PATH, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }
}
