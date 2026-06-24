import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  resetWhatsappMessageOperationsForTests,
  resolveOutgoingChat,
  runCustomerMessageOperation,
  sendBotResultToChat
} from './whatsapp-message.handler.js';

function fakeChat() {
  return {
    messages: [],
    async sendMessage(message, options) {
      this.messages.push({ message, options });
    }
  };
}

describe('whatsapp message handler media responses', () => {
  afterEach(() => {
    resetWhatsappMessageOperationsForTests();
  });

  it('sends product image media with the bot response as caption', async () => {
    const chat = fakeChat();
    const mediaFactory = {
      async fromUrl(url, options) {
        return { kind: 'media', url, options };
      }
    };
    const result = {
      respuesta: '*silla de plastico*\nPrecio: $10,000.00',
      medios: [
        {
          type: 'image',
          url: 'http://localhost:4000/uploads/products/silla.jpg',
          caption: '*silla de plastico*\nPrecio: $10,000.00'
        }
      ]
    };

    const sendResult = await sendBotResultToChat({ chat, result, mediaFactory });

    assert.deepEqual(sendResult, { mediaSent: 1, textSent: false });
    assert.equal(chat.messages.length, 1);
    assert.deepEqual(chat.messages[0].message, {
      kind: 'media',
      url: 'http://localhost:4000/uploads/products/silla.jpg',
      options: { unsafeMime: true }
    });
    assert.equal(chat.messages[0].options.caption, result.respuesta);
  });

  it('falls back to text when image media cannot be loaded', async () => {
    const chat = fakeChat();
    const mediaFactory = {
      async fromUrl() {
        throw new Error('image not found');
      }
    };
    const result = {
      respuesta: '*silla de plastico*\nPrecio: $10,000.00',
      medios: [
        {
          type: 'image',
          url: 'http://localhost:4000/uploads/products/missing.jpg'
        }
      ]
    };

    const sendResult = await sendBotResultToChat({ chat, result, mediaFactory });

    assert.deepEqual(sendResult, { mediaSent: 0, textSent: true });
    assert.deepEqual(chat.messages, [{ message: result.respuesta, options: undefined }]);
  });

  it('falls back to client.sendMessage when getChat fails for a LID message', async () => {
    const sent = [];
    const chat = await resolveOutgoingChat({
      whatsappId: '113950146457660@lid',
      message: {
        async getChat() {
          throw new TypeError("Cannot read properties of undefined (reading 'getChat')");
        }
      },
      client: {
        async sendMessage(to, content, options) {
          sent.push({ to, content, options });
        }
      }
    });

    await chat.sendMessage('Respuesta segura');

    assert.deepEqual(sent, [{
      to: '113950146457660@lid',
      content: 'Respuesta segura',
      options: undefined
    }]);
  });

  it('serializes processing for the same customer to protect context and leads', async () => {
    const events = [];
    let releaseFirst;
    const firstCanFinish = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    const first = runCustomerMessageOperation({
      empresaId: 5,
      phone: '+52 1 220 572 2560',
      operation: async () => {
        events.push('first:start');
        await firstCanFinish;
        events.push('first:end');
      }
    });

    const second = runCustomerMessageOperation({
      empresaId: 5,
      phone: '522205722560',
      operation: async () => {
        events.push('second:start');
        events.push('second:end');
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(events, ['first:start']);

    releaseFirst();
    await Promise.all([first, second]);

    assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('allows different customers to process in parallel', async () => {
    const events = [];
    let releaseFirst;
    const firstCanFinish = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    const first = runCustomerMessageOperation({
      empresaId: 5,
      phone: '5211111111111',
      operation: async () => {
        events.push('first:start');
        await firstCanFinish;
        events.push('first:end');
      }
    });

    const second = runCustomerMessageOperation({
      empresaId: 5,
      phone: '5222222222222',
      operation: async () => {
        events.push('second:start');
        events.push('second:end');
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(events, ['first:start', 'second:start', 'second:end']);

    releaseFirst();
    await Promise.all([first, second]);
  });
});
