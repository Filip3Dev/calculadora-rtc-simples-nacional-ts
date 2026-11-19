import { Module } from "@nestjs/common";
import { SimplesNacionalController } from "./simples-nacional.controller.js";
import { AtividadesController } from "./atividades.controller.js";
import { VersaoController } from "./versao.controller.js";
import { HeadersInterceptor } from "./headers.interceptor.js";

@Module({
  controllers: [SimplesNacionalController, AtividadesController, VersaoController],
  providers: [{ provide: HeadersInterceptor, useClass: HeadersInterceptor }],
})
export class AppModule {}
