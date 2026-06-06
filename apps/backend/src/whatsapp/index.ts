/**
 * WhatsApp bot — public surface for the rest of the backend.
 *
 * Wire-up (when NestJS modules are back):
 *
 *   @Controller('whatsapp/webhook')
 *   class WhatsAppWebhookController {
 *     @Get()
 *     verify(@Query() q: VerifyParams) {
 *       const r = verifyWebhook(q);
 *       res.status(r.status).send(r.body);
 *     }
 *     @Post()
 *     async receive(@Body() body: MetaWebhookEvent) {
 *       await handleWebhook(body);
 *       return { ok: true };
 *     }
 *   }
 */

export { engine, ConversationEngine } from './engine';
export { sender, WhatsAppSender } from './sender';
export { handleWebhook, verifyWebhook } from './webhook';
export { sessionStore, InMemorySessionStore } from './session-store';
export { TEMPLATES, renderTemplate } from './templates';
export type {
  ConversationState,
  FlowName,
  InboundMessage,
  OutboundAction,
  BotRepos,
} from './types';
