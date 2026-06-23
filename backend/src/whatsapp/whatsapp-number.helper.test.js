import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractPhoneFromWhatsappId,
  getRealCustomerPhone,
  normalizeMexicanPhoneNumber
} from './whatsapp-number.helper.js';

describe('whatsapp number helper', () => {
  it('normalizes Mexican phone numbers without breaking other countries', () => {
    assert.equal(normalizeMexicanPhoneNumber('+52 1 729 834 9854'), '+527298349854');
    assert.equal(normalizeMexicanPhoneNumber('+5217298349854'), '+527298349854');
    assert.equal(normalizeMexicanPhoneNumber('5217298349854'), '527298349854');
    assert.equal(normalizeMexicanPhoneNumber('7298349854'), '7298349854');
    assert.equal(normalizeMexicanPhoneNumber('+1 555 123 4567'), '+15551234567');
  });

  it('extracts phone numbers from WhatsApp ids', () => {
    assert.equal(extractPhoneFromWhatsappId('5217298349854@c.us'), '527298349854');
    assert.equal(extractPhoneFromWhatsappId('7298349854@c.us'), '7298349854');
  });

  it('uses chat.name when it starts with plus', async () => {
    const phone = await getRealCustomerPhone({
      client: {},
      msg: {
        from: '5211111111111@c.us',
        getChat: async () => ({ name: '+52 1 729 834 9854' }),
        getContact: async () => ({ number: '5210000000000' })
      }
    });

    assert.equal(phone, '+527298349854');
  });

  it('uses message contact number when chat.name is not useful', async () => {
    const phone = await getRealCustomerPhone({
      client: {},
      msg: {
        from: '5211111111111@c.us',
        getChat: async () => ({ name: 'Cliente' }),
        getContact: async () => ({ number: '5217298349854' })
      }
    });

    assert.equal(phone, '527298349854');
  });

  it('uses client.getContactById when message contact fails', async () => {
    const phone = await getRealCustomerPhone({
      client: {
        getContactById: async () => ({ number: '5217298349854' })
      },
      msg: {
        from: '5211111111111@c.us',
        getChat: async () => ({ name: 'Cliente' }),
        getContact: async () => {
          throw new Error('contact unavailable');
        }
      }
    });

    assert.equal(phone, '527298349854');
  });

  it('falls back to msg.from when everything else fails', async () => {
    const phone = await getRealCustomerPhone({
      client: {
        getContactById: async () => {
          throw new Error('contact unavailable');
        }
      },
      msg: {
        from: '5217298349854@c.us',
        getChat: async () => {
          throw new Error('chat unavailable');
        },
        getContact: async () => {
          throw new Error('contact unavailable');
        }
      }
    });

    assert.equal(phone, '527298349854');
  });
});
