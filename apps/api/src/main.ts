import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = parseInt(process.env.API_PORT ?? "3000", 10);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen(port, host);
  console.log(`API listening on http://${host}:${port}`);
}

bootstrap();
