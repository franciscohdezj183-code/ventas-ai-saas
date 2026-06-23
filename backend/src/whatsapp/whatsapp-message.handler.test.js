import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sendBotResultToChat } from './whatsapp-message.handler.js';

function fakeChat() {
  return {
    messages: [],
    async sendMessage(message, options) {
      this.messages.push({ message, options });
    }
  };
}

describe('whatsapp message handler media responses', () => {
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
});
