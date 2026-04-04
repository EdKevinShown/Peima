import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

function collectExpressRouteLines(stack: unknown, prefix = ""): string[] {
  if (!Array.isArray(stack)) {
    return [];
  }
  const out: string[] = [];
  for (const layer of stack as { route?: { path?: string; methods?: Record<string, boolean> }; handle?: { stack?: unknown }; name?: string }[]) {
    if (layer.route?.path && layer.route.methods) {
      const methods = Object.keys(layer.route.methods).filter(
        (m) => layer.route!.methods![m],
      );
      for (const m of methods) {
        out.push(`${m.toUpperCase()} ${prefix}${layer.route.path}`);
      }
    }
    if (layer.handle && typeof layer.handle === "object" && "stack" in layer.handle) {
      out.push(...collectExpressRouteLines((layer.handle as { stack?: unknown }).stack, prefix));
    }
  }
  return out;
}

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

  if (process.env.API_LOG_ROUTES === "1") {
    try {
      const expressApp = app.getHttpAdapter().getInstance() as {
        _router?: { stack?: unknown };
      };
      const lines = collectExpressRouteLines(expressApp._router?.stack);
      const hits = lines.filter(
        (l) =>
          l.includes("/timeline") ||
          l.includes("/insights") ||
          l.includes("conversations/:conversationId"),
      );
      console.log(
        `[routes] matching timeline/copilot/conversations param (${hits.length} lines):\n${hits.join("\n")}`,
      );
    } catch {
      console.warn("[routes] could not enumerate express stack");
    }
  }
}

bootstrap();
