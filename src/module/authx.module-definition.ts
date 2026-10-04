import { ConfigurableModuleBuilder } from '@nestjs/common';

import { AuthxModuleOptions } from './options.js';

export const {
  ConfigurableModuleClass: AuthxConfigurableModule,
  MODULE_OPTIONS_TOKEN: AUTHX_MODULE_OPTIONS,
  OPTIONS_TYPE: AUTHX_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: AUTHX_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<AuthxModuleOptions>()
  .setClassMethodName('forRoot')
  .setExtras({ isGlobal: true }, (definition, extras) => ({ ...definition, global: extras.isGlobal }))
  .build();
